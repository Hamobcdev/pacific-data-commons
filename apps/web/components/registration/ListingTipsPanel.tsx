"use client";

import { useEffect, useState } from "react";
import type { ProviderCategory } from "@/lib/tourism/providerFormSchema";

const STORAGE_KEY = "pdc_registration_tips_collapsed";

export interface ListingTipsPanelProps {
  category?: ProviderCategory;
}

const CATEGORY_TIPS: Record<ProviderCategory, string> = {
  accommodation:
    "Tip: Add your pool, spa, conference facilities, and wedding venue status. These are the most-searched filters for accommodation. Properties with room counts and price ranges get matched to budget-specific queries.",
  tour_operator:
    "Tip: Specify your activity types precisely. A listing tagged with multiple activity types surfaces in more searches. Add group size limits and pricing — agents filter by these when matching travellers to tours.",
  water_activities:
    "Tip: Dive operators — add your certification types and reef coordinates. These connect your listing to coral health and marine condition data queries. Surf operators — add skill level and season for better matches.",
  transport:
    "Tip: Add your full route details including origin, destination, and frequency. Transport operators with schedule information appear in itinerary-planning queries that accommodation-only listings miss.",
  food_beverage:
    "Tip: Add your dietary options, kava availability, and dining tier. Food queries are often filtered by these specific attributes. Kava bars and traditional food venues are high-interest categories for cultural tourism searches.",
  conference_events:
    "Tip: Add your capacity figures and AV standard. Event planners query by minimum capacity and technical requirements. Conference venues with complete specs appear in corporate travel and MICE queries.",
  local_guide:
    "Tip: List your languages and specific tour types. Multi-lingual guides and culturally-focused interpreters are increasingly searched by premium travel agents building bespoke Pacific itineraries.",
  market_vendor:
    "Tip: Specify your vendor type and trading days. Market vendors with clear product categories and operating hours appear in ‘things to do’ and ‘local shopping’ queries from both AI agents and travellers browsing manually.",
};

function loadCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
  } catch {
    // Storage full/unavailable (private browsing) — the toggle still works
    // for this session, it just won't be remembered on the next visit.
  }
}

/**
 * Collapsible tips panel shown alongside Step2Details. Step2's page
 * container (app/[locale]/(public)/register/page.tsx) is max-w-2xl, single
 * column — a true side-by-side panel would require widening that
 * container, which is out of scope for this component. Rendered as a card
 * below the form fields at every width instead: the same markup reads as a
 * mobile accordion and a desktop "card below the form" with no
 * breakpoint-specific layout switch needed.
 */
export function ListingTipsPanel({ category }: ListingTipsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Read the remembered state after mount only, matching the same
  // SSR-safe localStorage pattern RegistrationStepper's loadDraft() uses.
  useEffect(() => {
    setCollapsed(loadCollapsed());
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    saveCollapsed(next);
  }

  const categoryTip = category ? CATEGORY_TIPS[category] : undefined;

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
      >
        <span className="text-sm font-semibold text-navy">How to get the most from your listing</span>
        <span className="shrink-0 text-xs font-medium text-ocean">{collapsed ? "Show" : "Hide"}</span>
      </button>

      {!collapsed && (
        <div className="space-y-6 border-t border-gray-100 p-4 text-sm text-gray-700">
          {/* Section A — universal tips */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-navy">Get the most from your listing</h3>
            <p>
              Your PDC listing is machine-readable and queryable by AI agents, procurement platforms, and digital
              marketplaces 24 hours a day. The more detail you provide, the more searches you appear in — at no extra
              cost.
            </p>
            <p>A complete listing should include:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Your business name and a clear description</li>
              <li>Your location and contact details</li>
              <li>The specific services or products you offer</li>
              <li>Your pricing range</li>
              <li>Any certifications or special features</li>
            </ul>
            <p>
              Businesses with complete listings appear in significantly more AI-generated search results than
              incomplete ones.
            </p>
          </div>

          {/* Section B — category-specific tip, conditional on provider_category */}
          {categoryTip && (
            <div className="rounded-md bg-light-bg p-3">
              <p>{categoryTip}</p>
            </div>
          )}

          {/* Section C — who queries this directory */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-navy">Who queries this directory</h3>
            <ul className="space-y-1">
              <li>🌏 Tourists and travellers planning Pacific holidays</li>
              <li>🏢 Corporate travel and event planners</li>
              <li>🚢 Cruise and tour operators sourcing Pacific partners</li>
              <li>📦 International buyers looking for Pacific suppliers</li>
              <li>🔬 Researchers and government agencies</li>
              <li>🤖 AI travel assistants answering Pacific queries</li>
              <li>🤝 Businesses seeking local partners and distributors</li>
            </ul>
            <p>Your listing works for you around the clock — no ongoing cost, no maintenance required.</p>
          </div>

          {/* Section D — coming soon */}
          <p className="text-xs text-gray-500">
            PDC is expanding beyond tourism. If you have a retail store, professional services business, agricultural
            export, or any other Pacific business — contact us at{" "}
            <a href="mailto:anthony@synergybcpacific.com" className="text-ocean underline">
              anthony@synergybcpacific.com
            </a>{" "}
            to be notified when your industry opens for registration.
          </p>
        </div>
      )}
    </div>
  );
}
