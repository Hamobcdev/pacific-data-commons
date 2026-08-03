/**
 * Registration page right-side panel — rotating synthetic-but-realistic
 * placeholder content (provider spotlight, dataset promotion, research
 * output, competition context). Desktop only, CSS-only crossfade, respects
 * prefers-reduced-motion (shows a static first slide instead of animating).
 *
 * Fixed to the viewport's right edge rather than participating in the
 * shared onboarding shell's max-w-2xl centered column (components/onboarding
 * layout.tsx), so this page can have a wide two-zone layout without
 * widening the shell for every other onboarding step.
 */
const SLIDE_COUNT = 4;
const SLIDE_SECONDS = 6;
const TRANSITION_SECONDS = 1;
const CYCLE_SECONDS = SLIDE_COUNT * SLIDE_SECONDS;

export function InstitutionalPanel() {
  return (
    <aside
      aria-hidden="true"
      className="hidden lg:block fixed right-0 top-0 h-full w-[380px] overflow-hidden bg-gradient-to-b from-[#0D4F6B] to-[#0A1628] text-white"
    >
      <style>{`
        @keyframes pdc-panel-fade {
          0%, ${(100 / SLIDE_COUNT - 2).toFixed(2)}% { opacity: 1; }
          ${(100 / SLIDE_COUNT).toFixed(2)}%, 100% { opacity: 0; }
        }
        .pdc-panel-slide {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 2.5rem;
          opacity: 0;
          animation: pdc-panel-fade ${CYCLE_SECONDS}s ease-in-out infinite;
        }
        .pdc-panel-slide:nth-child(1) { animation-delay: 0s; }
        .pdc-panel-slide:nth-child(2) { animation-delay: ${SLIDE_SECONDS * 1}s; }
        .pdc-panel-slide:nth-child(3) { animation-delay: ${SLIDE_SECONDS * 2}s; }
        .pdc-panel-slide:nth-child(4) { animation-delay: ${SLIDE_SECONDS * 3}s; }
        @media (prefers-reduced-motion: reduce) {
          .pdc-panel-slide { animation: none; opacity: 0; }
          .pdc-panel-slide:nth-child(1) { opacity: 1; }
        }
      `}</style>

      <div className="pdc-panel-slide">
        <p className="text-2xl">🌊</p>
        <h3 className="mt-3 text-lg font-semibold">Pacific Data in Action</h3>
        <p className="mt-2 text-sm text-white/80">
          &ldquo;Our fisheries dataset has been queried by researchers across 12 countries. The USDC earnings go
          directly to our research fund — no intermediary, no delay.&rdquo;
        </p>
        <p className="mt-4 text-xs font-medium text-white/60">School of Marine Studies, Pacific Region</p>
        <p className="text-xs text-white/60">Bronze Verified Provider</p>
      </div>

      <div className="pdc-panel-slide">
        <p className="text-2xl">📊</p>
        <h3 className="mt-3 text-lg font-semibold">Featured Dataset</h3>
        <p className="mt-2 text-sm text-white/80">Pacific Ocean Temperature Records</p>
        <p className="text-sm text-white/80">18 years of EEZ monitoring data</p>
        <p className="mt-4 text-xs font-medium text-white/60">Available from $0.01 per query</p>
        <p className="text-xs text-white/60">Real-time access. No subscription required.</p>
      </div>

      <div className="pdc-panel-slide">
        <p className="text-2xl">📄</p>
        <h3 className="mt-3 text-lg font-semibold">Built on Pacific Data</h3>
        <p className="mt-2 text-sm text-white/80">&ldquo;Pacific Tuna Stock Assessment 2023–2024&rdquo;</p>
        <p className="mt-1 text-xs text-white/60">Peer-reviewed. Citable. Reproducible.</p>
        <p className="text-xs text-white/60">Data sourced through Pacific Data Commons</p>
      </div>

      <div className="pdc-panel-slide">
        <p className="text-2xl">🏆</p>
        <h3 className="mt-3 text-lg font-semibold">Algorand x402 Global Challenge</h3>
        <p className="mt-2 text-sm text-white/80">Pacific Data Commons — Live on Mainnet</p>
        <p className="text-sm text-white/80">Real Pacific data. Real payments. Real impact.</p>
        <p className="mt-4 text-xs font-medium text-white/60">$100K USD + 500K ALGO prize pool</p>
      </div>
    </aside>
  );
}
