import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { defaultBrand } from "@/lib/brand";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

async function arabicFonts() {
  // This installed ImageResponse renderer cannot shape the automatic Noto Sans
  // Arabic fallback. Compatible Tajawal TTFs are cached during static generation.
  return Promise.all(
    [
      {
        weight: 400 as const,
        url: "https://fonts.gstatic.com/s/tajawal/v12/Iura6YBj_oCad4k1rzaLDL5J.ttf",
      },
      {
        weight: 900 as const,
        url: "https://fonts.gstatic.com/s/tajawal/v12/Iurf6YBj_oCad4k1l7KmLrZjjrlI.ttf",
      },
    ].map(async ({ weight, url }) => {
      const response = await fetch(url, { cache: "force-cache" });
      if (!response.ok) throw new Error(response.statusText);
      return {
        name: "Tajawal",
        data: await response.arrayBuffer(),
        weight,
        style: "normal" as const,
      };
    }),
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const copy = await getTranslations({
    locale,
    namespace: "siteMetadata.socialImage",
  });
  const arabic = locale === "ar";
  // Words retain font shaping. Reversed flex flow supplies RTL word ordering,
  // which this installed renderer does not apply to a single text node.
  const text = (value: string) =>
    arabic
      ? value.split(" ").map((word, index) => {
          const parts = /^(.*?)([.،؛:!?؟]+)$/.exec(word);
          return (
            <span
              key={index}
              style={{ display: "flex", flexDirection: "row-reverse" }}
            >
              {parts ? parts[1] : word}
              {parts ? <span>{parts[2]}</span> : null}
            </span>
          );
        })
      : value;
  const flow = arabic
    ? ({
        flexDirection: "row-reverse",
        flexWrap: "wrap",
        gap: "0.25em",
      } as const)
    : undefined;
  return new ImageResponse(
    <div
      lang={locale}
      dir={arabic ? "rtl" : "ltr"}
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 76,
        color: defaultBrand.BrandNavyColor,
        background:
          "linear-gradient(135deg, #F5F6F8 0%, #E6F7F5 56%, #D9F2EE 100%)",
        ...(arabic ? { fontFamily: "Tajawal" } : {}),
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 38,
          color: defaultBrand.BrandPrimaryColor,
          fontWeight: 800,
          ...(arabic ? { justifyContent: "flex-end" } : {}),
        }}
      >
        {defaultBrand.BrandName}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 28,
          maxWidth: 920,
          fontSize: 78,
          fontWeight: 900,
          lineHeight: 1.1,
          ...(arabic ? { alignSelf: "flex-end", width: "100%" } : {}),
          ...flow,
        }}
      >
        {text(copy("headline"))}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 26,
          fontSize: 30,
          color: "#36576A",
          ...flow,
        }}
      >
        {text(copy("description"))}
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: arabic ? await arabicFonts() : undefined,
    },
  );
}
