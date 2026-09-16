import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";

import "./globals.css";

const nunito = Nunito({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "MealPrep",
  description: "Prywatna aplikacja do planowania i jedzenia bez zastanawiania się.",
  appleWebApp: { capable: true, title: "MealPrep", statusBarStyle: "default" },
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
