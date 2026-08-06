"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import algosdk from "algosdk";
import { useWallet } from "@txnlab/use-wallet-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { getAgentQuote } from "@/actions/agents/get-quote";
import { executeAgent, type ExecuteAgentResult, type ExecuteAgentErrorCode } from "@/actions/agents/execute-agent";
import { saveAgentReport } from "@/lib/agents/reportState";
import { usdcAssetId } from "@/lib/agents/algorand";
import { AlgorandWalletProvider } from "@/components/wallet/AlgorandWalletProvider";
import { QuoteDisplay } from "./QuoteDisplay";
import { AgentExecutingState } from "./AgentExecutingState";
import { AgentResult } from "./AgentResult";
import type { AgentCatalogueEntry } from "@/lib/agents/types";
import type { AgentOutput, AgentQuote } from "@pdc/shared-types";

type Phase = "loading_quote" | "quote" | "executing" | "result" | "error";
type ExecutingPhase = "paying" | "waiting";

const EXECUTE_TIMEOUT_MS = 120_000;

/**
 * Everything past the free dry-run preview (Session 13): fetch a real
 * quote, connect a wallet, sign an on-chain USDC payment, wait for
 * confirmation, then call execute(). Split out of AgentRunForm.tsx and
 * loaded via next/dynamic specifically so the wallet bundle this needs
 * (algosdk + Pera/Lute connect SDKs, ~200kB) never loads for a visitor who
 * hasn't confirmed a preview yet — see AgentRunForm.tsx's own comment.
 */
export function PaymentFlow({
  agent,
  parameters,
  userWallet,
  onBack,
  onRunAgain,
}: {
  agent: AgentCatalogueEntry;
  parameters: Record<string, string>;
  userWallet: string;
  onBack: () => void;
  onRunAgain: () => void;
}) {
  return (
    <AlgorandWalletProvider>
      <PaymentFlowInner agent={agent} parameters={parameters} userWallet={userWallet} onBack={onBack} onRunAgain={onRunAgain} />
    </AlgorandWalletProvider>
  );
}

function PaymentFlowInner({
  agent,
  parameters,
  userWallet,
  onBack,
  onRunAgain,
}: {
  agent: AgentCatalogueEntry;
  parameters: Record<string, string>;
  userWallet: string;
  onBack: () => void;
  onRunAgain: () => void;
}) {
  const t = useTranslations("AgentMarketplace");
  const { activeAddress, signTransactions, algodClient } = useWallet();
  const [phase, setPhase] = useState<Phase>("loading_quote");
  const [quote, setQuote] = useState<AgentQuote | null>(null);
  const [executingPhase, setExecutingPhase] = useState<ExecutingPhase>("paying");
  const [timedOut, setTimedOut] = useState(false);
  const [result, setResult] = useState<AgentOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  const unmountedRef = useRef(false);
  useEffect(
    () => () => {
      unmountedRef.current = true;
    },
    [],
  );

  const fetchQuote = () => {
    setPhase("loading_quote");
    setError(null);
    getAgentQuote(agent.id, parameters, userWallet).then((res) => {
      if (unmountedRef.current) return;
      if (!res.success) {
        setError(res.message);
        setPhase("error");
        return;
      }
      setQuote(res.quote);
      setPhase("quote");
    });
  };

  useEffect(() => {
    fetchQuote();
    // Fetch once on mount — parameters/userWallet come from the already-
    // confirmed preview and don't change while this component is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mapExecuteError = (code: ExecuteAgentErrorCode, message: string): string => {
    switch (code) {
      case "quote_expired":
        return "Your quote expired before payment was confirmed. Please request a new one.";
      case "quote_already_used":
        return "This quote has already been redeemed.";
      case "payment_not_verified":
        return `Your payment could not be verified: ${message}`;
      case "rate_limited":
        return t("error_unavailable");
      case "insufficient_data":
        return t("error_no_data");
      case "sovereignty_blocked":
        return t("error_sovereignty");
      default:
        return message;
    }
  };

  const handlePay = async () => {
    if (!activeAddress || !quote) return;
    setError(null);
    setIsPaying(true);
    setExecutingPhase("paying");
    setTimedOut(false);
    setPhase("executing");

    let txId: string;
    try {
      const suggestedParams = await algodClient.getTransactionParams().do();
      const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: activeAddress,
        receiver: quote.pay_to_address,
        assetIndex: usdcAssetId(),
        amount: Math.round(quote.total_usdc * 1_000_000),
        note: new TextEncoder().encode(quote.quote_id),
        suggestedParams,
      });

      const signed = await signTransactions([txn]);
      const signedBytes = signed.filter((b): b is Uint8Array => b !== null);
      if (signedBytes.length === 0) {
        throw new Error("Your wallet did not return a signed transaction.");
      }

      const { txid } = await algodClient.sendRawTransaction(signedBytes).do();
      await algosdk.waitForConfirmation(algodClient, txid, 4);
      txId = txid;
    } catch (err) {
      if (unmountedRef.current) return;
      setError(err instanceof Error ? err.message : "Payment failed. Please try again.");
      setIsPaying(false);
      setPhase("quote");
      return;
    }

    setExecutingPhase("waiting");

    const executePromise = executeAgent(agent.id, quote.quote_id, txId);
    const timeoutMarker = Symbol("timeout");
    const winner = await Promise.race([
      executePromise,
      new Promise<typeof timeoutMarker>((resolve) => setTimeout(() => resolve(timeoutMarker), EXECUTE_TIMEOUT_MS)),
    ]);

    if (winner === timeoutMarker) {
      setTimedOut(true);
      // Payment already happened — keep listening instead of discarding a
      // response that arrives after the visual timeout (P8: no infinite
      // loading, but a late-arriving real result must still reach the user).
      executePromise.then((res) => {
        if (unmountedRef.current) return;
        if (res.success) {
          setResult(res.output);
          saveAgentReport(agent.id, res.output);
          setPhase("result");
        } else {
          setError(mapExecuteError(res.code, res.message));
          setPhase("error");
        }
      });
      return;
    }

    const res = winner as ExecuteAgentResult;
    if (!res.success) {
      setError(mapExecuteError(res.code, res.message));
      setPhase("error");
      return;
    }
    setResult(res.output);
    saveAgentReport(agent.id, res.output);
    setPhase("result");
  };

  if (phase === "result" && result) {
    return <AgentResult output={result} onRunAgain={onRunAgain} />;
  }

  if (phase === "executing") {
    return (
      <Card>
        <CardContent>
          <AgentExecutingState phase={executingPhase} onTimeout={() => setTimedOut(true)} />
          {timedOut && (
            <Alert variant="warning">
              This is taking longer than expected. Your payment has been confirmed on-chain. If your report doesn&apos;t appear shortly,
              contact SBP at anthony@synergybcpacific.com — do not pay again.
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  if (phase === "loading_quote") {
    return (
      <Card>
        <CardContent>
          <div className="flex items-center justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-ocean border-t-transparent" aria-hidden="true" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (phase === "error") {
    return (
      <Card>
        <CardContent className="space-y-4">
          <Alert variant="error">{error}</Alert>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={onBack}>
              Back
            </Button>
            <Button type="button" variant="primary" onClick={fetchQuote}>
              Request a new quote
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (phase === "quote" && quote) {
    return (
      <QuoteDisplay quote={quote} walletConnected={Boolean(activeAddress)} onPay={handlePay} onExpired={fetchQuote} isPaying={isPaying} />
    );
  }

  return null;
}
