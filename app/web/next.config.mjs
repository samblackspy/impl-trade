/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The SDK ships TypeScript source from the workspace; let Next compile it.
  transpilePackages: ["@impl-trade/sdk"],
};

export default nextConfig;
