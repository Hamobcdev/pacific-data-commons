/**
 * Workaround for a known, non-fatal vendor/platform incompatibility between
 * @x402/hono's automatic Bazaar discovery-schema self-check and Cloudflare
 * Workers.
 *
 * Root cause (confirmed via `wrangler dev` against the real workerd runtime,
 * not just reading source — see the pilot-endpoint deploy session that added
 * this file for the full investigation):
 *
 * Whenever any route is registered with `extensions.bazaar` set (required
 * for GoPlausible Bazaar discovery — CLAUDE.md Section 14 competition
 * requirement), @x402/hono's `paymentMiddleware` automatically dynamic-
 * `import()`s @x402/extensions/bazaar and calls its
 * `validateBazaarRouteExtensions(routes)` once per isolate, as a pure
 * spec-conformance self-check with no bearing on the actual payment/response
 * path. That function constructs a fresh Ajv instance per route and calls
 * `ajv.compile()` on our own already-correct discovery schema. Ajv's
 * `compile()` needs to synthesise a validator function at runtime via
 * `new Function(...)`; Cloudflare Workers disallows runtime code generation
 * from strings entirely (no compatibility flag re-enables it — confirmed:
 * @x402/extensions 2.27.0, the latest published version as of this fix, has
 * the identical runtime-Ajv code, so this is not a version-pinning issue).
 * The result: every bazaar-tagged route's self-check throws
 * "Code generation from strings disallowed for this context" once per cold
 * isolate.
 *
 * This is NOT a defect in any PDC route schema — verified three independent
 * ways: (1) `ajv.compile()` against each route's schema succeeds in plain
 * Node, (2) the real, unmodified `validateBazaarRouteExtensions` from
 * @x402/extensions run against the exact production route registration in
 * Node succeeds with zero errors, (3) under `wrangler dev` (the actual
 * workerd engine), every bazaar-tagged route fails *identically* regardless
 * of schema content — a content-independent, platform-wide failure, not a
 * per-schema defect.
 *
 * It's also non-fatal by @x402/hono's own design: `validateDiscoveryExtension`
 * catches the Ajv error internally and only ever `console.warn`s a summary —
 * it's never thrown into the request path. Confirmed empirically: every
 * bazaar-tagged route still returns its correct HTTP response (402 Payment
 * Required when unpaid) regardless of this warning firing. The only actual
 * problem is that Cloudflare Observability surfaces these console.warn/
 * console.error calls as request-level errors, which is what created the
 * "~30% of requests fail" signal that prompted this investigation — it's log
 * misclassification, not broken responses.
 *
 * Filed upstream against the x402 SDK, since any Workers-hosted x402
 * integrator using Bazaar extensions hits this:
 * https://github.com/x402-foundation/x402/issues/3556 — see that issue for
 * whether/when it's fixed; once it is, this filter (and its call sites) can
 * be removed.
 *
 * What this filter does: narrowly recognises *this exact* known signature —
 * both the Ajv debug dump (`console.error("Error compiling schema, function
 * code:", <generated source>)`) and @x402/extensions' own summary
 * (`console.warn('x402: Route "..." has an invalid bazaar extension: ...
 * Code generation from strings disallowed for this context')`) — and
 * reclassifies *only that pair* through the caller's own structured logger
 * at info level instead of leaving it as a raw console.error/warn. Every
 * other console.error/console.warn call, from this app or any other
 * dependency (including a genuinely broken bazaar schema in the future,
 * which produces a *different* Ajv error message), passes through to the
 * real console.error/console.warn completely unchanged — this deliberately
 * does not touch anything but this one known signature.
 */

const AJV_COMPILE_ERROR_LABEL = "Error compiling schema, function code:";
const KNOWN_ISSUE_PHRASE = "Code generation from strings disallowed for this context";
const BAZAAR_WARN_PATTERN = /^x402: Route "([^"]+)" has an invalid bazaar extension: (.+)$/;

export interface BazaarAjvWorkersLogFilterOptions {
  /**
   * Called once per matched occurrence, in place of the raw console.warn/
   * console.error pair. Route through your app's own structured logger at
   * info (or debug) level — this is expected, non-actionable noise, not an
   * error.
   */
  onKnownIssue: (details: { route: string; rawWarnMessage: string }) => void;
}

let installedFor: Console | null = null;

/**
 * Idempotent — safe to call from every app's createApp()/entrypoint. Call it
 * once, as early as possible (before the x402 payment gate's middleware is
 * constructed), so it's active before @x402/hono's dynamic bazaar-validation
 * import resolves. Harmless to install where the underlying issue can't
 * occur (e.g. local Node dev via @hono/node-server, where `new Function()`
 * is unrestricted and Ajv simply never throws) — the matchers just never
 * fire.
 */
export function installBazaarAjvWorkersLogFilter(opts: BazaarAjvWorkersLogFilterOptions): void {
  if (installedFor === console) return;
  installedFor = console;

  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  // Ajv's compile() dumps the generated source via console.error immediately
  // before re-throwing, synchronously inside the same call stack that
  // @x402/extensions' validateBazaarRouteExtensions catches and summarises
  // via a single console.warn right after (neither function is async, and
  // nothing else runs in between) — so buffering the dump and resolving it
  // against the very next console call is deterministic, not a race.
  let pendingAjvDump: unknown[] | null = null;

  function flushPending(): void {
    if (pendingAjvDump) {
      originalError(...pendingAjvDump);
      pendingAjvDump = null;
    }
  }

  console.error = (...args: unknown[]) => {
    if (args.length >= 1 && args[0] === AJV_COMPILE_ERROR_LABEL) {
      // Don't emit yet — hold it until we see whether the very next console
      // call is the correlated, known-benign bazaar summary.
      flushPending(); // a prior unresolved dump (shouldn't happen, but never drop it) goes out first
      pendingAjvDump = args;
      return;
    }
    flushPending();
    originalError(...args);
  };

  console.warn = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string") {
      const match = first.match(BAZAAR_WARN_PATTERN);
      const route = match?.[1];
      const reason = match?.[2];
      if (route !== undefined && reason !== undefined && reason.includes(KNOWN_ISSUE_PHRASE)) {
        opts.onKnownIssue({ route, rawWarnMessage: first });
        pendingAjvDump = null; // consume the correlated debug dump — known cause, already reported above
        return;
      }
    }
    flushPending();
    originalWarn(...args);
  };
}
