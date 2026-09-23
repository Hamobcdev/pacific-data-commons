import { Hono } from "hono";
import type { AppBindings } from "../types.js";

export const brandingRoute = new Hono<AppBindings>();

const OG_TITLE = "Pacific Data Commons — Synergy Blockchain Pacific";
// Same copy as discovery.ts's x402-directory.json `description` field —
// the one place in this app that already states what PDC is, reused here
// rather than inventing new wording.
const OG_DESCRIPTION = "Sovereign Pacific data directory — x402-gated endpoints for AI agents and researchers";

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
</head>
<body>
<h1>${OG_TITLE}</h1>
<p>${OG_DESCRIPTION}</p>
<p>Agent/API discovery: <a href="/.well-known/x402-directory.json">/.well-known/x402-directory.json</a></p>
</body>
</html>`;

  return c.html(html);
});
