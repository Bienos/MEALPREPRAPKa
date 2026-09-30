import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";

import "./globals.css";

const nunito = Nunito({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
});

const DESCRIPTION = "Prywatna aplikacja do planowania i jedzenia bez zastanawiania się.";

/** The one public address of this app. Crawlers reject a relative og:url. */
const SITE_URL = "https://www.meal-prep.pl";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "MealPrep",
  description: DESCRIPTION,
  appleWebApp: { capable: true, title: "MealPrep", statusBarStyle: "default" },
  // Link crawlers are stricter than browsers: several ignore a card whose page
  // declares no canonical url or type. The image itself comes from
  // opengraph-image.tsx, which Next adds here automatically.
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "MealPrep",
    locale: "pl_PL",
    title: "MealPrep",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf6f0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${nunito.variable} h-full`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
