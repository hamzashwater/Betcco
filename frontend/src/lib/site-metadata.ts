import type { Metadata } from "next";
import { defaultBrand } from "@/lib/brand";

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.APP_PUBLIC_URL ??
  "http://localhost:3000";

export const baseMetadata: Metadata = {
  title: {
    default: defaultBrand.BrandName,
    template: `%s | ${defaultBrand.BrandName}`,
  },
  description: defaultBrand.BrandTagline,
  applicationName: defaultBrand.BrandName,
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: defaultBrand.Favicon, type: "image/svg+xml" }] },
  formatDetection: { telephone: false, email: false, address: false },
  metadataBase: new URL(siteUrl),
};
