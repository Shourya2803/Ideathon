import type { Metadata, Viewport } from "next";
import { Barlow, Geist_Mono, Instrument_Serif } from "next/font/google";
import { LenisProvider } from "@/components/LenisProvider";
import "./globals.css";

const serif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const barlow = Barlow({ variable: "--font-barlow", subsets: ["latin"], weight: ["300", "400", "500", "600"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Decoded — Read the fine print before it costs you",
  description:
    "Bills, lab reports, loan agreements, government schemes, insurance policies and syllabi, explained in plain language. Personal details are removed before AI analysis.",
};

export const viewport: Viewport = {
  themeColor: "#050505",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${barlow.variable} ${mono.variable} antialiased`}>
      <body className="min-h-svh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-black"
        >
          Skip to content
        </a>
        <LenisProvider>{children}</LenisProvider>
        <div className="grain" aria-hidden="true" />
      </body>
    </html>
  );
}
