import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn-image.getir.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cdn.getir.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "vsrm-cdn.erp.getirapi.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
