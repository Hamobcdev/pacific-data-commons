"use client";

import { useState } from "react";

const ITEMS = [
  "I have a dataset ready to upload, or I know the URL of my existing endpoint",
  "I understand my data stays on my institution's infrastructure",
  "I understand payments are received in USDC (USD-pegged digital currency)",
];

/**
 * Session 37A — folds the deprecated /onboarding/checklist page's content
 * into this step as a non-blocking, collapsed-by-default reminder. Purely
 * informational: nothing here is persisted or gates progression, same
 * posture the old checklist page itself already had.
 */
export function ReadinessChecklist() {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<boolean[]>(() => ITEMS.map(() => false));

  return (
    <div className="border-t border-gray-200 pt-4">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left text-base font-medium text-gray-700 min-h-[44px]"
      >
        <span>Before you continue — readiness checklist</span>
        <span aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <ul className="space-y-2.5">
            {ITEMS.map((label, index) => (
              <li key={label}>
                <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked[index]}
                    onChange={() =>
                      setChecked((prev) => prev.map((value, i) => (i === index ? !value : value)))
                    }
                    className="mt-0.5 h-5 w-5 min-h-[20px] min-w-[20px] shrink-0 rounded border-gray-300 text-ocean focus:ring-ocean"
                  />
                  <span>{label}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500">
            These are reminders, not requirements. You can continue without ticking these — but they help avoid
            surprises later in the process.
          </p>
        </div>
      )}
    </div>
  );
}
