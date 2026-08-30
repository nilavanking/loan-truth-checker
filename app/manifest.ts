import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Loan Truth Checker",
    short_name: "Loan Truth",
    description: "Independent loan-cost and quotation audit tool",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f3ec",
    theme_color: "#102c2b",
    icons: [{ src: "/loan-truth-checker-logo-v2.png", sizes: "512x512", type: "image/png", purpose: "maskable" }],
  };
}
