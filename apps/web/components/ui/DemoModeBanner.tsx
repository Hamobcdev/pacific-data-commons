/**
 * Visible banner shown on every page when NEXT_PUBLIC_DEMO_MODE=true — makes
 * it impossible to mistake a demo session for production. Server component:
 * reads the env var directly, no client-side flicker before it appears.
 */
export function DemoModeBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return null;

  return (
    <div className="bg-amber-500 text-black text-center py-2 px-4 text-sm font-medium">
      DEMO MODE — No real data is stored. Domain verification is bypassed. For demonstration purposes only.
    </div>
  );
}
