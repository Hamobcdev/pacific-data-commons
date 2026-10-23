import { Hono } from "hono";
import type { AppBindings } from "../types.js";

/**
 * GoPlausible's "Be Discoverable" spec — four agent-discovery files read
 * from this service's own domain (api.synergybcpacific.com), the "missing
 * layer" between a registered listing and an agent-queryable one:
 *   /.well-known/agent-card.json  (A2A Agent Card)
 *   /.well-known/mcp.json         (MCP Manifest)
 *   /llms.txt                     (LLM-readable endpoint index)
 *   /agents.md                    (Agent operating instructions)
 *
 * Deliberately plain Hono .get() handlers, never registered via
 * paymentGate.addRoute() (see app.ts) — same free/public posture as
 * wellKnownX402.ts's /.well-known/x402. GoPlausible's crawler fetches
 * these server-side with a 3-second timeout and treats a 402, HTML
 * body, or timeout as "absent" — so no payment gate, no redirect, no
 * client-side rendering.
 *
 * Content is intentionally static (not templated against live Supabase
 * counts the way /.well-known/x402-directory.json's `stats` block is) —
 * this mirrors the exact copy reviewed and approved for this launch.
 * The one factual correction made against the approved draft: the
 * original llms.txt text pointed to /.well-known/x402 and claimed "all
 * 36 endpoints" there — that manifest's own `endpoints` array is
 * actually AGENT_DATASET_CATALOG.length + 1 (/search) long, not 36 (36
 * is the live Supabase active-row count, which /.well-known/x402's
 * sibling manifest exposes separately as stats.active_endpoints). Wording
 * adjusted to stop asserting a specific count next to that particular
 * link; the "36 live endpoints" headline claim elsewhere in these files
 * is independently verified against Supabase and left unchanged.
 */
export const agentDiscoveryRoute = new Hono<AppBindings>();

function withCors(c: { header: (name: string, value: string) => void }) {
  c.header("Access-Control-Allow-Origin", "*");
}

const AGENT_CARD = {
  name: "Pacific Data Commons",
  description:
    "Sovereign Pacific data directory — x402-gated endpoints for AI agents, researchers, and institutions. " +
    "36 live endpoints covering Pacific economic, climate, financial, jurisdiction, and intelligence data. " +
    "Built on Algorand. No accounts, no API keys — pay per query in USDC via x402.",
  url: "https://api.synergybcpacific.com",
  version: "1.0.0",
  capabilities: { streaming: false },
  defaultInputModes: ["text"],
  defaultOutputModes: ["application/json"],
  skills: [
    {
      id: "pacific-intelligence",
      name: "Pacific Intelligence Orchestrator",
      description:
        "Autonomous multi-endpoint intelligence brief. One payment triggers sub-payments across PDC endpoints, synthesised by Claude. 0.50 USDC.",
      tags: ["x402", "algorand", "pacific", "intelligence"],
    },
    {
      id: "pacific-travel",
      name: "Pacific Travel Intelligence",
      description: "Events, weather, FX rates, and tourism stats for any Pacific destination. 0.50 USDC.",
      tags: ["x402", "algorand", "pacific", "travel"],
    },
    {
      id: "pacific-fx",
      name: "Pacific FX Registry",
      description: "All 8 Pacific currencies, 10 major senders, 11 crypto assets with Pacific cross-rates. 0.10 USDC.",
      tags: ["x402", "algorand", "pacific", "fx", "crypto"],
    },
    {
      id: "jurisdiction-intelligence",
      name: "Pacific Jurisdiction Intelligence",
      description:
        "IBC setup, compliance, VFSC licenses, registered agents, citizenship-by-investment for Samoa and Vanuatu. 0.60–5.00 USDC.",
      tags: ["x402", "algorand", "pacific", "legal", "investment"],
    },
  ],
} as const;

const MCP_MANIFEST = {
  name: "Pacific Data Commons MCP",
  description:
    "MCP-compatible access to 36 x402-paid Pacific data endpoints. Pay per query in USDC on Algorand — no API keys, no subscriptions.",
  version: "1.0.0",
  transport: { type: "http", url: "https://api.synergybcpacific.com" },
  payments: {
    protocol: "x402",
    network: "algorand-mainnet",
    asset: "USDC",
    asset_id: "31566704",
    facilitator: "https://facilitator.goplausible.xyz",
  },
  tools: [
    { name: "pacific-brief", description: "Pacific intelligence brief — 0.50 USDC" },
    { name: "pacific-travel", description: "Travel intelligence for Pacific destinations — 0.50 USDC" },
    { name: "finance-fx", description: "Pacific FX rates and crypto cross-rates — 0.10 USDC" },
    { name: "climate-data", description: "Ocean temperature, ENSO, sea level, cyclone history — 0.15–0.30 USDC" },
    { name: "jurisdiction-intel", description: "Samoa and Vanuatu IBC, compliance, agents — 0.60–5.00 USDC" },
  ],
} as const;

const LLMS_TXT = `# Pacific Data Commons

> Sovereign Pacific data directory — 36 x402-paid endpoints for
> AI agents, researchers, and institutions. Built on Algorand.
> Pay per query in USDC — no accounts, no API keys, no
> subscriptions. Operated by Synergy Blockchain Pacific, Samoa.

## What makes PDC different

PDC is not a single-endpoint demo. It is a full data marketplace:
- 36 live production endpoints across finance, climate,
  fisheries, demographics, jurisdiction, and intelligence
- Orchestrator endpoints that autonomously pay sub-endpoints
  via x402 and synthesise results using Claude
- Institutions can register their own endpoints on the x402
  protocol through PDC — turning it into a regional data
  marketplace, not just a provider
- All data is sovereignty-aware: Pacific Island nations control
  their own data infrastructure

## High-value endpoints

- [Pacific Intelligence Brief](https://api.synergybcpacific.com/intelligence/pacific-brief):
  Multi-endpoint AI synthesis. 0.50 USDC.
- [Pacific Travel Intelligence](https://api.synergybcpacific.com/intelligence/pacific-travel):
  Events + weather + FX + tourism. 0.50 USDC.
- [Pacific FX Registry](https://api.synergybcpacific.com/finance/fx):
  8 Pacific currencies + 11 crypto assets + cross-rates. 0.10 USDC.
- [Samoa IBC Setup](https://api.synergybcpacific.com/pacific/samoa-entity-setup):
  Full entity formation intelligence. 3.00 USDC.
- [Vanuatu IBC Setup](https://api.synergybcpacific.com/pacific/vanuatu-ibc-setup):
  IBC formation under CAP. 222. 1.30 USDC.
- [Pacific Arbitrage Signals](https://api.synergybcpacific.com/finance/arbitrage-signals):
  DEX spread signals across Ethereum, BNB, Algorand. 0.40 USDC.

## Full endpoint index

See https://api.synergybcpacific.com/.well-known/x402-directory.json
for the complete, live endpoint catalogue with prices, descriptions,
and categories — its \`stats.active_endpoints\` field is the
authoritative live count referenced above.

## Paying

- Protocol: x402 (v2), settled by https://facilitator.goplausible.xyz
- Network: Algorand MainNet · Asset: USDC (31566704)
- On HTTP 402: read the PAYMENT-REQUIRED header, pay, retry with
  PAYMENT-SIGNATURE header
- Any x402 client works — see https://facilitator.goplausible.xyz/guide/use

## Contact

anthony@synergybcpacific.com · https://pdc.synergybcpacific.com
`;

const AGENTS_MD = `# Pacific Data Commons — Agent Instructions

Instructions for AI agents working with PDC endpoints.

## Payment flow

Every endpoint under api.synergybcpacific.com is x402-paid.

1. Make your request normally — you will receive HTTP 402
2. Read the PAYMENT-REQUIRED header (base64 JSON)
3. Pay the advertised USDC amount on Algorand MainNet to the
   payTo address via the facilitator
4. Retry the same request with the PAYMENT-SIGNATURE header
5. Receive the full JSON response

Facilitator: https://facilitator.goplausible.xyz
Asset: USDC (Algorand ASA 31566704)
Prices are always advertised in the 402 — never assume them.

## Orchestrator endpoints (highest value)

These endpoints autonomously pay sub-endpoints and synthesise
results — one payment from you triggers a chain of real
on-chain micro-payments:

- GET /intelligence/pacific-brief?topic=economic&country=WS
  → 0.50 USDC → returns AI-synthesised Pacific intelligence brief
- GET /intelligence/pacific-travel?destination=samoa&window=14d
  → 0.50 USDC → returns travel brief with events, weather, FX

## Data endpoints (direct queries)

- GET /finance/fx → 0.10 USDC → Pacific FX + crypto cross-rates
- GET /finance/arbitrage-signals → 0.40 USDC → DEX spread signals
- GET /climate/ocean-temperature?country=WS → 0.15 USDC
- GET /pacific/samoa-entity-setup?entity_type=ibc → 3.00 USDC
- GET /pacific/vanuatu-ibc-setup → 1.30 USDC

Full index: https://api.synergybcpacific.com/.well-known/x402-directory.json

## Notes

- Prices in the 402 are authoritative — the index is a guide
- 24-hour cache on most endpoints — identical queries in the
  window return cached data without additional payment
- Pacific jurisdiction endpoints return null fields where
  primary-source verification is pending — see data_quality

## Implementation note for PDC itself

PDC is also designed to register external institution endpoints
on x402. If you are an institutional data provider in the
Pacific, contact anthony@synergybcpacific.com.
`;

agentDiscoveryRoute.get("/.well-known/agent-card.json", (c) => {
  c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  withCors(c);
  return c.json(AGENT_CARD);
});

agentDiscoveryRoute.get("/.well-known/mcp.json", (c) => {
  c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  withCors(c);
  return c.json(MCP_MANIFEST);
});

agentDiscoveryRoute.get("/llms.txt", (c) => {
  c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  withCors(c);
  return c.text(LLMS_TXT, 200, { "Content-Type": "text/plain; charset=utf-8" });
});

agentDiscoveryRoute.get("/agents.md", (c) => {
  c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  withCors(c);
  return c.text(AGENTS_MD, 200, { "Content-Type": "text/markdown; charset=utf-8" });
});

for (const path of ["/.well-known/agent-card.json", "/.well-known/mcp.json", "/llms.txt", "/agents.md"]) {
  agentDiscoveryRoute.options(path, (c) => {
    withCors(c);
    c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type");
    return c.body(null, 204);
  });
}
