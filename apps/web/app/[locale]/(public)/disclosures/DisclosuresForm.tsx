"use client";

import { useState } from "react";

export default function DisclosuresForm() {
  const [formState, setFormState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [form, setForm] = useState({ name: "", email: "", organisation: "", message: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormState("submitting");
    try {
      const res = await fetch("/api/disclosures/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setFormState("success");
      } else {
        setFormState("error");
      }
    } catch {
      setFormState("error");
    }
  }

  if (formState === "success") {
    return (
      <div className="rounded-lg bg-green-50 border border-green-200 px-5 py-4 text-green-800 text-sm font-medium">
        Thank you — we&apos;ll be in touch.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            maxLength={200}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean/40 focus:border-ocean"
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            required
            maxLength={200}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean/40 focus:border-ocean"
            placeholder="your@email.com"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Organisation
        </label>
        <input
          type="text"
          maxLength={200}
          value={form.organisation}
          onChange={(e) => setForm((f) => ({ ...f, organisation: e.target.value }))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean/40 focus:border-ocean"
          placeholder="Your organisation (optional)"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Message <span className="text-red-500">*</span>
        </label>
        <textarea
          required
          maxLength={500}
          rows={4}
          value={form.message}
          onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean/40 focus:border-ocean resize-none"
          placeholder="Your message..."
        />
      </div>

      {formState === "error" && (
        <p className="text-sm text-red-600">
          Something went wrong — please try again or email anthony@synergybcpacific.com directly.
        </p>
      )}

      <button
        type="submit"
        disabled={formState === "submitting"}
        className="inline-block px-5 py-2.5 bg-ocean text-white rounded-lg text-sm font-medium hover:bg-navy transition-colors disabled:opacity-60"
      >
        {formState === "submitting" ? "Sending…" : "Send Enquiry"}
      </button>
    </form>
  );
}
