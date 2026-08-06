import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * Dark footer for the authenticated shell (Session 12). Server component —
 * no interactivity needed, so it stays off the client bundle entirely.
 */
export async function GlobalFooter() {
  const t = await getTranslations("Footer");
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-pacific-shell-dark mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <Image
              src="/images/sbp-logo.png"
              alt="Synergy Blockchain Pacific"
              width={32}
              height={32}
              className="object-contain opacity-80"
            />
            <div>
              <p className="text-white/80 text-sm font-medium">{t("brand")}</p>
              <p className="footer-text text-white/40 mt-0.5">by {t("company")}</p>
            </div>
          </div>

          {/* Links */}
          <nav className="footer-text flex flex-wrap gap-4 text-white/50">
            <Link href="/agents" className="hover:text-white/80 transition-colors">
              {t("agentMarketplace")}
            </Link>
            <Link href="/downloads/finance-office-brief" className="hover:text-white/80 transition-colors">
              {t("walletGuide")}
            </Link>
            <Link href="/faq" className="hover:text-white/80 transition-colors">
              {t("faq")}
            </Link>
            <a href="mailto:anthony@synergybcpacific.com" className="hover:text-white/80 transition-colors">
              {t("contact")}
            </a>
            <a
              href="https://synergybcpacific.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/80 transition-colors"
            >
              synergybcpacific.com
            </a>
          </nav>
        </div>

        {/* Bottom bar */}
        <div className="mt-6 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <p className="footer-text text-white/30">
            © {currentYear} {t("company")}. {t("location")}. {t("allRights")}.
          </p>
          <p className="footer-text text-white/20">
            {t("pilot")} · {t("dataNote")} · {t("feeNote")}
          </p>
        </div>
      </div>
    </footer>
  );
}
