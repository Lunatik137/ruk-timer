import type { NextConfig } from "next";

// cubing.js loads its solver through a Node Worker and dynamic imports.
const cubingWorkerFiles = ["./node_modules/cubing/dist/lib/cubing/chunks/**/*.js"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/duel": cubingWorkerFiles,
    "/api/scramble": cubingWorkerFiles,
  },
};

export default nextConfig;
