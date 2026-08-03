import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { DemoModeBanner } from "@/components/ui/DemoModeBanner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

// getLocale()/getMessages() read the negotiated locale from a cookie via
// next-intl (middleware.ts uses localePrefix: "never" — no [locale] route
// segment to make this static per-locale). Next.js treats that as dynamic
// server usage and refuses to prerender any page during `next build` unless
// told explicitly not to try — this cascades from the root layout to every
// route. There's no static-rendering path available without restructuring
// routes under app/[locale]/, which the given file structure doesn't use.
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
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
