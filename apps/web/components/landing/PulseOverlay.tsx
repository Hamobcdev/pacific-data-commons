/**
 * PulseOverlay — animated SVG data-transfer pulses over the hero image,
 * traveling the same island-to-hub arcs already drawn into pdc-landing.png.
 *
 * Pure SVG `animateMotion` — no JavaScript, no external libraries, so this
 * stays a server component. Paused entirely under prefers-reduced-motion
 * (P8/WCAG 2.1 AA). pointer-events: none + aria-hidden — purely decorative,
 * never intercepts clicks on the CTAs/panels layered above it.
 *
 * Arc `d=` coordinates are approximate against a 1400x788 viewBox matched
 * to pdc-landing.png's aspect ratio — calibrate against the actual island
 * positions in the shipped image and adjust if they drift once viewed.
 */
export function PulseOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none z-[5]" aria-hidden="true">
      <svg
        className="w-full h-full"
        viewBox="0 0 1330 728"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="pdc-pulse-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00FFCC" stopOpacity="1" />
            <stop offset="70%" stopColor="#00FFCC" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#00FFCC" stopOpacity="0" />
          </radialGradient>
          <style>{`
            @media (prefers-reduced-motion: reduce) {
              .pdc-pulse-circle { display: none; }
            }
          `}</style>
        </defs>

        {/* Bottom-left island -> central hub */}
        <path id="pdc-arc-1" d="M 250 550 Q 480 140 540 394" fill="none" stroke="#00FFCC" strokeWidth="1" strokeOpacity="0.2" />
        {/* Top-left island -> central hub */}
        <path id="pdc-arc-2" d="M 300 340 Q 420 130 700 394" fill="none" stroke="#00FFCC" strokeWidth="1" strokeOpacity="0.2" />
        {/* Right island cluster -> central hub */}
        <path id="pdc-arc-3" d="M 880 300 Q 880 190 700 394" fill="none" stroke="#00FFCC" strokeWidth="1" strokeOpacity="0.2" />
        {/* Bottom-right island -> central hub */}
        <path id="pdc-arc-4" d="M 800 580 Q 830 490 700 394" fill="none" stroke="#00FFCC" strokeWidth="1" strokeOpacity="0.2" />
        {/* Far-right island -> central hub */}
        <path id="pdc-arc-5" d="M 1100 570 Q 960 360 700 394" fill="none" stroke="#00FFCC" strokeWidth="1" strokeOpacity="0.2" />

        <circle r="7" fill="url(#pdc-pulse-glow)" className="pdc-pulse-circle">
          <animateMotion dur="3s" repeatCount="indefinite" rotate="auto">
            <mpath href="#pdc-arc-1" />
          </animateMotion>
        </circle>
        <circle r="7" fill="url(#pdc-pulse-glow)" className="pdc-pulse-circle">
          <animateMotion dur="2.5s" repeatCount="indefinite" rotate="auto" begin="0.8s">
            <mpath href="#pdc-arc-2" />
          </animateMotion>
        </circle>
        <circle r="5" fill="url(#pdc-pulse-glow)" className="pdc-pulse-circle">
          <animateMotion dur="2s" repeatCount="indefinite" rotate="auto" begin="1.5s">
            <mpath href="#pdc-arc-3" />
          </animateMotion>
        </circle>
        <circle r="6" fill="url(#pdc-pulse-glow)" className="pdc-pulse-circle">
          <animateMotion dur="3.5s" repeatCount="indefinite" rotate="auto" begin="0.3s">
            <mpath href="#pdc-arc-4" />
          </animateMotion>
        </circle>
        <circle r="5" fill="url(#pdc-pulse-glow)" className="pdc-pulse-circle">
          <animateMotion dur="4s" repeatCount="indefinite" rotate="auto" begin="2s">
            <mpath href="#pdc-arc-5" />
          </animateMotion>
        </circle>
      </svg>
    </div>
  );
}
