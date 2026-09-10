import type { Metadata } from "next";
import { defaultBrand } from "@/lib/brand";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.APP_PUBLIC_URL ??
  "http://localhost:3000";

export const metadata: Metadata = {
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" suppressHydrationWarning>
      <body className="min-h-screen">
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('betcco-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
