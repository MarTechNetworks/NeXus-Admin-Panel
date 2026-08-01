#!/bin/bash
# Zero-downtime admin-console deployment for the Nexus VPS.
# Usage: ./deploy-zero-downtime.sh <image>
# Example: ./deploy-zero-downtime.sh ghcr.io/martechnetworks/nexus-admin:<sha>
#
# Sibling of Frontend/deploy-zero-downtime.sh, and deliberately near-identical to
# it: the disk-hygiene half is the same code, so a fix found in one is obviously
# portable to the other. Keep them in step.
#
# What this replaces: the workflow used to run `docker compose stop admin && rm
# -f && up -d`, which is a hard outage for however long the new image takes to
# boot (~15-30s), and `docker image prune -f`, which only ever removes *dangling*
# images and so reclaimed nothing at all from a repo whose tags are all named.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ $# -ne 1 ]; then
    echo -e "${RED}Usage: $0 <image>${NC}"
    exit 1
fi

NEW_IMAGE=$(echo "$1" | tr '[:upper:]' '[:lower:]')

CONTAINER=nexus-admin
NETWORK=${NETWORK:-martech-network}
UPSTREAM_FILE=${UPSTREAM_FILE:-/etc/nginx/conf.d/nexus-admin-upstream.conf}

# Optional. The console is a pure client-side caller of the public API and every
# value it needs is a NEXT_PUBLIC_* baked in at image build time (see
# admin/Dockerfile), so there is normally nothing to inject at runtime. Honoured
# if the file exists so a one-off override does not require editing this script.
ENV_FILE=${ENV_FILE:-/var/www/nexus-admin/.env}

# Resource ceiling, carried over from docker-compose.production.yml. Dropping it
# when moving off compose would be a silent regression: this box also runs the
# backend, Postgres, Redis, IPFS and the public frontend.
MEMORY_LIMIT=${MEMORY_LIMIT:-512m}
CPU_LIMIT=${CPU_LIMIT:-0.5}

# How many tagged images per repo to retain after a successful deploy. This is a
# disk budget, not a preference: two is the live image plus one rollback target.
KEEP_IMAGES=${KEEP_IMAGES:-2}

# Free space, in GB, the pull must have before it is allowed to start. A pull
# writes the compressed layers and then extracts them, so the peak is well above
# what the new layers finally occupy.
MIN_FREE_GB=${MIN_FREE_GB:-2}

# Registry namespace this host deploys. Reclaim sweeps every repo under it, not
# only the one being deployed: backend, frontend and admin share this
# filesystem, so surplus frontend images are just as able to wedge an admin
# deploy as its own.
MANAGED_IMAGE_PREFIX=${MANAGED_IMAGE_PREFIX:-ghcr.io/martechnetworks}

# Host-wide deploy lock.
#
# GitHub Actions scopes `concurrency` per repository, and this box takes
# backend, frontend and admin deploys. When one pipeline reaches its image
# cleanup while another is mid `docker pull`, containerd's GC can collect the
# lease protecting the incoming, still-untagged layers and the pull dies with
# `lease does not exist: not found`. The lock lives on the host because the host
# is the only thing the pipelines share -- it is worthless unless they ALL take
# the same path, so this file name must match the frontend script's exactly.
LOCK_FILE=${LOCK_FILE:-/var/lock/nexus-deploy.lock}
LOCK_WAIT=${LOCK_WAIT:-900}

exec 9>"$LOCK_FILE" || { echo -e "${RED}Error: cannot open $LOCK_FILE${NC}"; exit 1; }
echo -e "${YELLOW}Acquiring host deploy lock...${NC}"
if ! flock -w "$LOCK_WAIT" 9; then
    echo -e "${RED}✗ Timed out after ${LOCK_WAIT}s waiting for another deploy${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Deploy lock acquired${NC}"

# ---------------------------------------------------------------- disk hygiene

# Bytes available on the filesystem holding the image store. `docker info`
# reports /var/lib/docker, but a host on the containerd snapshotter extracts
# layers into /var/lib/containerd. /var/lib covers both.
free_bytes() {
    df -B1 --output=avail /var/lib 2>/dev/null | tail -1
}

human_gb() {
    awk -v b="${1:-0}" 'BEGIN { printf "%.1fGB", b / 1073741824 }'
}

# Every image ID a container still points at. Matching on the tag string alone
# is not enough: a container created from a tag that has since been re-pointed
# still pins the old ID.
in_use_image_ids() {
    docker ps -a -q | xargs -r docker inspect --format '{{.Image}}' 2>/dev/null | sort -u
}

# Tags of $repo, newest first.
#
# Explicitly NOT `docker images`' default order. That sorts on the image's
# *created* timestamp, which is not trustworthy -- consecutive tags can carry
# identical timestamps and come back in either order. A keep-N cut on that is a
# coin flip that can retain the older image and delete the newer one.
#
# These tags are commit SHAs, which carry no ordering, so fall back to the
# image's creation time only as a tiebreak and never let `latest` be surplus.
repo_tags_newest_first() {
    docker images "$1" --format '{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}' \
        | grep -v '^<none>' \
        | while IFS=$'\t' read -r tag id created; do
            case "$tag" in
                latest) printf '9999-99-99\t%s:%s\n' "$1" "$tag" ;;
                *)      printf '%s\t%s:%s\n' "$created" "$1" "$tag" ;;
            esac
        done \
        | sort -k1,1r \
        | cut -f2
}

# Image IDs of the surplus tags of $repo -- everything outside the newest $keep.
surplus_image_ids() {
    local repo="$1" keep="$2"
    repo_tags_newest_first "$repo" \
        | tail -n +"$((keep + 1))" \
        | while read -r ref; do
            docker image inspect --format '{{.Id}}' "$ref" 2>/dev/null
        done
}

# Drop all but the newest $keep tags of $repo, skipping any image a container
# still references -- the live container and the idle rollback target.
#
# `docker image prune -f` only ever removed *dangling* images. Every tag here is
# a named SHA, so it reclaims nothing while still triggering the containerd GC
# sweep that races concurrent pulls. Remove named tags instead.
cleanup_old_images() {
    local repo="$1"
    local keep="${2:-2}"
    local in_use_ids
    in_use_ids=$(in_use_image_ids)

    # Same ordering as surplus_image_ids, and it has to stay that way: if the two
    # disagree about which tags are surplus, release_stale_pins can drop a
    # container guarding an image this then decides to keep.
    repo_tags_newest_first "$repo" \
        | tail -n +"$((keep + 1))" \
        | while read -r ref; do
            local id
            id=$(docker image inspect --format '{{.Id}}' "$ref" 2>/dev/null)
            if [ -n "$id" ] && printf '%s\n' "$in_use_ids" | grep -qxF "$id"; then
                echo -e "  ${YELLOW}pinned by a container, kept: $ref${NC}"
            elif docker rmi "$ref" >/dev/null 2>&1; then
                echo -e "  ${GREEN}removed: $ref${NC}"
            else
                echo -e "  ${YELLOW}skipped: $ref${NC}"
            fi
        done
}

# Remove stopped containers that pin an image we are trying to drop anyway.
#
# cleanup_old_images refuses to remove any image a container references, and
# nothing in the pipeline ever removes a stopped container -- so one leftover
# pins its whole image forever and permanently shrinks the disk budget.
#
# The keep-N window is the safety rule that makes this safe to automate. A
# stopped container whose image is still retained is the rollback target and is
# left strictly alone. Only one pinning an image already outside the window is
# removed: it has nothing left to roll back to, because the image it needs is
# being deleted in the very next step. Running containers are never considered.
release_stale_pins() {
    local repo="$1" keep="$2"
    local surplus_ids
    surplus_ids=$(surplus_image_ids "$repo" "$keep")
    [ -n "$surplus_ids" ] || return 0

    docker ps -a --filter status=exited --filter status=created --filter status=dead \
              --format '{{.ID}} {{.Names}}' \
        | while read -r cid cname; do
            local id
            id=$(docker inspect --format '{{.Image}}' "$cid" 2>/dev/null) || continue
            if printf '%s\n' "$surplus_ids" | grep -qxF "$id" \
               && docker rm -f "$cid" >/dev/null 2>&1; then
                echo -e "  ${GREEN}removed stopped container pinning a dropped image: $cname${NC}"
            fi
        done
}

# Free space without touching anything a *running* container references. Safe to
# call at any point, including before the pull -- every stage is a no-op when
# there is nothing to take.
#
# Pass "aggressive" to also break stale pins and sweep unmanaged images. That
# escalation only runs when the alternative is refusing to deploy at all, so it
# is deliberately not the default for the routine post-deploy tidy.
reclaim_disk() {
    local aggressive="${1:-}"
    echo -e "${YELLOW}Reclaiming disk (before: $(human_gb "$(free_bytes)") free)...${NC}"

    # Untagged leftovers and the buildx cache. Nothing depends on either.
    docker image prune -f >/dev/null 2>&1 || true
    docker builder prune -f >/dev/null 2>&1 || true

    # Surplus tags of every repo this host deploys, not just the one being
    # deployed now. All three pipelines share this filesystem and the host lock
    # above serialises them, so it is safe for whichever runs to tidy the rest.
    local repo
    for repo in $(docker images --format '{{.Repository}}' \
                    | grep -F "$MANAGED_IMAGE_PREFIX/" | sort -u); do
        # `if`, not `[ ... ] && ...`: under `set -e` a bare AND-list that fails
        # its test exits the whole script.
        if [ -n "$aggressive" ]; then
            release_stale_pins "$repo" "$KEEP_IMAGES"
        fi
        cleanup_old_images "$repo" "$KEEP_IMAGES"
    done

    if [ -n "$aggressive" ]; then
        journalctl --vacuum-size=200M >/dev/null 2>&1 || true

        # Unreferenced images from OUTSIDE the managed namespace: a base image
        # left behind by a manual build, a stale buildkit.
        #
        # Deliberately NOT `docker image prune -a -f`. A retained keep-N image
        # has no container attached by definition -- that is the entire point of
        # retaining it -- so a blanket -a prune removes precisely what
        # KEEP_IMAGES exists to protect. Managed repos are governed by
        # cleanup_old_images above and nothing else.
        local unref_in_use ref id
        unref_in_use=$(in_use_image_ids)
        docker images --format '{{.Repository}}:{{.Tag}}' \
            | grep -v '^<none>' | grep -v ':<none>$' \
            | grep -v "^$MANAGED_IMAGE_PREFIX/" \
            | while read -r ref; do
                id=$(docker image inspect --format '{{.Id}}' "$ref" 2>/dev/null) || continue
                if [ -n "$id" ] && printf '%s\n' "$unref_in_use" | grep -qxF "$id"; then
                    continue
                fi
                if docker rmi "$ref" >/dev/null 2>&1; then
                    echo -e "  ${GREEN}removed unreferenced image: $ref${NC}"
                fi
            done
    fi

    echo -e "${GREEN}✓ Reclaim done (after: $(human_gb "$(free_bytes)") free)${NC}"
}

# Refuse to start a pull that cannot fit.
#
# Cleanup used to run only on the last line of a *successful* deploy, while the
# pull is step 1. So the first deploy too big to fit dies at the pull and never
# reaches cleanup -- and so does every deploy after it. The disk can never
# recover on its own. Reclaiming before the pull breaks that cycle; failing here
# rather than mid-extract leaves the running container untouched.
ensure_disk_space() {
    local need=$((MIN_FREE_GB * 1073741824))
    local avail
    avail=$(free_bytes)

    if [ "${avail:-0}" -ge "$need" ]; then
        echo -e "${GREEN}✓ Disk OK ($(human_gb "$avail") free, need ${MIN_FREE_GB}GB)${NC}"
        return 0
    fi

    echo -e "${YELLOW}Only $(human_gb "$avail") free, need ${MIN_FREE_GB}GB${NC}"
    reclaim_disk aggressive
    avail=$(free_bytes)
    [ "${avail:-0}" -ge "$need" ] && return 0

    echo -e "${RED}✗ Still only $(human_gb "$avail") free after reclaim - aborting before the pull${NC}"
    echo -e "${RED}  Nothing has changed; the current container is still serving.${NC}"
    echo -e "${YELLOW}  Everything left is pinned by a RUNNING container, which reclaim will${NC}"
    echo -e "${YELLOW}  never touch. Current holders:${NC}"
    docker ps -a --format '    {{.Names}}  ->  {{.Image}}  ({{.Status}})'
    return 1
}

pull_with_retry() {
    local image="$1" attempt=1 max=3
    while true; do
        if docker pull "$image"; then
            return 0
        fi
        if [ "$attempt" -ge "$max" ]; then
            echo -e "${RED}✗ Pull failed after $max attempts${NC}"
            return 1
        fi
        echo -e "${YELLOW}Pull failed (attempt $attempt/$max), retrying in $((attempt * 10))s...${NC}"
        sleep $((attempt * 10))
        attempt=$((attempt + 1))
    done
}

# Reclaim on the way out of a *failed* deploy too. A failure still leaves the
# freshly pulled image on disk, and that used to sit there until the next
# successful run -- which is precisely how a box wedges: once it is full no run
# can succeed and nothing ever cleans up again.
on_exit() {
    local rc=$?
    # DOCKER_ENV is a decrypted copy of the host env file; scrub it however we exit.
    if [ -n "${DOCKER_ENV:-}" ]; then rm -f "$DOCKER_ENV"; fi
    if [ "$rc" -ne 0 ]; then
        echo -e "${YELLOW}Deploy failed - reclaiming so this run's image does not block the next one...${NC}"
        reclaim_disk aggressive || true
    fi
}
trap on_exit EXIT

# ------------------------------------------------------------------- the swap

# Alternate between 3020 and 3030 each deploy (true blue-green). The container
# always listens on 3000 internally; it is the published HOST port that flips,
# which is why this reads the port map rather than a PORT env var the way the
# frontend script does.
LIVE_PORT=$(docker port "$CONTAINER" 3000/tcp 2>/dev/null | head -1 | sed 's/.*://' || true)
LIVE_PORT=${LIVE_PORT:-3020}
if [ "$LIVE_PORT" = "3020" ]; then STANDBY_PORT=3030; else STANDBY_PORT=3020; fi

echo -e "${GREEN}=== Zero-Downtime Admin Deployment ===${NC}"
echo -e "${YELLOW}Image: $NEW_IMAGE${NC}"
echo -e "${YELLOW}Live port: $LIVE_PORT  Standby port: $STANDBY_PORT${NC}"

echo -e "${YELLOW}[1/5] Pulling image...${NC}"
ensure_disk_space
pull_with_retry "$NEW_IMAGE"

echo -e "${YELLOW}[2/5] Starting new container on standby port $STANDBY_PORT...${NC}"

# The env file is optional here (see ENV_FILE above), so build the docker run
# arguments in an array rather than interpolating a possibly-empty --env-file.
ENV_ARGS=()
if [ -f "$ENV_FILE" ]; then
    DOCKER_ENV=$(mktemp)   # removed by on_exit
    grep -v '^#' "$ENV_FILE" | grep -v '^$' \
        | sed "s/^export //; s/='\(.*\)'$/=\1/; s/=\"\(.*\)\"$/=\1/" > "$DOCKER_ENV"
    ENV_ARGS=(--env-file "$DOCKER_ENV")
    echo -e "${YELLOW}Using runtime env file $ENV_FILE${NC}"
fi

docker rm -f "$CONTAINER-new" 2>/dev/null || true
# 127.0.0.1 in the publish spec, not a bare port: nginx is the only thing that
# should be able to reach the console, and a bare `-p 3030:3000` would publish it
# on every interface. This is why the container is NOT on --network host the way
# the frontend's is -- host networking cannot bind to loopback only.
docker run -d \
    --name "$CONTAINER-new" \
    --restart no \
    --network "$NETWORK" \
    -p "127.0.0.1:$STANDBY_PORT:3000" \
    --memory "$MEMORY_LIMIT" \
    --cpus "$CPU_LIMIT" \
    "${ENV_ARGS[@]}" \
    --health-cmd="wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/login || exit 1" \
    --health-interval=30s \
    --health-timeout=10s \
    --health-retries=3 \
    --health-start-period=30s \
    "$NEW_IMAGE"

echo -e "${YELLOW}[3/5] Health checking new container...${NC}"
# /login, not /: the root route redirects when there is no session, and a probe
# that accepts a 3xx would pass against a console whose app shell is broken.
HEALTHY=false
for i in $(seq 1 20); do
    if curl -sf --max-time 3 "http://127.0.0.1:$STANDBY_PORT/login" >/dev/null 2>&1; then
        HEALTHY=true
        break
    fi
    echo "Attempt $i/20 failed, retrying in 3s..."
    sleep 3
done

if [ "$HEALTHY" != "true" ]; then
    docker logs "$CONTAINER-new" --tail 50
    docker rm -f "$CONTAINER-new"
    echo -e "${RED}✗ New container failed - old container still serving on port $LIVE_PORT${NC}"
    exit 1
fi

echo -e "${YELLOW}[4/5] Switching traffic (zero downtime)...${NC}"
printf 'upstream nexus_admin {\n    server 127.0.0.1:%s;\n    keepalive 32;\n}\n' "$STANDBY_PORT" > "$UPSTREAM_FILE"
# Validate before reloading: a bad upstream file used to be discovered by nginx
# refusing to reload, after the old container was already on its way out.
nginx -t
nginx -s reload

echo -e "${YELLOW}[5/5] Retiring old container...${NC}"
docker stop "$CONTAINER" 2>/dev/null || true
docker rm "$CONTAINER" 2>/dev/null || true
docker rename "$CONTAINER-new" "$CONTAINER"
docker update --restart unless-stopped "$CONTAINER"

echo -e "${GREEN}✓ Admin console live on port $STANDBY_PORT${NC}"

echo -e "${YELLOW}Cleaning up old Docker images (keeping newest $KEEP_IMAGES per repo)...${NC}"
reclaim_disk
echo -e "${GREEN}=== Deployment Complete ===${NC}"
