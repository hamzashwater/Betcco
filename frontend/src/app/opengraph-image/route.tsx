import { GET as localizedImage } from "../[locale]/opengraph-image/route";

export const dynamic = "force-static";

// Preserve the existing English image URL for previously published links.
export function GET(request: Request) {
  return localizedImage(request, { params: Promise.resolve({ locale: "en" }) });
}
