#!/usr/bin/env tsx
/**
 * PDC Agent Registration Script
 *
 * Inserts all six SBP first-party agents (Section 19) into the `agents`
 * table. developer_id is left NULL (first-party, not a third-party
 * developer registration), verification_tier is 'certified' (SBP's own
 * agents skip the unverified/verified stages a third-party agent would go
 * through), operational_wallet is derived from AGENT_WALLET_KEY via
 * @pdc/x402-adapter rather than taken as a separate AGENT_WALLET_ADDRESS
 * env var — deriving it guarantees the address written to the DB can never
 * drift from the key apps/agents actually signs attribution records and
 * payments with.
 *
 * Idempotent per agent_type (developer_id IS NULL) — safe to re-run.
 *
 * Prerequisites:
 *   - SUPABASE_URL and SUPABASE_SERVICE_KEY set in environment
 *   - AGENT_WALLET_KEY set (same value apps/agents/.env uses)
 *
 * Run: npx tsx scripts/register-agents.ts
 *
 * Output: each agent's id — set these as apps/agents/.env's
 * TRADE_AGENT_ID / CLIMATE_AGENT_ID / FISHERIES_AGENT_ID /
 * AGRICULTURAL_AGENT_ID / REMITTANCE_AGENT_ID / GRANTS_AGENT_ID.
 */
import { createClient } from "@supabase/supabase-js";
import { getManualPaymentAddress } from "@pdc/x402-adapter";
import type { AgentType } from "@pdc/shared-types";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "AGENT_WALLET_KEY"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

interface AgentSeed {
  envVarName: string;
  agent_name: string;
  agent_type: AgentType;
  description: string;
}

const AGENT_SEEDS: AgentSeed[] = [
  {
    envVarName: "TRADE_AGENT_ID",
    agent_name: "Pacific Trade Intelligence",
    agent_type: "trade_intelligence",
    description: "Export trends, price movements, and market comparison for Pacific commodities.",
  },
  {
    envVarName: "CLIMATE_AGENT_ID",
    agent_name: "Pacific Climate Risk",
    agent_type: "climate_risk",
    description: "Structured risk assessment for cyclone, drought, sea level, and coral bleaching.",
  },
  {
    envVarName: "FISHERIES_AGENT_ID",
    agent_name: "Pacific Fisheries Status",
    agent_type: "fisheries_status",
    description: "Stock assessment with ocean condition context for Pacific tuna and coastal species.",
  },
  {
    envVarName: "AGRICULTURAL_AGENT_ID",
    agent_name: "Pacific Agricultural Exports",
    agent_type: "agricultural_exports",
    description: "Market outlook and planting guidance for Pacific export crops.",
  },
  {
    envVarName: "REMITTANCE_AGENT_ID",
    agent_name: "Pacific Remittance Navigator",
    agent_type: "remittance_navigator",
    description: "Corridor rates, volume trends, and seasonal patterns for Pacific remittance flows.",
  },
  {
    envVarName: "GRANTS_AGENT_ID",
    agent_name: "Pacific Grant Matcher",
    agent_type: "grant_matcher",
    description: "Match your institution to active Pacific funding programmes.",
  },
];

async function registerAgents(): Promise<void> {
  console.log("PDC Agent Registration Script");
  console.log("==============================");

  const operationalWallet = getManualPaymentAddress(process.env.AGENT_WALLET_KEY!);
  console.log(`Operational wallet: ${operationalWallet}`);
  console.log("");

  const envVarLines: string[] = [];

  for (const seed of AGENT_SEEDS) {
    const { data: existing, error: existingError } = await supabase
      .from("agents")
      .select("id")
      .eq("agent_type", seed.agent_type)
      .is("developer_id", null)
      .maybeSingle();

    if (existingError) {
      console.error(`Existing-agent lookup failed for ${seed.agent_name}:`, existingError.message);
      process.exit(1);
    }

    if (existing) {
      console.log(`${seed.agent_name} already registered: ${existing.id}`);
      envVarLines.push(`${seed.envVarName}=${existing.id}`);
      continue;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("agents")
      .insert({
        agent_name: seed.agent_name,
        agent_type: seed.agent_type,
        developer_id: null,
        operational_wallet: operationalWallet,
        verification_tier: "certified",
        respects_indigenous_flag: true,
        respects_cultural_sensitivity: true,
        is_active: true,
        listed_at: new Date().toISOString(),
        description: seed.description,
        version: "1.0",
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error(`Insert failed for ${seed.agent_name}:`, insertError?.message);
      process.exit(1);
    }

    console.log(`${seed.agent_name} registered: ${inserted.id}`);
    envVarLines.push(`${seed.envVarName}=${inserted.id}`);
  }

  console.log("");
  console.log("Set these in apps/agents/.env:");
  console.log(envVarLines.join("\n"));
}

registerAgents();
