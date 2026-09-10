"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

type Consent = { analytics?: boolean };
const storageKey = "betcco-cookie-consent";

function hasAnalyticsConsent() {
  try {
    return (
      (JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Consent)
        .analytics === true
    );
  } catch {
    return false;
  }
}

export function AnalyticsTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const endpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
    if (!endpoint) return;
    const track = () => {
      if (!hasAnalyticsConsent()) return;
      void fetch(endpoint, {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: "page_view",
          path: pathname,
          occurredAt: new Date().toISOString(),
        }),
      }).catch(() => undefined);
    };
    track();
    window.addEventListener("betcco:cookie-consent", track);
    return () => window.removeEventListener("betcco:cookie-consent", track);
  }, [pathname]);
  return null;
}
