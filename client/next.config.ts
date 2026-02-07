import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: ["via.placeholder.com", "lh3.googleusercontent.com", "cdn-icons-png.flaticon.com"], // Add allowed domains here
  },
  env: {
    BACKEND_URL: process.env.BACKEND_URL
  }
};

export default nextConfig;
