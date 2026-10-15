"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// Same P8 (Pacific connectivity) reasoning as PlatformAssistant's
// FETCH_TIMEOUT_MS — never time out before a slow link has had a real
// chance.
const FETCH_TIMEOUT_MS = 20_000;

const MAX_FIELD_LENGTH = 500;

type FormState = "idle" | "loading" | "success" | "error";

/**
 * Disclosures page lead-capture form. Same client-component shape as
 * PlatformAssistant.tsx — controlled inputs, a small state machine,
 * AbortController timeout. POST /api/disclosures/enquiry sends the email
 * directly — no DB write of its own.
 */
export function DisclosuresEnquiryForm() {
  const t = useTranslations("Disclosures");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "loading") return;

    setState("loading");
    setErrorMessage(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch("/api/disclosures/enquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, organisation, message }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => undefined)) as { message?: string } | undefined;

      if (!res.ok) {
        setErrorMessage(data?.message ?? t("formErrorGeneric"));
        setState("error");
        return;
      }

      setState("success");
    } catch {
      setErrorMessage(t("formErrorGeneric"));
      setState("error");
    } finally {
      clearTimeout(timeout);
    }
  };

  if (state === "success") {
    return <p className="text-base text-gray-700">{t("formSuccess")}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div>
        <label htmlFor="disclosures-name" className="block text-sm font-medium text-navy">
          {t("formNameLabel")}
        </label>
        <Input
          id="disclosures-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={MAX_FIELD_LENGTH}
          disabled={state === "loading"}
        />
      </div>

      <div>
        <label htmlFor="disclosures-email" className="block text-sm font-medium text-navy">
          {t("formEmailLabel")}
        </label>
        <Input
          id="disclosures-email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={MAX_FIELD_LENGTH}
          disabled={state === "loading"}
        />
      </div>

      <div>
        <label htmlFor="disclosures-organisation" className="block text-sm font-medium text-navy">
          {t("formOrganisationLabel")}
        </label>
        <Input
          id="disclosures-organisation"
          name="organisation"
          value={organisation}
          onChange={(e) => setOrganisation(e.target.value)}
          maxLength={MAX_FIELD_LENGTH}
          disabled={state === "loading"}
        />
      </div>

      <div>
        <label htmlFor="disclosures-message" className="block text-sm font-medium text-navy">
          {t("formMessageLabel")}
        </label>
        <Textarea
          id="disclosures-message"
          name="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          maxLength={MAX_FIELD_LENGTH}
          disabled={state === "loading"}
        />
      </div>

      {state === "error" && errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      <Button type="submit" disabled={state === "loading"}>
        {state === "loading" ? t("formSubmitting") : t("formSubmit")}
      </Button>
    </form>
  );
}
