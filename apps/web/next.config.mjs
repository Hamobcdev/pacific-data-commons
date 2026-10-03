import createNextIntlPlugin from "next-intl/plugin";
import { webpackFallback } from "@txnlab/use-wallet-react";

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
  // Session 13 — @txnlab/use-wallet supports many optional wallet adapters
  // (WalletConnect, Defly, Web3Auth, ...) behind the same module, none of
  // which this app installs — only @perawallet/connect and lute-connect are
  // actual dependencies (see WalletManager's `wallets: [WalletId.PERA,
  // WalletId.LUTE]` in components/wallet/AlgorandWalletProvider.tsx).
  // Webpack still tries to statically resolve every adapter the library
  // *could* load, so the uninstalled ones need an explicit fallback to
  // `false` or the build fails with "Module not found" — this is the
  // library's own documented fix, not a workaround specific to this repo.
  webpack: (webpackConfig, { isServer }) => {
    if (!isServer) {
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        ...webpackFallback,
      };
    }
    return webpackConfig;
  },
  // Session 37A — provider UX restructure.
  async redirects() {
    return [
      // Checklist page deprecated — content moved into the wallet step
      // (components/wallet/ReadinessChecklist.tsx).
      {
        source: "/:locale/onboarding/checklist",
        destination: "/:locale/for-providers",
        permanent: true,
      },
      // /for-providers alias — the /welcome page's content was replaced by
      // Session 37A's for-providers copy, but the file stays at its
      // existing app/[locale]/(public)/welcome path (no directory rename),
      // so /for-providers is a clean external-facing slug that redirects to
      // where that content actually lives.
      {
        source: "/:locale/for-providers",
        destination: "/:locale/welcome",
        permanent: false,
      },
      // /browse alias — the data browse page lives at app/[locale]/(public)/data,
      // not /browse. External integrators (Walter Hawkins' agent crawlers)
      // have been hitting /browse directly.
      {
        source: "/:locale/browse",
        destination: "/:locale/data",
        permanent: false,
      },
      {
        source: "/browse",
        destination: "/en/data",
        permanent: false,
      },
    ];
  },
};

export default withNextIntl(config);
