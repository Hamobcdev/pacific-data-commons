"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { generateTourismDemoBrief } from "@/actions/demo/tourism-brief";
import { TourismBriefResult } from "./TourismBriefResult";
import type { PacificTravelBrief } from "@/lib/demo/types";

const DESTINATIONS = [
  { code: "WS", name: "Samoa" },
  { code: "FJ", name: "Fiji" },
  { code: "TO", name: "Tonga" },
  { code: "CK", name: "Cook Islands" },
  { code: "PG", name: "Papua New Guinea" },
  { code: "VU", name: "Vanuatu" },
  { code: "SB", name: "Solomon Islands" },
];

const TRAVEL_WINDOWS = [
  { value: "next_90_days", label: "Next 90 Days" },
  { value: "christmas_2026", label: "Christmas 2026" },
  { value: "school_holidays", label: "School Holidays" },
];

/**
 * Configure -> Generate -> Result, no wallet step (unlike AgentRunForm's
 * Configure -> Preview -> Payment) — the demo page never collects a user
 * payment, the server action pays from SBP's own agent wallet server-side.
 * Client component only for the loading/result state transition
 * (useTransition), same reasoning as AgentRunForm.
 */
export function TourismDemoForm({ initialDestination, initialWindow }: { initialDestination?: string; initialWindow?: string }) {
  const t = useTranslations("Demo.tourism");
  const [isPending, startTransition] = useTransition();
  const [destination, setDestination] = useState(initialDestination && DESTINATIONS.some((d) => d.code === initialDestination) ? initialDestination : "WS");
  const [travelWindow, setTravelWindow] = useState(
    initialWindow && TRAVEL_WINDOWS.some((w) => w.value === initialWindow) ? initialWindow : "next_90_days",
  );
  const [brief, setBrief] = useState<PacificTravelBrief | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = () => {
    setError(null);
    startTransition(async () => {
      const result = await generateTourismDemoBrief(destination, travelWindow);
      if (!result.success) {
        // Always the one generic, translated message — result.message is
        // English-only internal detail for logs/debugging, not shown to a
        // non-technical audience (brief: "Do not expose technical errors").
        setError(t("error"));
        return;
      }
      setBrief(result.brief);
    });
  };

  const handleReset = () => {
    setBrief(null);
    setError(null);
  };

  const destinationName = DESTINATIONS.find((d) => d.code === destination)?.name ?? destination;

  if (brief) {
    return (
      <div className="space-y-4">
        <TourismBriefResult brief={brief} destinationName={destinationName} />
        <Button variant="secondary" onClick={handleReset}>
          {t("generate_button")}
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="form-label block text-gray-700">
          {t("destination_label")}
          <Select
            options={DESTINATIONS.map((d) => ({ value: d.code, label: d.name }))}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            disabled={isPending}
          />
        </label>

        <label className="form-label block text-gray-700">
          {t("window_label")}
          <Select
            options={TRAVEL_WINDOWS}
            value={travelWindow}
            onChange={(e) => setTravelWindow(e.target.value)}
            disabled={isPending}
          />
        </label>

        {error && <Alert variant="error">{error}</Alert>}

        {isPending ? (
          <div className="rounded-md border border-ocean/20 bg-light-bg p-4 text-sm text-navy" role="status">
            <p className="font-medium">{t("generating")}</p>
            <p className="text-gray-600 mt-1">{t("generating_detail")}</p>
          </div>
        ) : (
          <Button variant="primary" onClick={handleGenerate} disabled={isPending}>
            {t("generate_button")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
