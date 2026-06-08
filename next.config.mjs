/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lint is run separately in CI; don't fail production builds on lint.
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
    ],
  },
};

export default nextConfig;
