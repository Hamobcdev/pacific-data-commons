#!/usr/bin/env tsx
/**
 * PDC Pilot Seed Script
 *
 * Registers the pilot provider and endpoint in the PDC directory so the
 * pilot endpoint (apps/pilot-endpoint) appears in directory search results.
 * Run once after both Railway services are deployed — not part of any
 * app's own startup, not scheduled anywhere.
 *
 * Prerequisites:
 *   - SUPABASE_URL and SUPABASE_SERVICE_KEY set in environment
 *   - PILOT_ENDPOINT_URL set (e.g. https://pdc-pilot.up.railway.app)
 *   - AVM_ADDRESS set (SBP demo Algorand wallet address)
 *   - SBP_CONTACT_EMAIL set
 *
 * Run: npx tsx scripts/seed-pilot.ts
 * Re-run after changing the pilot's data: npx tsx scripts/seed-pilot.ts --force
 *
 * Output: Provider ID and Endpoint ID to set as env vars in Railway
 */
import { createClient } from "@supabase/supabase-js";
import type { PricingTier } from "@pdc/shared-types";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "PILOT_ENDPOINT_URL", "AVM_ADDRESS", "SBP_CONTACT_EMAIL"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

const PILOT_URL = process.env.PILOT_ENDPOINT_URL!;
const AVM_ADDRESS = process.env.AVM_ADDRESS!;
const CONTACT_EMAIL = process.env.SBP_CONTACT_EMAIL!;

const PRICING_TIERS: PricingTier[] = [
  { tier: 1, name: "Summary", description: "Key findings and stock status", price_usdc: 0.01, path: "/summary" },
  { tier: 2, name: "Data Slice", description: "Filtered by species, year, zone", price_usdc: 0.5, path: "/slice" },
  { tier: 3, name: "Full Dataset", description: "All 18 records", price_usdc: 25.0, path: "/full" },
  { tier: 4, name: "Expert Package", description: "Data + methodology + citation", price_usdc: 200.0, path: "/expert" },
  { tier: 5, name: "Commission", description: "Custom query (manual POC)", price_usdc: 1000.0, path: "/commission" },
];

async function seed(): Promise<void> {
  console.log("PDC Pilot Seed Script");
  console.log("=====================");
  console.log(`Pilot URL: ${PILOT_URL}`);
  console.log(`Wallet:    ${AVM_ADDRESS}`);
  console.log("");

  // Check for existing seed — idempotent. maybeSingle() (not single()) so
  // "no provider yet" — the common first-run case — returns { data: null,
  // error: null } instead of a PGRST116 "no rows" error to discard.
  const { data: existing, error: existingError } = await supabase
    .from("providers")
    .select("id")
    .eq("contact_email", CONTACT_EMAIL)
    .maybeSingle();

  if (existingError) {
    console.error("Existing-provider lookup failed:", existingError.message);
    process.exit(1);
  }

  if (existing) {
    console.log(`Provider already seeded: ${existing.id}`);
    if (!process.argv.includes("--force")) {
      console.log("Run with --force to delete and re-seed.");
      process.exit(0);
    }
    // ON DELETE CASCADE on endpoints.provider_id and skills_files.endpoint_id
    // (session1_migration.sql) means this also removes the pilot's endpoint
    // and skills_files rows. It does NOT cascade from provenance_certificates,
    // community_ratings, dispute_flags, or transactions_log — --force will
    // fail with a foreign key violation once any of those exist for this
    // provider, which is the correct behaviour (don't silently orphan real
    // buyer activity to re-seed demo metadata).
    const { error: deleteError } = await supabase.from("providers").delete().eq("id", existing.id);
    if (deleteError) {
      console.error("Force delete failed (likely real activity now references this provider):", deleteError.message);
      process.exit(1);
    }
    console.log("Existing provider deleted. Re-seeding...");
  }

  console.log("1. Creating pilot provider...");
  const { data: provider, error: providerError } = await supabase
    .from("providers")
    .insert({
      institution_name: "Pacific Data Commons — SBP Platform Demonstration",
      institution_type: "private",
      provider_track: "international",
      country: "Samoa",
      contact_email: CONTACT_EMAIL,
      contact_name: "Synergy Blockchain Pacific",
      wallet_address: AVM_ADDRESS,
      usdc_opted_in: true,
      trust_tier: "bronze",
      verified_government: false,
      provider_pct: 97,
      sbp_fee_pct: 3,
      fee_collection_consent: true,
      fee_threshold_usdc: 10.0,
      onboarding_status: "active",
      is_active: true,
    })
    .select("id")
    .single();

  if (providerError || !provider) {
    console.error("Provider insert failed:", providerError?.message);
    process.exit(1);
  }
  console.log(`   Provider created: ${provider.id}`);

  console.log("2. Creating pilot endpoint...");
  const { data: endpoint, error: endpointError } = await supabase
    .from("endpoints")
    .insert({
      provider_id: provider.id,
      endpoint_url: PILOT_URL,
      health_check_url: `${PILOT_URL}/health`,
      integrity_url: `${PILOT_URL}/integrity`,
      data_category: "fisheries",
      data_sub_category: "tuna_stock_assessment",
      title: "Pacific Tuna Stock Assessment — PDC Demo (Synthetic)",
      description:
        "Platform demonstration endpoint. Synthetic tuna catch volume and stock index data for Samoa and Tonga EEZs, 2018-2023. Shows the Pacific Data Commons payment infrastructure. DEMO DATA — not for research or commercial use.",
      geography_country: ["Samoa", "Tonga"],
      geography_region: "Samoa and Tonga EEZ",
      time_period_start: 2018,
      time_period_end: 2023,
      update_frequency: "static",
      pricing_tiers: PRICING_TIERS,
      max_tier_at_bronze: 2,
      sensitivity_level: null,
      personal_data_flag: "non_personal",
      commercial_eligibility: "fully_commercial",
      indigenous_data_flag: false,
      cultural_sensitivity: "none",
      permitted_use_cases: ["commercial", "research", "government"],
      attribution_required: true,
      attribution_format: "Pacific Data Commons Platform Demo. Synergy Blockchain Pacific, 2026.",
      donor_conditions: null,
      competition_tag: "x402-global-challenge",
      bazaar_registered: false,
      health_status: "unknown",
      is_active: true,
    })
    .select("id")
    .single();

  if (endpointError || !endpoint) {
    console.error("Endpoint insert failed:", endpointError?.message);
    await supabase.from("providers").delete().eq("id", provider.id);
    process.exit(1);
  }
  console.log(`   Endpoint created: ${endpoint.id}`);

  console.log("3. Creating skills file record...");
  const { error: skillsError } = await supabase.from("skills_files").insert({
    endpoint_id: endpoint.id,
    provider_id: provider.id,
    agentmarket_skills_url: `${PILOT_URL}/skills-agentmarket.json`,
    pdp_skills_url: `${PILOT_URL}/skills-pdp.json`,
    agentmarket_registered: false,
    bazaar_registered: false,
    version: "1.0",
  });

  if (skillsError) {
    console.warn("Skills file record failed (non-fatal):", skillsError.message);
  } else {
    console.log("   Skills file record created");
  }

  console.log("4. Verifying seed...");
  const { data: verify } = await supabase
    .from("endpoints")
    .select("id, title, is_active, provider:providers(institution_name, trust_tier)")
    .eq("id", endpoint.id)
    .single();

  if (!verify) {
    console.error("Verification failed — endpoint not found after insert");
    process.exit(1);
  }

  console.log("");
  console.log("Seed complete.");
  console.log("═══════════════════════════════════════");
  console.log(`Provider ID:  ${provider.id}`);
  console.log(`Endpoint ID:  ${endpoint.id}`);
  console.log("");
  console.log("Set these as environment variables in Railway:");
  console.log(`DIRECTORY_PROVIDER_ID=${provider.id}`);
  console.log(`DIRECTORY_ENDPOINT_ID=${endpoint.id}`);
  console.log("");
  console.log("Next: confirm the pilot endpoint is reachable.");
  console.log(`curl ${PILOT_URL}/health`);
}

seed().catch((err: unknown) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
