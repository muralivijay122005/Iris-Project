/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  // Native / worker-based packages used for OCR must load from node_modules
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas", "tesseract.js", "pdf-parse-debugging-disabled"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "**",
      },
    ],
  },
};

export default nextConfig;
