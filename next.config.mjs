/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Short client router cache so back/forward + tab hops reuse the last
    // render instead of re-fetching every time. Mutations call revalidatePath,
    // which still busts it, so data stays correct after an action.
    staleTimes: { dynamic: 30 },
  },
  // Lint is run separately in CI; don't fail production builds on lint.
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
    ],
  },
  // Public marketing homepage lives as a static file in /public. Serve it at a
  // clean /welcome URL (root "/" forwards anonymous visitors here).
  async rewrites() {
    return [{ source: "/welcome", destination: "/welcome.html" }];
  },
};

export default nextConfig;
