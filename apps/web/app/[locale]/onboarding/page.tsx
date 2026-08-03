import { redirect } from "@/i18n/navigation";

export default function OnboardingIndexPage({ params }: { params: { locale: string } }) {
  redirect({ href: "/onboarding/register", locale: params.locale });
}
