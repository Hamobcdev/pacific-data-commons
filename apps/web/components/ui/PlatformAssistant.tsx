"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

// P8 (Pacific connectivity): never time out a request before the
// connection has had a real chance on a slow link. 20s gives headroom
// above the 15s floor rather than sitting right on it.
const FETCH_TIMEOUT_MS = 20_000;

/** Session 14 — maps the current route to the assistant's context, which
 * shapes the focus area of the system prompt server-side (see
 * app/api/assistant/route.ts's CONTEXT_FOCUS). Mounted once in the root
 * layout, so this runs on every route — public and authenticated. */
function getAssistantContext(pathname: string): string {
  if (pathname.includes("/wallet")) return "wallet";
  if (pathname.includes("/onboard")) return "onboarding";
  if (pathname.includes("/agents")) return "agents";
  if (pathname.includes("/data")) return "report";
  if (pathname.includes("/search")) return "directory";
  return "general";
}

type PanelState = "idle" | "loading" | "answered" | "error";

export function PlatformAssistant() {
  const pathname = usePathname();
  const context = getAssistantContext(pathname ?? "");

  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<PanelState>("idle");
  const [answer, setAnswer] = useState<string | null>(null);

  const handleClose = () => {
    setOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || state === "loading") return;

    setState("loading");
    setAnswer(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed, context }),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => undefined)) as { answer?: string } | undefined;

      if (!res.ok || !body?.answer) {
        setState("error");
        return;
      }

      setAnswer(body.answer);
      setState("answered");
    } catch {
      setState("error");
    } finally {
      clearTimeout(timeout);
    }
  };

  const handleAskAgain = () => {
    setQuestion("");
    setAnswer(null);
    setState("idle");
  };

  return (
    // Sticky (not fixed): stays pinned near the bottom of the viewport
    // while its containing block scrolls past, but — unlike a fixed
    // overlay — it's part of normal document flow and moves with the
    // page rather than hovering over content regardless of scroll
    // position, per the brief's "not fixed to viewport" requirement.
    <div className="pointer-events-none sticky bottom-4 z-40 flex justify-end px-4">
      <div className="pointer-events-auto w-full max-w-full sm:w-96 sm:max-w-96">
        {open && (
          <Card className="mb-3">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Ask a question</CardTitle>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close assistant"
                className="rounded-md p-1 text-gray-400 hover:bg-light-bg hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean"
              >
                ✕
              </button>
            </CardHeader>
            <CardContent className="space-y-3">
              {state === "answered" && answer ? (
                <>
                  <p className="whitespace-pre-wrap text-base text-navy">{answer}</p>
                  <Button type="button" variant="secondary" className="w-full" onClick={handleAskAgain}>
                    Ask another question
                  </Button>
                </>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <Input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask about wallets, payments, or this platform…"
                    maxLength={500}
                    disabled={state === "loading"}
                    aria-label="Your question"
                  />

                  {state === "loading" && (
                    <div className="flex items-center gap-2 text-sm text-gray-500" role="status" aria-live="polite">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-ocean border-t-transparent" aria-hidden="true" />
                      Thinking…
                    </div>
                  )}

                  {state === "error" && (
                    <p className="text-sm text-red-600" role="alert">
                      Assistant temporarily unavailable. Please try again.
                    </p>
                  )}

                  <Button type="submit" variant="primary" className="w-full" disabled={!question.trim() || state === "loading"}>
                    {state === "loading" ? "Thinking…" : "Ask"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-label={open ? "Close help" : "Ask a question"}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full bg-navy text-xl font-semibold text-white shadow-lg",
              "hover:bg-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean focus-visible:ring-offset-2",
            )}
          >
            ?
          </button>
        </div>
      </div>
    </div>
  );
}
