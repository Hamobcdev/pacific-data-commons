import createNextIntlPlugin from "next-intl/plugin";

// Next.js 14 does not support next.config.ts (TypeScript config files were
// added in Next.js 15) — this is plain ESM despite the rest of the app
// being TypeScript.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const config = {
  // Pacific connectivity (P8): optimise images aggressively, keep page weight low.
  images: {
    formats: ["image/webp"],
    minimumCacheTTL: 86400,
  },
  reactStrictMode: true,
};

export default withNextIntl(config);
