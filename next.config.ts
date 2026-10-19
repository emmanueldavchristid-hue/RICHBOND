import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // PDF des bons de commande (LOT-05) : @react-pdf/renderer charge ses polices et son moteur de mise en page depuis node_modules.
  serverExternalPackages: ["@react-pdf/renderer"],
  // Photo article : 2 Mo (R19) ; pièces jointes des DA : 5 Mo (D15). Limite par défaut des actions serveur : 1 Mo.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
