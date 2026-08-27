import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { PacificTravelBrief } from "@/lib/demo/types";

interface Props {
  brief: PacificTravelBrief;
  destinationName: string;
}

const CONFIDENCE_VARIANT: Record<PacificTravelBrief["confidence"], "success" | "warning" | "neutral"> = {
  high: "success",
  medium: "warning",
  low: "neutral",
};

/**
 * Displays the structured PacificTravelBrief cleanly. All text in the
 * brief (executive_summary, event names, booking_advice, ...) is
 * synthesised from public-source data via Claude and rendered as plain
 * text here — never dangerouslySetInnerHTML, same P9 posture as every
 * other LLM-output display surface in this app.
 */
export function TourismBriefResult({ brief, destinationName }: Props) {
  const t = useTranslations("Demo.tourism");
  const confidenceKey = `confidence_${brief.confidence}` as const;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>{t("results_title", { destination: destinationName })}</CardTitle>
          <Badge variant={CONFIDENCE_VARIANT[brief.confidence]}>{t(confidenceKey)}</Badge>
        </CardHeader>
        <CardContent>
          <p className="text-base text-navy leading-relaxed">{brief.executive_summary}</p>
        </CardContent>
      </Card>

      {brief.weather && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>{t("weather_title")}</CardTitle>
            <Badge variant={brief.weather.tourism_rating === "Excellent" || brief.weather.tourism_rating === "Good" ? "success" : "warning"}>
              {brief.weather.tourism_rating}
            </Badge>
          </CardHeader>
          <CardContent>
            <p className="text-base text-navy">{brief.weather.current_conditions}</p>
            <p className="text-sm text-gray-600 mt-1">{brief.weather.week_summary}</p>
            <p className="text-xs text-gray-400 mt-2">{t("weather_source", { days: brief.weather.forecast_days })}</p>
          </CardContent>
        </Card>
      )}

      {brief.upcoming_events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("events_title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {brief.upcoming_events.map((event) => (
              <div key={`${event.name}-${event.dates}`} className="rounded-md border border-gray-100 bg-light-bg/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-navy">{event.name}</span>
                  {event.impact && (
                    <Badge variant={event.impact === "very_high" || event.impact === "high" ? "success" : "neutral"}>
                      {event.impact.replace(/_/g, " ")}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-1">{event.dates}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {brief.exchange_rates && (
        <Card>
          <CardHeader>
            <CardTitle>{t("rates_title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-gray-500 mb-3">{brief.exchange_rates.note}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="py-1 pr-4 font-medium">Currency</th>
                    <th className="py-1 font-medium">Per 1 USD</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(brief.exchange_rates.key_rates).map(([code, rate]) => (
                    <tr key={code} className="border-b border-gray-100 last:border-0">
                      <td className="py-1.5 pr-4 text-navy font-medium">{code}</td>
                      <td className="py-1.5 text-gray-700">{rate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {brief.tourism_stats && (
        <Card>
          <CardHeader>
            <CardTitle>{t("stats_title", { year: brief.tourism_stats.year })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {brief.tourism_stats.international_arrivals != null && (
              <p className="text-gray-700">{t("stats_arrivals", { count: brief.tourism_stats.international_arrivals.toLocaleString() })}</p>
            )}
            {brief.tourism_stats.avg_spend_per_visitor_usd != null && (
              <p className="text-gray-700">{t("stats_avg_spend", { amount: brief.tourism_stats.avg_spend_per_visitor_usd.toLocaleString() })}</p>
            )}
            {brief.tourism_stats.peak_months && brief.tourism_stats.peak_months.length > 0 && (
              <p className="text-gray-700">{t("stats_peak_months", { months: brief.tourism_stats.peak_months.join(", ") })}</p>
            )}
            <p className="text-xs text-gray-400 mt-2">{brief.tourism_stats.source}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("booking_title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="border-l-2 border-ocean pl-3 text-sm text-gray-700 leading-relaxed">{brief.booking_advice}</p>
        </CardContent>
      </Card>

      {brief.data_warning && (
        <Alert variant="warning">
          <p className="text-sm">{brief.data_warning}</p>
        </Alert>
      )}

      <div className="rounded-lg border border-gray-100 bg-light-bg/50 p-4 text-xs text-gray-600 leading-relaxed">
        <p>
          {t("payment_trail", { count: brief.data_sources.length, amount: brief.total_sub_payments_usdc.toFixed(3) })}{" "}
          <abbr title={t("usdc_tooltip")} className="cursor-help no-underline border-b border-dotted border-gray-400">
            {t("usdc_hint")}
          </abbr>
        </p>
        <p className="mt-2 text-gray-400">{t("powered_by")}</p>
      </div>
    </div>
  );
}
