import { Hono } from "hono";
import { DATASET_METADATA } from "../../data/fisheries.js";
import type { AppBindings } from "../../types.js";

export const skillsPdpRoute = new Hono<AppBindings>();

/** Pacific Data Protocol-format skills file (CLAUDE.md Decision 15). */
skillsPdpRoute.get("/skills-pdp.json", (c) => {
  return c.json({
    pdp_version: "1.0",
    category: "fisheries",
    sub_category: "tuna_stock_assessment",
    provider: {
      institution: DATASET_METADATA.institution,
      country: DATASET_METADATA.country,
      trust_tier: "bronze",
      competition_tag: DATASET_METADATA.competition_tag,
    },
    sovereignty: {
      indigenous_data: false,
      cultural_sensitivity: "none",
      data_type: "synthetic_demonstration",
      permitted_use: ["testing", "platform_demonstration"],
      not_permitted_use: ["research", "commercial_decisions", "policy"],
    },
    provenance: {
      integrity_endpoint: "/integrity",
      provenance_endpoint: "/provenance",
      hash_algorithm: "sha256",
      cert_status: "pending",
    },
    data_warning: "SYNTHETIC DATA — demonstration only",
  });
});
