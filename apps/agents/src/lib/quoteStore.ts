import type { AgentQuote } from "@pdc/shared-types";

export type { AgentQuote };

/**
 * In-memory quote store (Session 13). Sufficient for a single-instance
 * Railway deployment — same scaling note as WalletRateLimiter
 * (lib/rateLimiter.ts): move to a shared store (Redis, or a Supabase table)
 * if this service is ever scaled to multiple instances, since a quote
 * created on one instance would be invisible to execute() landing on
 * another.
 *
 * Expired/used quotes are pruned opportunistically on every write rather
 * than on a timer — this service has no background scheduler, and quote
 * volume is low enough (one per user per agent configuration attempt) that
 * an unbounded-but-slow-growing map between prunes is not a real memory
 * concern.
 */
class QuoteStore {
  private readonly quotes = new Map<string, AgentQuote>();

  private prune(): void {
    const now = Date.now();
    for (const [id, quote] of this.quotes) {
      if (new Date(quote.quote_expires_at).getTime() < now && quote.used === false) {
        // Expired and never redeemed — safe to drop. Used quotes are kept
        // (not pruned by expiry) so a slightly-delayed execute() against an
        // already-redeemed quote still gets a clear "already used" error
        // instead of "quote not found".
        this.quotes.delete(id);
      }
    }
  }

  save(quote: AgentQuote): void {
    this.prune();
    this.quotes.set(quote.quote_id, quote);
  }

  get(quoteId: string): AgentQuote | undefined {
    return this.quotes.get(quoteId);
  }

  /** Marks a quote used in place — called immediately after on-chain
   * payment verification succeeds, before the agent executes, so a second
   * concurrent request against the same quote_id+tx_id can't also pass. */
  markUsed(quoteId: string): void {
    const quote = this.quotes.get(quoteId);
    if (quote) quote.used = true;
  }
}

export const quoteStore = new QuoteStore();
