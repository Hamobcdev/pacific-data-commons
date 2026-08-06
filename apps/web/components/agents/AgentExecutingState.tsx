"use client";

import { useEffect, useState } from "react";

const SLOW_CONNECTION_MESSAGE_AT_SECONDS = 45;
const TIMEOUT_AT_SECONDS = 120;

/**
 * P8 (Pacific connectivity) loading state — visible the instant execution
 * starts (a synchronous state change, well inside the 200ms requirement),
 * never disappearing on its own before 120 seconds. The parent
 * (AgentRunForm) owns what happens at the 120s mark: it keeps awaiting the
 * real request in the background even after this fires `onTimeout`, so a
 * response that arrives late still reaches the user instead of being
 * silently dropped.
 */
export function AgentExecutingState({ phase, onTimeout }: { phase: "paying" | "waiting"; onTimeout: () => void }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (phase !== "waiting") return undefined;
    const interval = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (elapsed >= TIMEOUT_AT_SECONDS) onTimeout();
  }, [elapsed, onTimeout]);

  const message =
    phase === "paying"
      ? "Waiting for your wallet to confirm the payment on-chain…"
      : elapsed >= SLOW_CONNECTION_MESSAGE_AT_SECONDS
        ? "This is taking longer than usual. Your payment has been confirmed — your report will appear when ready. Do not refresh this page."
        : "Your agent is querying Pacific data sources. This may take up to 30 seconds on slower connections.";

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 py-12 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-ocean border-t-transparent" aria-hidden="true" />
      <p className="max-w-sm text-base text-gray-600">{message}</p>
    </div>
  );
}
