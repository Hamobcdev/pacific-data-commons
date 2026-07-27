import { S3Client } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 client (S3-compatible). Server-side only — credentials come
 * from CLOUDFLARE_R2_* env vars, never sent to the browser (R2 rule).
 * The browser talks to R2 directly via presigned URLs generated with this
 * client (see actions/upload/*.ts); raw file bytes never pass through this
 * Next.js server.
 */
export function createR2Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY!,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY!,
    },
  });
}

export function getR2Bucket(): string {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;
  if (!bucket) throw new Error("CLOUDFLARE_R2_BUCKET is not configured");
  return bucket;
}
