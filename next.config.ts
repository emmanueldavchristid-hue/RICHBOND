import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * CSP compatible Next (scripts/styles inline requis par le runtime sans nonce ; unsafe-eval seulement en dev pour le rechargement à chaud).
 * Pas de ressource externe : tout est servi par l'application.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isProd ? "" : " ws: wss:"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  /* config options here */
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  // PDF des bons de commande (LOT-05) : @react-pdf/renderer charge ses polices et son moteur de mise en page depuis node_modules.
  serverExternalPackages: ["@react-pdf/renderer"],
  // Photo article : 2 Mo (R19) ; pièces jointes des DA : 5 Mo (D15). Limite par défaut des actions serveur : 1 Mo.
  // CSRF des actions serveur : Next refuse toute action dont l'en-tête Origin ne correspond pas à l'hôte (Host / X-Forwarded-Host).
  // Derrière un proxy qui réécrit l'hôte, lister les origines autorisées dans ALLOWED_ORIGINS (séparées par des virgules).
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
      allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
    },
  },
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
