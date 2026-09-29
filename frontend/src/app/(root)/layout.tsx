import { baseMetadata } from "@/lib/site-metadata";
import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = baseMetadata;

export default function DefaultLocaleRootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
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
