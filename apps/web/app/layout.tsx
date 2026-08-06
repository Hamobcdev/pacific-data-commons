import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { DemoModeBanner } from "@/components/ui/DemoModeBanner";
import { PlatformAssistant } from "@/components/ui/PlatformAssistant";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

// getLocale()/getMessages() read the negotiated locale via next-intl's
// middleware (i18n/routing.ts uses localePrefix: "always" — every locale,
// including the default, is prefixed onto the URL, and every route lives
// under app/[locale]/). Reading the locale this way still counts as
// dynamic server usage, so Next.js refuses to prerender any page during
// `next build` unless told explicitly not to try — this cascades from the
// root layout to every route.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pacific Data Commons",
  description: "Sovereign data exchange infrastructure for the Pacific.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={`${inter.variable} font-sans antialiased`}>
        <DemoModeBanner />
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <PlatformAssistant />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
