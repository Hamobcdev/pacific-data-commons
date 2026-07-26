/** Mirrors `community_ratings` (session1_migration.sql, DOMAIN 1). Unique on
 * (endpoint_id, rater_wallet_address) — one rating per wallet per endpoint. */
export type RatingValue = "positive" | "negative";
export type RatingChannel = "wallet_api" | "email_prompt";

export interface CommunityRating {
  id: string;
  endpoint_id: string;
  provider_id: string;

  rater_wallet_address: string;
  query_tx_id: string;
  query_verified: boolean;

  rating: RatingValue;
  rating_channel: RatingChannel;

  signed_message: string | null;
  signature: string | null;

  rater_email: string | null;
  email_token: string | null;

  created_at: string;
}

/** Mirrors `dispute_flags` (session1_migration.sql, DOMAIN 1). Unique on
 * (endpoint_id, flagger_wallet) — one flag per wallet per endpoint. */
export type DisputeCategory = "data_quality" | "data_mismatch" | "access_issue" | "pricing_dispute" | "other";
export type DisputeStatus = "open" | "provider_notified" | "resolved" | "withdrawn";

export interface DisputeFlag {
  id: string;
  endpoint_id: string;
  provider_id: string;

  flagger_wallet: string;
  flagger_query_tx_id: string;

  dispute_description: string;
  dispute_category: DisputeCategory | null;

  status: DisputeStatus;
  resolved_at: string | null;
  resolution_note: string | null;

  created_at: string;
}
