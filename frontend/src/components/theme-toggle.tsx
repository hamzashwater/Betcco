"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ locale = "en" }: { locale?: string }) {
  function toggle() {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("betcco-theme", next);
    window.dispatchEvent(new Event("betcco:theme"));
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={locale === "ar" ? "تبديل المظهر" : "Toggle theme"}
      className="focus-ring rounded-lg p-2 text-muted hover:bg-white/5 hover:text-foreground"
    >
      <span className="sr-only">{locale === "ar" ? "المظهر" : "Theme"}</span>
      <span className="dark-icon">
        <Moon size={18} />
      </span>
      <span className="light-icon">
        <Sun size={18} />
      </span>
    </button>
  );
}
