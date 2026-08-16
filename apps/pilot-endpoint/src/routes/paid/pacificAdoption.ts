import { Hono } from "hono";
import { PACIFIC_ADOPTION_NATIONS, PACIFIC_ADOPTION_METADATA } from "../../data/pacificAdoption.js";
import { DATASET_METADATA } from "../../data/fisheries.js";
import type { AppBindings } from "../../types.js";

export const pacificAdoptionRoute = new Hono<AppBindings>();

/** Session 21 (Deliverable 2) — see pacificAdoption.ts's doc comment. */
pacificAdoptionRoute.get("/pacific/blockchain-adoption", (c) => {
  const nations = PACIFIC_ADOPTION_NATIONS;

  return c.json({
    ...PACIFIC_ADOPTION_METADATA,
    nations,
    summary_statistics: {
      total_nations_covered: nations.length,
      nations_with_regulatory_sandbox: nations.filter((n) => n.regulatory_sandbox).length,
      nations_with_cbdc_research: nations.filter((n) => n.cbdc_research).length,
      nations_with_digital_economy_strategy: nations.filter((n) => n.digital_economy_strategy).length,
      lagatoi_signatories: nations.filter((n) => n.lagatoi_signatory).length,
      live_blockchain_infrastructure: nations.filter((n) => n.blockchain_infrastructure).length,
    },
    competition_tag: DATASET_METADATA.competition_tag,
    queried_at: new Date().toISOString(),
  });
});
