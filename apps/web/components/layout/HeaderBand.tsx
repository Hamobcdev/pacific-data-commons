import Image from "next/image";

interface HeaderBandProps {
  /** Overlay darkness, 0-100. Plain number (not a Tailwind opacity class)
   * because Tailwind can't safely purge a dynamically-built class name. */
  overlayOpacity?: number;
  /** Content overlaid on top of the band — e.g. brand link + section label. */
  children?: React.ReactNode;
}

/**
 * Full-width Pacific-motif header band (Session 12 fix) — shared by the
 * authenticated, onboarding, and agents shells plus the finance office
 * brief page, so the same image, height, and overlay treatment can't drift
 * between them the way the three independent hand-rolled bands did before
 * this fix.
 */
export function HeaderBand({ overlayOpacity = 40, children }: HeaderBandProps) {
  return (
    <div className="relative w-full h-16 xl:h-20 overflow-hidden flex-shrink-0">
      <Image
        src="/images/header-dashboard-band.webp"
        alt="Pacific Data Commons"
        fill
        priority
        className="object-cover object-center"
        sizes="100vw"
      />
      <div className="absolute inset-0 bg-pacific-shell-dark" style={{ opacity: overlayOpacity / 100 }} />
      {children && <div className="relative z-10 h-full">{children}</div>}
    </div>
  );
}
