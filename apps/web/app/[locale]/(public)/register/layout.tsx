/**
 * Minimal layout for the Phase C provider self-registration flow. No auth
 * required — this is an anonymous, public form. Scoped only to /register;
 * no other (public) route in this app has a shared layout (each page
 * builds its own chrome inline), so this doesn't change anything outside
 * this one route.
 */
export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
