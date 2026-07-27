import { redirect } from "next/navigation";

// Scaffold only — the real provider dashboard is Session 7.
export default function DashboardPage() {
  redirect("/onboarding/register");
}
