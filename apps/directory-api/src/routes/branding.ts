import { Hono } from "hono";
import type { AppBindings } from "../types.js";

export const brandingRoute = new Hono<AppBindings>();

const OG_TITLE = "Pacific Data Commons — Synergy Blockchain Pacific";
// Same copy as discovery.ts's x402-directory.json `description` field —
// the one place in this app that already states what PDC is, reused here
// rather than inventing new wording.
const OG_DESCRIPTION = "Sovereign Pacific data directory — x402-gated endpoints for AI agents and researchers";

const PDC_WEB_URL = "https://pacific-data-commons-web-olive.vercel.app/en";

/**
 * GET / — human/crawler-facing HTML with og:* tags (GoPlausible's Bazaar
 * scraper, link unfurling, etc.), left of the JSON API entirely. Only
 * responds when the request's Accept header actually prefers HTML; every
 * other Accept value (including none, e.g. a bare curl/agent call) falls
 * through to the app's existing notFoundHandler via c.notFound() — GET /
 * was never a defined JSON endpoint, so that 404 JSON response is
 * unchanged from before this route existed.
 */
brandingRoute.get("/", (c) => {
  const accept = c.req.header("accept") ?? "";
  if (!accept.includes("text/html")) {
    return c.notFound();
  }

  const publicUrl = c.get("env").PUBLIC_URL.replace(/\/$/, "");
  const logoUrl = `${publicUrl}/images/sbp-logo.png`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${OG_TITLE}</title>
<meta name="description" content="${OG_DESCRIPTION}">
<meta property="og:type" content="website">
<meta property="og:title" content="${OG_TITLE}">
<meta property="og:description" content="${OG_DESCRIPTION}">
<meta property="og:image" content="${logoUrl}">
<meta property="og:url" content="${publicUrl}/">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${OG_TITLE}">
<meta name="twitter:description" content="${OG_DESCRIPTION}">
<meta name="twitter:image" content="${logoUrl}">
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
