import { baseMetadata } from "@/lib/site-metadata";
import { ThemeRestoration } from "@/components/theme-restoration";
import type { Metadata } from "next";
import { headers } from "next/headers";
import "../globals.css";

export const metadata: Metadata = baseMetadata;

export default async function DefaultLocaleRootLayout({
  children,
}: LayoutProps<"/">) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="min-h-screen">
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('betcco-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}",
          }}
        />
        <ThemeRestoration locale="ar" />
        {children}
      </body>
    </html>
  );
}
