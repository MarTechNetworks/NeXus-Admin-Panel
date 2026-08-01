import type { MetadataRoute } from 'next'

// Admin dashboard: disallow every crawler so it is never listed in any
// search engine or search console.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  }
}
