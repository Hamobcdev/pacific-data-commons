"use client";

import { useState } from "react";

/** Collapsed-by-default PSR explainer on the for-providers page (Session 37A). */
export function PsrDisclosure() {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-lg border border-gray-200 p-5">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left text-base font-medium text-navy min-h-[44px]"
      >
        <span>What is the Pacific Service Registry?</span>
        <span aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            The Pacific Service Registry (PSR) is the open specification that defines how Pacific data service
            endpoints are registered, discovered, and paid for. PDC is the live implementation of that specification
            — the network your endpoint joins when you register. Other Pacific institutions implement PSR on their
            own sovereign infrastructure and connect to PDC for discovery and payment routing, the same way
            countries implement X-Road rather than depending on Estonia to run it for them.
          </p>

          <ul className="space-y-1">
            <li>
              <a
                href="/psr/v1/spec.json"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ocean hover:underline"
              >
                PSR specification (technical reference)
              </a>
            </li>
            <li>
              <a
                href="/psr/v1/endpoint-schema.json"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ocean hover:underline"
              >
                Endpoint schema (field definitions)
              </a>
            </li>
          </ul>

          <p className="text-xs text-gray-500">These are technical documents for your IT team.</p>
        </div>
      )}
    </section>
  );
}
