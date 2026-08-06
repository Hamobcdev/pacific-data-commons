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
};

export default withNextIntl(config);
