/**
 * Safe to import from both server and client code (chunked.ts runs in the
 * browser; supabase-storage.ts and the upload server actions run on the
 * server) — deliberately split out of supabase-storage.ts, which pulls in
 * lib/supabase/server.ts (next/headers, server-only) and would break the
 * client bundle if chunked.ts imported it directly.
 */
export const PDC_UPLOADS_BUCKET = "pdc-uploads";

/**
 * Session 23 (Decision 58) — cold inbound upload fee. Split out here rather
 * than defined in actions/upload/upload-payment.ts: a "use server" file may
 * only export async functions, not constants, and UploadPaymentGate.tsx
 * (client component) needs these for its own display copy.
 */
export const UPLOAD_FEE_USDC = 25.0;
export const SCANNED_PDF_SURCHARGE_USDC = 10.0;
