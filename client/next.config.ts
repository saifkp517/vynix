import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  images: {
    domains: ["via.placeholder.com", "lh3.googleusercontent.com", "cdn-icons-png.flaticon.com"], // Add allowed domains here
  },
  env: {
    BACKEND_URL: process.env.BACKEND_URL
  },
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
