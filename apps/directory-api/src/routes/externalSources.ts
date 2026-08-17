import { Hono } from "hono";
import { listActiveExternalSources } from "../services/externalSourcesService.js";
import type { AppBindings } from "../types.js";

export const externalSourcesRoute = new Hono<AppBindings>();

/** Public, free — never registered with PdcPaymentGate, same posture as
 * /categories and /countries (Session 19 / Decision 56).
 *
 * Session 24: this route deliberately gets no Bazaar discovery declaration.
 * `extensions.bazaar` is only attachable through PdcPaymentGate.addRoute()
 * (see @pdc/x402-adapter's PdcPaidRouteSpec — priceUsdc is required, not
 * optional), and Bazaar discovery itself is carried in an x402
 * PaymentRequired response's extensions field — a free route never returns
 * one, so there's no mechanism (and no protocol reason) to make this
 * Bazaar-discoverable without turning it into a paid route, which is not
 * this session's call to make. */
externalSourcesRoute.get("/external-sources", async (c) => {
  const supabase = c.get("supabase");
  const sources = await listActiveExternalSources(supabase);
  return c.json({ sources });
});
