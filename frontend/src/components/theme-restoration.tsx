"use client";

import { useLayoutEffect } from "react";

export function ThemeRestoration({ locale }: { locale: string }) {
  // Client locale navigation can replace <html> attributes without reexecuting
  // its inline script. Restore the same preference before the next paint.
  useLayoutEffect(() => {
    try {
      document.documentElement.dataset.theme =
        localStorage.getItem("betcco-theme") === "light" ? "light" : "dark";
    } catch {
      document.documentElement.dataset.theme = "dark";
    }
  }, [locale]);
  return null;
}
