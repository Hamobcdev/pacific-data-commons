-- Session 22 — corrects providers.wallet_address for the SBP Pilot
-- Provider to match reality. Confirmed live (curling
-- pdcpilot-endpoint-production.up.railway.app/summary and decoding its
-- 402 PAYMENT-REQUIRED response's accepts[0].payTo) that
-- @pdc/pilot-endpoint's actual x402 payTo address is
-- LN745UCDQNFIBDY6JFW7FNK333MADQZQVQFMCVR3GXXUTB52O2NYPZN3YY — the same
-- wallet apps/directory-api uses for its own $0.01 directory-query fee —
-- not the Q5XTALN45D32I572OZAVZ4FW6UYSW6A4FFAX4YOY6PP3YCD4JJJ3JQRYKI
-- previously recorded here. User-confirmed: LN745 is correct — SBP
-- operates the demo pilot listing itself during the POC, so its own
-- treasury wallet is the legitimate payTo, not a bug. The DB value was
-- stale/wrong, not the live Railway config.
--
-- Q5XTALN45D32I572OZAVZ4FW6UYSW6A4FFAX4YOY6PP3YCD4JJJ3JQRYKI remains
-- correct elsewhere as apps/sbp-agent's own buyer wallet (AGENT_WALLET_ADDRESS)
-- — a separate identity. This correction also removes what would otherwise
-- read as the SBP demo agent paying itself.
UPDATE providers
SET wallet_address = 'LN745UCDQNFIBDY6JFW7FNK333MADQZQVQFMCVR3GXXUTB52O2NYPZN3YY'
WHERE id = '23688689-502a-437d-939b-3288d8292534';
