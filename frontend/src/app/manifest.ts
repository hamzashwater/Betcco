import type { MetadataRoute } from "next";
import { defaultBrand } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: defaultBrand.BrandName,
    short_name: defaultBrand.BrandShortName,
    description: defaultBrand.BrandTagline,
    start_url: "/",
    display: "standalone",
    background_color: defaultBrand.BrandNavyColor,
    theme_color: defaultBrand.BrandNavyColor,
    icons: [
      { src: defaultBrand.Favicon, sizes: "512x512", type: "image/svg+xml" },
    ],
  };
}
