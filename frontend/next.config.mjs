/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const api = process.env.BACKEND_URL || "http://localhost:8000";
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      // Lets the UI detect a sleeping free-tier backend and show a "waking up" notice.
      { source: "/backend-health", destination: `${api}/health` },
    ];
  },
};
export default nextConfig;
