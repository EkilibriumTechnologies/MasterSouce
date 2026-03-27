/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["ffmpeg-static"],
    outputFileTracingIncludes: {
      "/api/master": [
        "./node_modules/ffmpeg-static/ffmpeg",
        "./node_modules/ffmpeg-static/ffmpeg.exe"
      ],
      "/api/internal/ffmpeg-runtime": [
        "./node_modules/ffmpeg-static/ffmpeg",
        "./node_modules/ffmpeg-static/ffmpeg.exe"
      ]
    }
  }
};

module.exports = nextConfig;
