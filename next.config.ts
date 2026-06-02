import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep these Node-only libraries out of the bundle (they use net/tls).
  serverExternalPackages: ["imapflow", "mailparser"],
};

export default nextConfig;
