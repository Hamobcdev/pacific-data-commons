"use client";

import { useState, useTransition } from "react";
import { submitRating } from "@/actions/ratings/submit-rating";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export interface RateDatasetModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasetId: string;
  providerId: string;
  /** Algorand transaction ID proving the paid query — pre-filled from the
   * completed payment, per Decision 28's on-chain-proof requirement. */
  transactionId: string;
}

/**
 * Post-query rating modal — appears after a successful agent run and asks
 * the buyer to rate the dataset with their paying wallet (Decision 28:
 * Silver tier requires 3 verified purchaser upvotes).
 */
export function RateDatasetModal({ isOpen, onClose, datasetId, providerId, transactionId }: RateDatasetModalProps) {
  const [walletAddress, setWalletAddress] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleRate = (rating: "positive" | "negative") => {
    setError(null);
    startTransition(async () => {
      const result = await submitRating({
        endpointId: datasetId,
        providerId,
        raterWalletAddress: walletAddress,
        queryTxId: transactionId,
        rating,
      });
      if (result.success) {
        setSubmitted(true);
      } else {
        setError(result.error ?? "Could not submit your rating.");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        {submitted ? (
          <>
            <p className="font-medium text-navy">Thanks for rating this dataset.</p>
            <Button type="button" className="mt-4 w-full" onClick={onClose}>
              Close
            </Button>
          </>
        ) : (
          <>
            <p className="font-medium text-navy">How was this dataset?</p>
            <p className="mt-1 text-sm text-gray-600">Rate with the wallet that paid for this query — helps this provider reach Silver tier.</p>

            <label htmlFor="rater-wallet" className="mt-4 block text-xs font-medium text-gray-500">
              Your Algorand wallet address
            </label>
            <Input id="rater-wallet" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} placeholder="58-character address" />

            {error && (
              <Alert variant="error" className="mt-3">
                {error}
              </Alert>
            )}

            <div className="mt-4 flex gap-3">
              <Button type="button" className="flex-1" disabled={isPending || walletAddress.length !== 58} onClick={() => handleRate("positive")}>
                👍 Good
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={isPending || walletAddress.length !== 58}
                onClick={() => handleRate("negative")}
              >
                👎 Not good
              </Button>
            </div>

            <button type="button" onClick={onClose} className="mt-3 w-full text-center text-xs text-gray-400 hover:underline">
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  );
}
