/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Linting runs as a separate workspace task (pnpm lint), not during `next build`.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
