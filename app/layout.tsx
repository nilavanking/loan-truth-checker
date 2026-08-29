import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loan Truth Checker",
  description: "Independent loan-cost audit tool for EMI, true APR, KFS disclosures, prepayment terms and signing risk.",
  applicationName: "Loan Truth Checker",
  icons: { icon: "/loan-truth-checker-logo-v2.png", shortcut: "/loan-truth-checker-logo-v2.png", apple: "/loan-truth-checker-logo-v2.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#102c2b" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
