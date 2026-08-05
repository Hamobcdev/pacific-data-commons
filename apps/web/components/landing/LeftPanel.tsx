"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ResumeOtp } from "@/components/onboarding/ResumeOtp";

/**
 * Landing hero glass panel — brand, primary/secondary CTAs, and the OTP
 * "already registered" resume path, all over the pdc-landing.png hero.
 * Client component only because ResumeOtp is (state machine, server
 * actions) — everything else here is static.
 *
 * ResumeOtp's open-state card is a hardcoded light `bg-white` surface (see
 * that component) with no theme/className prop — wrapped here in a
 * translucent `bg-white/10 backdrop-blur-sm` shell so it reads cleanly
 * against the dark hero instead of being restyled internally.
 */
export function LeftPanel() {
  const t = useTranslations("Landing");
  const tAgents = useTranslations("Agents.nav");

  return (
    <div className="glass-panel w-full max-w-sm p-8 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-white">{t("title")}</h1>
        <p className="text-sm text-white/80">{t("tagline")}</p>
      </div>

      <hr className="border-white/20" />

      <Link href="/onboarding/register" className="w-full">
        <Button className="w-full bg-ocean hover:bg-ocean/90 focus-visible:ring-white/50">{t("cta")}</Button>
      </Link>

      <Link
        href="/agents"
        className="text-sm text-white/80 hover:text-white text-center underline underline-offset-4 transition-colors duration-200"
      >
        {tAgents("linkLabel")} →
      </Link>

      <hr className="border-white/20" />

      <div className="rounded-lg overflow-hidden bg-white/10 backdrop-blur-sm p-3">
        <ResumeOtp variant="top" />
      </div>

      <p className="text-xs text-white/50 text-center">
        {t("pilotNote")} ·{" "}
        <a href="mailto:anthony@synergybcpacific.com" className="underline hover:text-white/80">
          {t("contactNote")}
        </a>
      </p>
    </div>
  );
}
