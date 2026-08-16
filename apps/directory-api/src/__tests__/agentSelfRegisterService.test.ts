import { describe, expect, it } from "vitest";
import { selfRegisterAgent } from "../services/agentSelfRegisterService.js";
import { AppError, ValidationError } from "../lib/errors.js";
import { createFakeSupabase, getFakeInserts } from "./testUtils.js";

const VALID_WALLET = "Q5XTALN45D32I572OZAVZ4FW6UYSW6A4FFAX4YOY6PP3YCD4JJJ3JQRYKI";

const validBody = {
  agent_name: "SBP Pilot Agent",
  agent_type: "fisheries_status",
  operational_wallet: VALID_WALLET,
  description: "dogfooding agent",
};

describe("selfRegisterAgent", () => {
  it("inserts a new agent row when no existing row matches the wallet", async () => {
    const supabase = createFakeSupabase({
      agents: { data: [], insertResult: { id: "agent-1" } },
    });

    const result = await selfRegisterAgent(supabase, validBody);

    expect(result).toEqual({ agent_id: "agent-1" });
    const [insert] = getFakeInserts(supabase);
    expect(insert?.table).toBe("agents");
    expect(insert?.row).toMatchObject({
      agent_name: "SBP Pilot Agent",
      agent_type: "fisheries_status",
      developer_id: null,
      operational_wallet: VALID_WALLET,
      is_active: true,
    });
  });

  it("returns the existing agent id without inserting when the wallet is already registered", async () => {
    const supabase = createFakeSupabase({
      agents: { data: [{ id: "agent-existing" }] },
    });

    const result = await selfRegisterAgent(supabase, validBody);

    expect(result).toEqual({ agent_id: "agent-existing" });
    expect(getFakeInserts(supabase)).toHaveLength(0);
  });

  it("rejects an invalid Algorand address", async () => {
    const supabase = createFakeSupabase({ agents: { data: [] } });
    await expect(selfRegisterAgent(supabase, { ...validBody, operational_wallet: "not-an-address" })).rejects.toThrow(ValidationError);
  });

  it("rejects an unknown agent_type", async () => {
    const supabase = createFakeSupabase({ agents: { data: [] } });
    await expect(selfRegisterAgent(supabase, { ...validBody, agent_type: "not_a_real_type" })).rejects.toThrow(ValidationError);
  });

  it("surfaces an insert failure as an AppError rather than throwing raw", async () => {
    const supabase = createFakeSupabase({
      agents: { data: [], writeError: { message: "insert failed" } },
    });
    await expect(selfRegisterAgent(supabase, validBody)).rejects.toThrow(AppError);
  });
});
