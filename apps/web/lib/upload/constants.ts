/**
 * Safe to import from both server and client code (chunked.ts runs in the
 * browser; supabase-storage.ts and the upload server actions run on the
 * server) — deliberately split out of supabase-storage.ts, which pulls in
 * lib/supabase/server.ts (next/headers, server-only) and would break the
 * client bundle if chunked.ts imported it directly.
 */
export const PDC_UPLOADS_BUCKET = "pdc-uploads";
