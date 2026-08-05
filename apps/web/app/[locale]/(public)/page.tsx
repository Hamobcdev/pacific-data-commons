import Image from "next/image";
import { LeftPanel } from "@/components/landing/LeftPanel";
import { PulseOverlay } from "@/components/landing/PulseOverlay";
import { InstitutionalPanel } from "@/components/register/InstitutionalPanel";

// Landing hero (Session 11). This resolves "/" itself: (public) is a route
// group (no URL segment), so this file IS the root page. A separate
// app/page.tsx would collide with it (Next.js rejects two pages resolving
// to the same path) — see Session 5 report for why app/page.tsx doesn't
// exist.
//
// min-h-screen (not h-screen) deliberately — DemoModeBanner in the root
// layout renders above this page in normal document flow when
// NEXT_PUBLIC_DEMO_MODE=true, and a rigid 100vh would get pushed below the
// fold by the banner's height instead of shrinking to fit.
//
// InstitutionalPanel is imported and reused as-is (see that file's own
// doc comment) — it only needs a sized column, not self-positioning, so
// giving it lg:w-72 xl:w-80 here is the entire integration; the file
// itself is untouched and the registration page's own usage is unaffected.
export default function LandingPage() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="absolute inset-0">
        <Image
          src="/images/pdc-landing.png"
          alt="Pacific Data Commons — sovereign data network connecting Pacific islands"
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
        />
      </div>

      <div className="absolute inset-0 bg-black/40 md:bg-black/35" />

      <PulseOverlay />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-10 px-6 py-12 lg:flex-row lg:items-center lg:justify-between lg:px-12">
        <LeftPanel />

        <div className="hidden lg:flex flex-1" />

        <div className="hidden lg:flex lg:w-72 xl:w-80 flex-shrink-0">
          <InstitutionalPanel />
        </div>
      </div>
    </div>
  );
}
