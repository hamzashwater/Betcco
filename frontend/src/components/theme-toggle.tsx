"use client";

import { Action } from "@/components/ui/action";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";

export function ThemeToggle({ locale = "en" }: { locale?: string }) {
  void locale;
  const t = useTranslations("navigation.theme");
  function toggle() {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("betcco-theme", next);
    window.dispatchEvent(new Event("betcco:theme"));
  }
  return (
    <Action
      variant="quiet"
      type="button"
      onClick={toggle}
      aria-label={t("toggle")}
      className="min-w-11 px-3!"
    >
      <span className="sr-only">{t("label")}</span>
      <span className="dark-icon">
        <Moon size={18} aria-hidden="true" />
      </span>
      <span className="light-icon">
        <Sun size={18} aria-hidden="true" />
      </span>
    </Action>
  );
}
