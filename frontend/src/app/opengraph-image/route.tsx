import { ImageResponse } from "next/og";
import { defaultBrand } from "@/lib/brand";

export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    <div
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
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 38,
          color: defaultBrand.BrandPrimaryColor,
          fontWeight: 800,
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
        }}
      >
        Learn. Apply. Achieve.
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 26,
          fontSize: 30,
          color: "#36576A",
        }}
      >
        BTEC-first learning, assignments, criteria, and evaluation in one place.
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
