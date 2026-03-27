/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    proxyClientMaxBodySize: 200 * 1024 * 1024
  }
};

module.exports = nextConfig;
