import { Resend } from "resend";

/**
 * apps/web's first Resend integration (Session 37B) — apps/directory-api
 * already has one (src/lib/email.ts, Session 17), but apps/web and
 * apps/directory-api are separate Railway services with separate env vars
 * and no cross-service email routing infrastructure exists in this repo
 * (confirmed: no Supabase Edge Functions anywhere under supabase/, no
 * shared email module). Same initialisation pattern as directory-api's:
 * lazy-cached client, RESEND_API_KEY optional with graceful degradation
 * (a missing key logs a warning and skips the send rather than throwing —
 * a third-party outage/misconfig must not break the caller), never throws.
 */
let cachedClient: Resend | undefined;

function getClient(apiKey: string): Resend {
  cachedClient ??= new Resend(apiKey);
  return cachedClient;
}

function getFromAddress(): string {
  // RESEND_FROM_EMAIL already existed in .env.example (Session 10, reserved
  // for "a possible future app-level transactional email use... cert
  // renewal, fee notices" — this is that use) — reused rather than
  // inventing a differently-named var for the same purpose.
  return process.env.RESEND_FROM_EMAIL ?? "Pacific Data Commons <noreply@pacificdatacommons.org>";
}

const SBP_CONTACT_EMAIL = "anthony@synergybcpacific.com";

export interface DeploymentAcknowledgementParams {
  providerEmail: string;
  providerName: string;
  invoiceReference: string;
  deploymentTier: "assisted" | "complex";
  providerContactEmail: string;
}

const DEPLOYMENT_TIER_LABEL: Record<DeploymentAcknowledgementParams["deploymentTier"], string> = {
  assisted: "SBP Assisted",
  complex: "Complex deployment",
};

/** Email A — sent immediately when a provider submits a deployment request
 * (assisted tier only in Session 37B — complex never creates an invoice).
 * Never throws — a send failure is logged and swallowed, same posture as
 * directory-api's email functions, so it can never fail the server action
 * that already succeeded in recording the request. */
export async function sendDeploymentAcknowledgement(params: DeploymentAcknowledgementParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[deployment_acknowledgement_email_skipped_no_provider]", { invoiceReference: params.invoiceReference });
    return;
  }

  try {
    const resend = getClient(apiKey);
    await resend.emails.send({
      from: getFromAddress(),
      to: params.providerEmail,
      subject: "Deployment request received — Pacific Data Commons",
      text: [
        `Your deployment request has been received.`,
        ``,
        `Reference: ${params.invoiceReference}`,
        `Institution: ${params.providerName}`,
        `Deployment type: ${DEPLOYMENT_TIER_LABEL[params.deploymentTier]}`,
        ``,
        `SBP will contact you at ${params.providerContactEmail} within 1 business day to begin work.`,
        ``,
        `If you have questions, reply to this email or contact ${SBP_CONTACT_EMAIL} with your reference number.`,
        ``,
        `Pacific Data Commons`,
        `Synergy Blockchain Pacific Limited`,
        `Apia, Samoa`,
      ].join("\n"),
    });
  } catch (err) {
    console.error("[deployment_acknowledgement_email_send_failed]", {
      invoiceReference: params.invoiceReference,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface DeploymentNotificationToSbpParams {
  providerName: string;
  providerEmail: string;
  invoiceReference: string;
  deploymentTier: string;
  providerCountry: string;
  submittedAt: string;
}

/** Email B — SBP's internal "new deployment request" notification, sent
 * alongside Email A. Never throws, same posture as Email A above. */
export async function sendDeploymentNotificationToSBP(params: DeploymentNotificationToSbpParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[deployment_sbp_notification_email_skipped_no_provider]", { invoiceReference: params.invoiceReference });
    return;
  }

  try {
    const resend = getClient(apiKey);
    await resend.emails.send({
      from: getFromAddress(),
      to: SBP_CONTACT_EMAIL,
      subject: `New deployment request — ${params.providerName} — ${params.invoiceReference}`,
      text: [
        `New deployment request received.`,
        ``,
        `Institution: ${params.providerName}`,
        `Contact: ${params.providerEmail}`,
        `Country: ${params.providerCountry}`,
        `Reference: ${params.invoiceReference}`,
        `Tier: ${params.deploymentTier}`,
        `Submitted: ${params.submittedAt}`,
        ``,
        `View in Supabase:`,
        `https://supabase.com/dashboard/project/poiiwcbriqwczmppoevd/editor`,
        ``,
        `No action required until payment is confirmed (currently free — confirm via`,
        `POST /api/invoices/confirm, which sets payment_confirmed_at).`,
      ].join("\n"),
    });
  } catch (err) {
    console.error("[deployment_sbp_notification_email_send_failed]", {
      invoiceReference: params.invoiceReference,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface DeploymentReceiptParams {
  providerEmail: string;
  providerName: string;
  invoiceReference: string;
  deploymentTier: string;
  confirmedAt: string;
}

/** Email C — sent when SBP confirms payment via POST /api/invoices/confirm
 * (see that route for why this replaces a Postgres-trigger + Edge Function
 * approach). Never throws, same posture as Email A/B above. */
export async function sendDeploymentReceipt(params: DeploymentReceiptParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[deployment_receipt_email_skipped_no_provider]", { invoiceReference: params.invoiceReference });
    return;
  }

  try {
    const resend = getClient(apiKey);
    await resend.emails.send({
      from: getFromAddress(),
      to: params.providerEmail,
      subject: `Deployment confirmed — Pacific Data Commons — ${params.invoiceReference}`,
      text: [
        `Your deployment request has been confirmed.`,
        ``,
        `Reference: ${params.invoiceReference}`,
        `Institution: ${params.providerName}`,
        `Confirmed: ${params.confirmedAt}`,
        ``,
        `SBP will be in touch shortly to begin deployment work. Expected timeline: 2-5 business days for standard deployments.`,
        ``,
        `Questions? Reply to this email or contact ${SBP_CONTACT_EMAIL} with your reference number.`,
        ``,
        `Pacific Data Commons`,
        `Synergy Blockchain Pacific Limited`,
        `Apia, Samoa`,
      ].join("\n"),
    });
  } catch (err) {
    console.error("[deployment_receipt_email_send_failed]", {
      invoiceReference: params.invoiceReference,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface ProviderRegistrationNotificationParams {
  businessName: string;
  providerCategory: string;
  nationCode: string;
  contactEmail: string;
  submittedAt: string;
  paymentMethod: string;
  paymentReference: string;
  /** Claude's suggested public-facing label/tags (actions/tourism/registerProvider.ts) —
   * informational only, for whoever on SBP's team later creates the real
   * endpoint listing. Never persisted to the database. */
  suggestedEndpointLabel: string;
  suggestedTags: string[];
}

/** Phase C (Tourism Data Framework) — SBP's internal "new provider
 * registration" notification, sent to RESEND_TO_EMAIL once registerProvider
 * has successfully written the provider + detail records. Same never-throw
 * posture as the three functions above. */
export async function sendProviderRegistrationNotification(params: ProviderRegistrationNotificationParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[provider_registration_notification_skipped_no_provider]", { businessName: params.businessName });
    return;
  }

  const toEmail = process.env.RESEND_TO_EMAIL;
  if (!toEmail) {
    console.warn("[provider_registration_notification_skipped_no_recipient]", { businessName: params.businessName });
    return;
  }

  try {
    const resend = getClient(apiKey);
    await resend.emails.send({
      from: getFromAddress(),
      to: toEmail,
      subject: `New provider registration pending verification — ${params.businessName}`,
      text: [
        `New provider self-registration received — pending verification.`,
        ``,
        `Business name: ${params.businessName}`,
        `Category: ${params.providerCategory}`,
        `Nation: ${params.nationCode}`,
        `Contact email: ${params.contactEmail}`,
        `Submitted: ${params.submittedAt}`,
        `Payment method: ${params.paymentMethod}`,
        `Payment reference: ${params.paymentReference}`,
        ``,
        `Claude's suggested public-facing label: ${params.suggestedEndpointLabel}`,
        `Claude's suggested tags: ${params.suggestedTags.join(", ")}`,
        ``,
        `Review in Supabase (tourism_providers, verification_status = 'pending'):`,
        `https://supabase.com/dashboard/project/poiiwcbriqwczmppoevd/editor`,
      ].join("\n"),
    });
  } catch (err) {
    console.error("[provider_registration_notification_send_failed]", {
      businessName: params.businessName,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
