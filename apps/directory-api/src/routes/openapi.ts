import { Hono } from "hono";
import { DIRECTORY_QUERY_PRICE_USDC, paidRoutes, type PaidRouteSpec } from "../routeSchemas.js";
import type { AppBindings } from "../types.js";

/**
 * GET /openapi.json (x402 Doctor re-scan, Frits Zwager / Fizzl, 16 Nov 2026:
 * "There is no /openapi.json").
 *
 * Generated at request time from routeSchemas.ts's `paidRoutes` — the exact
 * list the payment gate registers in app.ts — so the spec cannot describe a
 * route, price or parameter the gate doesn't actually enforce. Parameters
 * and example responses come from each route's Bazaar discovery extension
 * (the same object already sent in every 402), not a second hand-written
 * copy. Free and ungated: this path is never passed to addRoute().
 *
 * Every paid operation documents the 402 challenge and carries an
 * `x-x402` extension with its USDC price and the chains the gate accepts.
 */
export const openapiRoute = new Hono<AppBindings>();

interface JsonSchemaObject {
  type?: string;
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
}

interface BazaarDiscovery {
  info?: { output?: { example?: unknown }; input?: { body?: unknown } };
  schema?: { properties?: { input?: { properties?: { queryParams?: JsonSchemaObject; body?: JsonSchemaObject } } } };
}

/** `/tourism/destination/:nation_code` -> `/tourism/destination/{nation_code}` */
function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z_]+)/g, "{$1}");
}

function pathParamNames(path: string): string[] {
  return [...path.matchAll(/:([A-Za-z_]+)/g)].map((m) => m[1]!);
}

/** Stable, unique operationId, e.g. GET /pacific/weather -> get_pacific_weather. */
function operationId(route: PaidRouteSpec): string {
  const slug = route.path
    .replace(/^\//, "")
    .replace(/:([A-Za-z_]+)/g, "by_$1")
    .replace(/[^A-Za-z0-9]+/g, "_");
  return `${route.method.toLowerCase()}_${slug}`;
}

/** First path segment as an OpenAPI tag, e.g. /climate/... -> "climate". */
function tagFor(path: string): string {
  if (path.startsWith("/api/v1/datasets/")) return "agent-dataset-gateway";
  return path.split("/")[1] || "directory";
}

/**
 * Builds the OpenAPI 3.1 document. Pure — exported for direct unit testing.
 * `networks` is the gate's acceptedNetworks() output.
 */
export function buildOpenApiDocument(
  publicUrl: string,
  networks: Array<{ chain: string; caip2: string }>,
  defaultPriceUsdc: number,
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of paidRoutes) {
    const discovery = route.discovery as BazaarDiscovery | undefined;
    const inputSchema = discovery?.schema?.properties?.input?.properties;
    const parameters: Array<Record<string, unknown>> = pathParamNames(route.path).map((name) => ({
      name,
      in: "path",
      required: true,
      schema: { type: "string" },
    }));

    const query = inputSchema?.queryParams;
    if (query?.properties) {
      const required = new Set(query.required ?? []);
      for (const [name, schema] of Object.entries(query.properties)) {
        const { description, ...rest } = schema;
        parameters.push({
          name,
          in: "query",
          required: required.has(name),
          ...(typeof description === "string" ? { description } : {}),
          schema: rest,
        });
      }
    }

    const example = discovery?.info?.output?.example;
    const priceUsdc = route.priceUsdc ?? defaultPriceUsdc;

    const operation: Record<string, unknown> = {
      operationId: operationId(route),
      tags: [tagFor(route.path)],
      summary: route.description.split(/(?<=\.)\s/)[0],
      description: route.description,
      ...(parameters.length ? { parameters } : {}),
      ...(route.method === "POST"
        ? {
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: inputSchema?.body ?? { type: "object", properties: { params: { type: "object" } } },
                },
              },
            },
          }
        : {}),
      responses: {
        "200": {
          description: "Paid response.",
          content: { "application/json": { schema: { type: "object" }, ...(example !== undefined ? { example } : {}) } },
        },
        "400": { description: "A paid request is missing a required parameter. No payment is taken." },
        "402": {
          description:
            "Payment required. The PAYMENT-REQUIRED header (base64 JSON) and the JSON body both carry the x402 v2 " +
            "challenge: accepts[] lists one USDC payment option per accepted chain. Retry with a PAYMENT-SIGNATURE header.",
          headers: { "PAYMENT-REQUIRED": { schema: { type: "string" }, description: "Base64-encoded x402 PaymentRequired object." } },
          content: { "application/json": { schema: { $ref: "#/components/schemas/PaymentRequired" } } },
        },
      },
      "x-x402": { price_usdc: priceUsdc, asset: "USDC", scheme: "exact", networks },
    };

    const key = toOpenApiPath(route.path);
    paths[key] = { ...(paths[key] ?? {}), [route.method.toLowerCase()]: operation };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Pacific Data Commons API",
      version: "1.0.0",
      description:
        "Pay-per-query Pacific data for AI agents and researchers: climate and ocean, fisheries, economic indicators, " +
        "tourism, and jurisdiction intelligence for Pacific Island nations. No accounts or API keys — every paid route " +
        "answers an unpaid call with an x402 402 challenge; pay in USDC and retry. Operated by Synergy Blockchain " +
        "Pacific as directory and payment infrastructure only; SBP does not warrant data quality, and each response " +
        "names its upstream source.",
      contact: { url: "https://pdc.synergybcpacific.com" },
    },
    servers: [{ url: publicUrl }],
    externalDocs: { description: "x402 discovery manifest", url: `${publicUrl}/.well-known/x402` },
    paths,
    components: {
      schemas: {
        PaymentRequired: {
          type: "object",
          required: ["x402Version", "accepts"],
          properties: {
            x402Version: { type: "integer", const: 2 },
            error: { type: "string" },
            resource: { type: "object" },
            accepts: {
              type: "array",
              items: {
                type: "object",
                required: ["scheme", "network", "amount", "asset", "payTo"],
                properties: {
                  scheme: { type: "string" },
                  network: { type: "string", description: "CAIP-2 network id" },
                  amount: { type: "string", description: "Atomic USDC units" },
                  asset: { type: "string" },
                  payTo: { type: "string" },
                  maxTimeoutSeconds: { type: "integer" },
                  extra: { type: "object" },
                },
              },
            },
            extensions: { type: "object" },
          },
        },
      },
    },
  };
}

openapiRoute.get("/openapi.json", (c) => {
  const env = c.get("env");
  const networks = c.get("paymentGate")?.acceptedNetworks() ?? [];
  c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  c.header("Access-Control-Allow-Origin", "*");
  return c.json(buildOpenApiDocument(env.PUBLIC_URL, networks, DIRECTORY_QUERY_PRICE_USDC));
});
