# Stripe Setup Checklist — Manual Action Required

Session 23 shipped the Stripe checkout/webhook code (`apps/web/lib/stripe.ts`, `apps/web/app/api/stripe/checkout/route.ts`, `apps/web/app/api/stripe/webhook/route.ts`). It cannot go live until the following is done in the Stripe dashboard and in Railway — no code work remains, only configuration.

**Note on env var names:** the names below are exactly what the shipped code reads (`apps/web/lib/stripe.ts`). If you've seen a different checklist with names like `STRIPE_PRICE_PDF_SURCHARGE` or `STRIPE_PRICE_FULL_DEPLOYMENT` — those don't match the actual code and would leave checkout silently broken (`STRIPE_PRICE_IDS.deploymentStandard` etc. would just be `undefined`). Use the names below.

## Step 1 — Create 4 Products in Stripe (dashboard.stripe.com → Products → Add product)

Each is one-time, not recurring.

| # | Product name | Price | Code constant it maps to |
|---|---|---|---|
| 1 | Dataset Upload Fee | $25.00 USD | `STRIPE_PRICE_UPLOAD_FEE` |
| 2 | Scanned PDF Surcharge | $10.00 USD | `STRIPE_PRICE_SCANNED_PDF_SURCHARGE` |
| 3 | Full Deployment Service | $150.00 USD | `STRIPE_PRICE_DEPLOYMENT_STANDARD` |
| 4 | Complex Deployment Service | $300.00 USD | `STRIPE_PRICE_DEPLOYMENT_COMPLEX` |

After creating each, copy its **Price ID** (starts with `price_`, not the Product ID which starts with `prod_`).

**Not needed as an env var:** a "Bank Transfer Surcharge" ($50 USD) product, if you want one in Stripe for record-keeping — the shipped checkout code only ever creates a Checkout Session for the 4 products above; the bank-transfer surcharge is invoice-path only (`requestUploadInvoice` in `apps/web/actions/upload/upload-payment.ts`), never charged through Stripe.

## Step 2 — Get API keys (Developers → API keys)

- Publishable key (`pk_test_...` or `pk_live_...`)
- Secret key (`sk_test_...` or `sk_live_...`)

Use test-mode keys until this is actually launched — nothing in the code assumes live mode.

## Step 3 — Create the webhook endpoint (Developers → Webhooks → Add endpoint)

- URL: `https://pdcweb-production.up.railway.app/api/stripe/webhook`
- Event to listen for: `checkout.session.completed` (the webhook handler only checks for this one event type — no others need to be selected)
- Copy the **Signing secret** (`whsec_...`)

## Step 4 — Add these 7 variables to Railway's `@pdc/web` service

```
STRIPE_SECRET_KEY=sk_test_...  (or sk_live_ when ready)
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_UPLOAD_FEE=price_...              (from Product 1)
STRIPE_PRICE_SCANNED_PDF_SURCHARGE=price_...   (from Product 2)
STRIPE_PRICE_DEPLOYMENT_STANDARD=price_...     (from Product 3)
STRIPE_PRICE_DEPLOYMENT_COMPLEX=price_...      (from Product 4)
```

(`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` isn't read by any shipped code yet — the checkout flow redirects to a Stripe-hosted page rather than using Stripe.js client-side — but it's harmless to set now for when that changes.)

## Step 5 — Redeploy `@pdc/web`

Env var changes require a redeploy to take effect on Railway.

## Step 6 — Verify

1. Go through the upload fee gate (`/onboarding/upload`) and click "Pay by card."
2. Confirm it redirects to a real Stripe Checkout page showing $25.00 USD.
3. Complete the test payment (use Stripe's [test card numbers](https://docs.stripe.com/testing) if in test mode).
4. Confirm you land back on `/onboarding/upload?stripe=success` and, within a few seconds, the upload UI unlocks (the webhook writes the confirmed `upload_payments` row).
5. Check Stripe's dashboard → Developers → Webhooks → your endpoint → recent deliveries, to confirm the webhook actually fired and returned 200.
