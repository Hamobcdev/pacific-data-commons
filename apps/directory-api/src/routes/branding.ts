import { Hono } from "hono";
import type { AppBindings } from "../types.js";
import { buildRootIndexResponse } from "./root.js";

export const brandingRoute = new Hono<AppBindings>();

const OG_TITLE = "Pacific Data Commons — Sovereign Pacific Data on x402";
const OG_DESCRIPTION =
  "36 live x402-paid endpoints serving Pacific economic, climate, fisheries, jurisdiction, and intelligence data on Algorand. " +
  "Orchestrator endpoints autonomously pay sub-endpoints via x402 and synthesise results using AI — one payment triggers a chain " +
  "of real on-chain micropayments. Built for Pacific institutions, governments, NGOs, and AI agents. Operated by Synergy " +
  "Blockchain Pacific, Samoa. No accounts, no API keys — pay per query in USDC.";
const OG_SITE_NAME = "Pacific Data Commons";
// GoPlausible's own accent colour — signals alignment with their UI.
const THEME_COLOR = "#2EE6C5";

const PDC_WEB_URL = "https://pdc.synergybcpacific.com";

/**
 * GET / — human/crawler-facing HTML with og:* tags (GoPlausible's Bazaar
 * scraper, link unfurling, etc.) when the request's Accept header actually
 * prefers HTML; a JSON discovery index (feat/discoverability) otherwise —
 * every other Accept value, including none (a bare curl/agent call, or
 * PayAPI Market's/x402 Doctor's own root-URL check), used to fall through
 * to the app's notFoundHandler, answering a bare JSON 404 for the one
 * request shape external agents and discovery tools actually send. Not
 * behind the payment gate: "/" has never been (and must never become) a
 * paidRoutes entry, so the gate's middleware already passes it through
 * via next() regardless of mount order.
 */
brandingRoute.get("/", (c) => {
  const accept = c.req.header("accept") ?? "";
  if (!accept.includes("text/html")) {
    return c.json(buildRootIndexResponse());
  }

  const publicUrl = c.get("env").PUBLIC_URL.replace(/\/$/, "");
  const logoUrl = `${publicUrl}/images/sbp-logo.png`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${OG_TITLE}</title>
<meta name="description" content="${OG_DESCRIPTION}">
<meta name="theme-color" content="${THEME_COLOR}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${OG_SITE_NAME}">
<meta property="og:title" content="${OG_TITLE}">
<meta property="og:description" content="${OG_DESCRIPTION}">
<meta property="og:image" content="${logoUrl}">
<meta property="og:url" content="${publicUrl}/">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${OG_TITLE}">
<meta name="twitter:description" content="${OG_DESCRIPTION}">
<meta name="twitter:image" content="${logoUrl}">
<link rel="apple-touch-icon" sizes="180x180" href="/logo.png">
<link rel="icon" type="image/png" href="/logo.png">
<style>
  body { font-family: system-ui, sans-serif; background: #fff; color: #111; }
  @media (prefers-color-scheme: dark) {
    body { background: #111; color: #f5f5f5; }
    a { color: #8ab4f8; }
  }
  .cta-button {
    display: inline-block;
    margin-top: 1rem;
    padding: 0.75rem 1.5rem;
    background: #1d4ed8;
    color: #fff;
    font-weight: 600;
    text-decoration: none;
    border-radius: 8px;
  }
  .cta-button:hover { background: #1e40af; }
  .cta-helper { color: #666; font-size: 0.9rem; }
  @media (prefers-color-scheme: dark) {
    .cta-helper { color: #aaa; }
  }
</style>
</head>
<body>
<h1>${OG_TITLE}</h1>
<p>${OG_DESCRIPTION}</p>
<p><a class="cta-button" href="${PDC_WEB_URL}">Open Pacific Data Commons →</a></p>
<p class="cta-helper">Browse the data marketplace, explore providers, and search Pacific datasets</p>
<p>Agent/API discovery: <a href="/.well-known/x402-directory.json">/.well-known/x402-directory.json</a></p>
</body>
</html>`;

  return c.html(html);
});
