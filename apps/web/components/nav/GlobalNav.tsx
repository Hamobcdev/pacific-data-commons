"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { signOut } from "@/actions/auth/sign-out";

interface GlobalNavProps {
  provider: { providerId: string; onboardingStatus: string } | null;
}

/**
 * Sticky global header for the authenticated shell (Session 12). Client
 * component only for the mobile hamburger toggle and the sign-out button's
 * interactivity — `provider` itself is resolved server-side in
 * app/[locale]/(authenticated)/layout.tsx via getResumedProvider() and
 * passed down, never re-fetched here.
 */
export function GlobalNav({ provider }: GlobalNavProps) {
  const t = useTranslations("Nav");
  const [mobileOpen, setMobileOpen] = useState(false);

  // Session 19, Fix 5 — nav restructured for three user types. "Browse
  // Data" and "Agent Marketplace" are common to both authenticated and
  // guest visitors (buyer-facing, no login required — see the (public)/data
  // and /agents pages). "Add Dataset" is no longer a top-level item: it's
  // a provider action that lives inside the dashboard, not a directory-wide
  // nav concern. "For Providers" is the guest-only entry point to the
  // provider journey, replacing the old guest state's bare FAQ-only nav.
  const linkClass =
    "flex items-center px-3 py-2.5 sm:py-1.5 text-base text-white/70 hover:text-white " +
    "hover:bg-white/10 rounded-md transition-colors min-h-[44px] sm:min-h-0";

  const browseDataLink = (
    <Link href="/data" onClick={() => setMobileOpen(false)} className={linkClass}>
      {t("browseData")}
    </Link>
  );
  const agentMarketplaceLink = (
    <Link href="/agents" onClick={() => setMobileOpen(false)} className={linkClass}>
      {t("agents")}
    </Link>
  );
  const faqLink = (
    <Link href="/faq" onClick={() => setMobileOpen(false)} className={linkClass}>
      {t("faq")}
    </Link>
  );

  const navLinks = provider ? (
    <>
      <Link href="/dashboard" onClick={() => setMobileOpen(false)} className={linkClass}>
        {t("dashboard")}
      </Link>
      {browseDataLink}
      {agentMarketplaceLink}
      {faqLink}
      {/* Placeholder until a standalone wallet management page exists —
          this re-enters the onboarding wallet step directly (Session 12
          fix, Flag 2). */}
      <Link href="/onboarding/wallet" onClick={() => setMobileOpen(false)} className={linkClass}>
        {t("walletSettings")}
      </Link>
    </>
  ) : null;

  const guestLinks = (
    <>
      {browseDataLink}
      {agentMarketplaceLink}
      <Link href="/onboarding/register" onClick={() => setMobileOpen(false)} className={linkClass}>
        {t("forProviders")}
      </Link>
      {faqLink}
    </>
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-pacific-shell/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo + brand */}
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <Image
              src="/images/sbp-logo.png"
              alt="Synergy Blockchain Pacific"
              width={28}
              height={28}
              className="object-contain"
            />
            <span className="text-white font-medium text-sm hidden sm:block">{t("brand")}</span>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden sm:flex items-center gap-1">{provider ? navLinks : guestLinks}</nav>

          {/* Right side actions (desktop) */}
          <div className="hidden sm:flex items-center gap-2">
            {provider ? (
              <form action={signOut}>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-base text-white/60 hover:text-white hover:bg-white/10
                    rounded-md transition-colors"
                >
                  {t("signOut")}
                </button>
              </form>
            ) : (
              <Link
                href="/onboarding/register"
                className="px-3 py-1.5 text-base text-white bg-pacific-green hover:bg-pacific-green-dark
                  rounded-md transition-colors"
              >
                {t("register")}
              </Link>
            )}
          </div>

          {/* Mobile hamburger toggle */}
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? t("closeMenu") : t("openMenu")}
            className="sm:hidden flex items-center justify-center w-11 h-11 text-white/80 hover:text-white"
          >
            {mobileOpen ? (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-white/10 bg-pacific-shell px-4 pb-4 pt-2">
          <nav className="flex flex-col">{provider ? navLinks : guestLinks}</nav>
          <div className="mt-2">
            {provider ? (
              <form action={signOut}>
                <button
                  type="submit"
                  className="w-full flex items-center px-3 py-2.5 text-base text-white/60 hover:text-white
                    hover:bg-white/10 rounded-md transition-colors min-h-[44px]"
                >
                  {t("signOut")}
                </button>
              </form>
            ) : (
              <Link
                href="/onboarding/register"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center px-3 py-2.5 text-base text-white bg-pacific-green
                  hover:bg-pacific-green-dark rounded-md transition-colors min-h-[44px]"
              >
                {t("register")}
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
