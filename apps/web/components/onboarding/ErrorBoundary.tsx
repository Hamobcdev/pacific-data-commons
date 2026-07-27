"use client";

import { Component, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Rendered instead of the default recovery panel, if provided. */
  fallback?: ReactNode;
  /**
   * Translated strings for the default panel. A class component can't call
   * useTranslations() itself (hooks require function components), so the
   * parent Server Component passes these down from getTranslations() —
   * see app/onboarding/layout.tsx. Defaults exist so the boundary still
   * renders something sane if a consumer forgets to pass them (better than
   * throwing inside the thing that's supposed to catch throws).
   */
  title?: string;
  description?: string;
  reloadLabel?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * R5: no dead ends on errors — a render crash mid-onboarding must never
 * show a stack trace or a blank white screen. Local onboarding state
 * (localStorage) survives a remount, so "reload" here is a real recovery
 * path, not just a band-aid.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("Onboarding render error:", error);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <Alert variant="error">
        <p className="font-medium">{this.props.title ?? "Something went wrong loading this step."}</p>
        <p className="mt-1 text-red-700">
          {this.props.description ??
            "Your progress has been saved. Reloading usually fixes this — if it keeps happening, contact SBP and we'll help you finish manually."}
        </p>
        <Button variant="secondary" className="mt-3" onClick={() => window.location.reload()}>
          {this.props.reloadLabel ?? "Reload this page"}
        </Button>
      </Alert>
    );
  }
}
