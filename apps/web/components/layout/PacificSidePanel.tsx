"use client";

import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

const IMAGE_MAP: Record<string, string> = {
  "/dashboard": "/images/panel-dashboard-reef.webp",
  "/agents": "/images/panel-agents-night-islands.webp",
  "/onboarding/register": "/images/panel-onboarding-canoe.webp",
  "/onboarding/wallet": "/images/panel-onboarding-canoe.webp",
  "/onboarding/upload": "/images/panel-fale-lagoon.webp",
  "/onboarding/review": "/images/panel-fisherman-dawn.webp",
  "/onboarding/provenance": "/images/panel-fisherman-dawn.webp",
  "/onboarding/deploy": "/images/panel-apia-harbour.webp",
  "/onboarding/complete": "/images/panel-apia-harbour.webp",
  "/onboarding/new-dataset": "/images/panel-fale-lagoon.webp",
};

const MESSAGE_KEY_MAP: Record<string, string> = {
  "/dashboard": "dashboard",
  "/agents": "agents",
  "/onboarding/register": "register",
  "/onboarding/wallet": "wallet",
  "/onboarding/upload": "upload",
  "/onboarding/review": "review",
  "/onboarding/provenance": "review",
  "/onboarding/deploy": "deploy",
  "/onboarding/complete": "complete",
  "/onboarding/new-dataset": "upload",
};

/**
 * `usePathname()` here comes from `@/i18n/navigation` (next-intl's
 * `createNavigation`, not `next/navigation`) — it already strips the
 * locale prefix before returning (see
 * next-intl/dist/development/navigation/react-client/useBasePathname.js:
 * `unprefixPathname` runs unconditionally when the path is prefixed). A
 * pathname here is already "/dashboard", never "/en/dashboard", so no
 * further stripping is applied — doing so (e.g. chopping a leading
 * `/[a-z]{2}` guess) would corrupt every route whose first segment happens
 * to start with two lowercase letters, which is nearly all of them
 * ("/dashboard" -> "shboard").
 */
function getImageForPath(pathname: string): string {
  if (IMAGE_MAP[pathname]) return IMAGE_MAP[pathname];
  if (pathname.startsWith("/data/")) return "/images/panel-underwater-coral.webp";
  if (pathname.startsWith("/downloads/")) return "/images/panel-underwater-coral.webp";
  return "/images/panel-dashboard-reef.webp";
}

function getMessageKeyForPath(pathname: string): string {
  return MESSAGE_KEY_MAP[pathname] ?? "default";
}

interface PacificSidePanelProps {
  side: "left" | "right-placeholder";
}

export function PacificSidePanel({ side: _side }: PacificSidePanelProps) {
  const pathname = usePathname();
  const t = useTranslations("SidePanel");
  const image = getImageForPath(pathname);
  const messageKey = getMessageKeyForPath(pathname);

  return (
    <aside
      className="hidden xl:flex flex-col flex-shrink-0 w-48 2xl:w-56
        relative overflow-hidden sticky top-14 h-[calc(100vh-56px)]"
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 bg-cover bg-center transition-all duration-700"
        style={{ backgroundImage: `url('${image}')` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-pacific-shell-dark/90 via-pacific-shell-dark/30 to-pacific-shell-dark/10" />
      <div className="relative z-10 mt-auto p-4">
        <p className="text-white font-medium text-sm leading-snug mb-1">{t(`${messageKey}.title`)}</p>
        <p className="text-white/55 text-sm leading-relaxed">{t(`${messageKey}.body`)}</p>
      </div>
    </aside>
  );
}
