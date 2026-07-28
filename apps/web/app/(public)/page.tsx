import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

// Scaffold landing page — the full buyer-facing search/marketing site is
// Session 7. This resolves "/" itself: (public) is a route group (no URL
// segment), so this file IS the root page. A separate app/page.tsx would
// collide with it (Next.js rejects two pages resolving to the same path) —
// see Session 5 report for why app/page.tsx doesn't exist.
export default async function LandingPage() {
  const t = await getTranslations("Landing");
  const tAgents = await getTranslations("Agents.nav");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-bold text-navy">{t("title")}</h1>
      <p className="max-w-md text-gray-600">{t("subtitle")}</p>
      <Link href="/onboarding/register">
        <Button>{t("cta")}</Button>
      </Link>
      <Link href="/agents" className="text-sm text-ocean hover:underline">
        {tAgents("linkLabel")}
      </Link>
    </main>
  );
}
