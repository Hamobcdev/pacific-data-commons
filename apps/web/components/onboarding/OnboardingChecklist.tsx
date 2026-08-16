"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

interface ChecklistGroup {
  heading: string;
  items: string[];
}

/**
 * Client-side orientation gate (Session 19) between the wallet step and
 * upload — deliberately NOT a tracked OnboardingStep (see WalletForm.tsx's
 * routing comment): no backend validation, nothing persisted about which
 * boxes were checked. The only effect of completing it is navigating on to
 * /onboarding/upload; a provider who reloads or returns later simply sees
 * the boxes unchecked again, which is fine — its purpose is orientation
 * before the first visit, not a gate to re-clear every time.
 */
export function OnboardingChecklist({ groups }: { groups: ChecklistGroup[] }) {
  const t = useTranslations("Onboarding.Checklist");
  const router = useRouter();

  const allItemIds = groups.flatMap((group, groupIndex) => group.items.map((_, itemIndex) => `${groupIndex}-${itemIndex}`));
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const allChecked = allItemIds.every((id) => checked.has(id));

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-8">
      {groups.map((group, groupIndex) => (
        <div key={group.heading}>
          <h2 className="text-base font-semibold text-navy">{group.heading}</h2>
          <ul className="mt-3 space-y-2.5">
            {group.items.map((label, itemIndex) => {
              const id = `${groupIndex}-${itemIndex}`;
              return (
                <li key={id}>
                  <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked.has(id)}
                      onChange={() => toggle(id)}
                      className="mt-0.5 h-5 w-5 min-h-[20px] min-w-[20px] shrink-0 rounded border-gray-300 text-ocean focus:ring-ocean"
                    />
                    <span>{label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="flex flex-col gap-3 border-t border-gray-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <a href="mailto:anthony@synergybcpacific.com" className="text-sm text-ocean hover:underline">
          {t("needHelp")}
        </a>
        <Button type="button" disabled={!allChecked} onClick={() => router.push("/onboarding/upload")} className="min-h-[44px]">
          {t("startButton")}
        </Button>
      </div>
    </div>
  );
}
