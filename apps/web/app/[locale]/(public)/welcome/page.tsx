import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getResumedProvider } from "@/lib/onboarding/resume";
import { GlobalNav } from "@/components/nav/GlobalNav";
import { GlobalFooter } from "@/components/nav/GlobalFooter";
import { HeaderBand } from "@/components/layout/HeaderBand";
import { PacificSidePanel } from "@/components/layout/PacificSidePanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Three-path routing page (Session 19, Fix 2) — replaces the previous
 * behaviour of dumping every returning visitor straight into whatever
 * onboarding step they last left off at (see resume-session.ts's Session
 * 19 fix for the login-redirect half of this; this page is the
 * "incomplete workflows are accessible from the dashboard, not forced on
 * login" destination, reachable as an explicit "start over" link rather
 * than an automatic redirect).
 *
 * (public) route group has no shared layout (same as faq/page.tsx) — the
 * three-column scaffold is built inline here, same pattern. Unlike FAQ,
 * this page's nav should reflect real auth state (a signed-in provider
 * landing here should see their own dashboard/sign-out links, not the
 * guest nav), so the resumed-provider lookup runs for real rather than
 * passing null unconditionally.
 */
export default async function WelcomePage() {
  const t = await getTranslations("Welcome");
  const provider = await getResumedProvider();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <GlobalNav provider={provider} />
      <HeaderBand>
        <div className="flex items-end h-full px-6 pb-3">
          <h1 className="text-white text-lg font-semibold">{t("title")}</h1>
        </div>
      </HeaderBand>

      <div className="flex flex-1 min-h-0">
        <PacificSidePanel side="left" />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-4xl px-6 py-10">
            <h2 className="text-xl font-bold text-navy">{t("question")}</h2>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <Card className="flex flex-col justify-between">
                <div>
                  <CardHeader>
                    <CardTitle>{t("share.title")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p>{t("share.description")}</p>
                  </CardContent>
                </div>
                <Link href="/onboarding/register" className="mt-4">
                  <Button type="button" className="w-full min-h-[44px]">
                    {t("share.cta")}
                  </Button>
                </Link>
              </Card>

              <Card className="flex flex-col justify-between">
                <div>
                  <CardHeader>
                    <CardTitle>{t("find.title")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p>{t("find.description")}</p>
                  </CardContent>
                </div>
                <Link href="/data" className="mt-4">
                  <Button type="button" variant="secondary" className="w-full min-h-[44px]">
                    {t("find.cta")}
                  </Button>
                </Link>
              </Card>

              <Card className="flex flex-col justify-between">
                <div>
                  <CardHeader>
                    <CardTitle>{t("build.title")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p>{t("build.description")}</p>
                  </CardContent>
                </div>
                <Link href="/agents" className="mt-4">
                  <Button type="button" variant="secondary" className="w-full min-h-[44px]">
                    {t("build.cta")}
                  </Button>
                </Link>
              </Card>
            </div>
          </div>
        </main>
      </div>

      <GlobalFooter />
    </div>
  );
}
