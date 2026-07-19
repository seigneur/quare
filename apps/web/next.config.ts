import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for GitHub Pages hosting.
  // Run `npm run export` to generate the `out/` directory.
  output: "export",
  trailingSlash: true,
  // Unoptimize images for static export (no Image Optimization API available on GitHub Pages)
  images: { unoptimized: true },
  // Set NEXT_PUBLIC_BASE_PATH=/<repo-name> when deploying to a GitHub Pages
  // project site (e.g. seigneur.github.io/quare). Leave empty for a custom domain.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
};

export default nextConfig;
