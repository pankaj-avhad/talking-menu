import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Photos in data/menu.json come from DoorDash's image CDN.
      { protocol: "https", hostname: "img.cdn4dd.com" },
      // Stand-ins for items without a photo (data/fallback-images.json).
      {
        protocol: "https",
        hostname: "images.pexels.com",
        pathname: "/photos/**",
      },
    ],
  },
  async redirects() {
    // The menu is the only page so far.
    return [{ source: "/", destination: "/menu", permanent: false }]
  },
}

export default nextConfig
