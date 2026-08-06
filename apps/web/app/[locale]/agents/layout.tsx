import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { HeaderBand } from "@/components/layout/HeaderBand";
import { PacificSidePanel } from "@/components/layout/PacificSidePanel";
import { InstitutionalPanel } from "@/components/register/InstitutionalPanel";
import { GlobalFooter } from "@/components/nav/GlobalFooter";

/**
 * Agents section shell — full marketplace layout (Session 7; Session 6.1
 * left this as a scaffold with no dashboard link since /dashboard didn't
 * exist yet). Session 12 fix: the narrow night-islands header band this
 * shell shipped with is gone — that image now lives in PacificSidePanel for
 * this route, and this uses the same HeaderBand every other shell uses.
 * GlobalFooter added (was missing entirely before this fix).
 */
export default async function AgentsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("Agents.nav");

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <HeaderBand overlayOpacity={50}>
        <div className="flex items-center justify-between h-full px-4 max-w-5xl mx-auto w-full">
          <Link href="/agents" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            {/* Session 12 fix: this was a plain decorative `bg-white/90`
                div — never an actual logo image — which is what read as a
                white square against the dark band. */}
            <Image src="/images/sbp-logo.png" alt="Synergy Blockchain Pacific" width={32} height={32} className="object-contain" />
            <span className="font-semibold text-white text-sm">Pacific Data Commons</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-xs text-white/70 hover:text-white">
              Provider Dashboard
            </Link>
            <span className="text-xs text-white/70">{t("label")}</span>
          </div>
        </div>
      </HeaderBand>

      <div className="flex flex-1 min-h-0">
        <PacificSidePanel side="left" />

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>

        <aside
          className="hidden xl:flex flex-col flex-shrink-0 w-48 2xl:w-56
            sticky top-0 h-screen overflow-hidden border-l border-gray-100"
        >
          <InstitutionalPanel />
        </aside>
      </div>

      <GlobalFooter />
    </div>
  );
}
