"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

export interface SubmitRatingResult {
  success: boolean;
  error?: string;
}

const submitRatingSchema = z.object({
  endpointId: z.string().uuid(),
  providerId: z.string().uuid(),
  raterWalletAddress: z.string().length(58).regex(/^[A-Z2-7]{58}$/, "This does not look like a valid Algorand address"),
  queryTxId: z.string().min(1, "A transaction ID proving your paid query is required"),
  rating: z.enum(["positive", "negative"]),
});

export type SubmitRatingInput = z.infer<typeof submitRatingSchema>;

/**
 * Records a post-query rating (Decision 28 — Silver tier bootstrap).
 * community_ratings.query_verified starts FALSE here: on-chain verification
 * that queryTxId is a real, paid Algorand transaction against this endpoint
 * is a separate piece of infrastructure this session does not build (no
 * existing code path in this repo verifies an arbitrary tx id on-chain yet
 * — flagged at end of session). The unique (endpoint_id, rater_wallet_address)
 * constraint (session1_migration.sql) already enforces one rating per
 * wallet per endpoint without any extra application-layer check here.
 */
export async function submitRating(input: SubmitRatingInput): Promise<SubmitRatingResult> {
  const parsed = submitRatingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = createServiceClient();

  const { error } = await supabase.from("community_ratings").insert({
    endpoint_id: parsed.data.endpointId,
    provider_id: parsed.data.providerId,
    rater_wallet_address: parsed.data.raterWalletAddress,
    query_tx_id: parsed.data.queryTxId,
    rating: parsed.data.rating,
    rating_channel: "wallet_api",
  });

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "You've already rated this dataset." };
    }
    console.error("Rating submission failed:", error);
    return { success: false, error: "Could not submit your rating. Please try again." };
  }

  if (parsed.data.rating === "positive") {
    const { error: thresholdError } = await supabase.rpc("check_silver_threshold", { p_endpoint_id: parsed.data.endpointId });
    if (thresholdError) {
      // Non-fatal — the rating itself is already recorded; the Silver
      // upgrade check can be re-run later without losing the vote.
      console.error("Silver threshold check failed:", thresholdError);
    }
  }

  return { success: true };
}
