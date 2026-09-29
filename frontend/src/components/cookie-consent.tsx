"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type CookieChoices = {
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
  savedAt: string;
};

const storageKey = "betcco-cookie-consent";

function readChoices() {
  if (typeof window === "undefined") return undefined;
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "") as CookieChoices;
  } catch {
    return undefined;
  }
}

export function CookieConsent() {
  const locale = useLocale();
  const t = useTranslations("cookieConsent");
  const [open, setOpen] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const saved = readChoices();
    const showBanner = saved
      ? undefined
      : window.setTimeout(() => setOpen(true), 0);
    const showSettings = () => {
      const current = readChoices();
      setPreferences(current?.preferences ?? false);
      setAnalytics(current?.analytics ?? false);
      setMarketing(current?.marketing ?? false);
      setCustomize(true);
      setOpen(true);
    };
    window.addEventListener("betcco:open-cookie-settings", showSettings);
    return () => {
      if (showBanner !== undefined) window.clearTimeout(showBanner);
      window.removeEventListener("betcco:open-cookie-settings", showSettings);
    };
  }, []);

  const save = (choices: Omit<CookieChoices, "necessary" | "savedAt">) => {
    const saved = {
      necessary: true as const,
      ...choices,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKey, JSON.stringify(saved));
    window.dispatchEvent(
      new CustomEvent("betcco:cookie-consent", { detail: saved }),
    );
    setOpen(false);
    setCustomize(false);
  };

  if (!open) return null;
  return (
    <aside
      className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-w-2xl rounded-2xl border border-border bg-[color-mix(in_srgb,var(--surface-solid)_96%,black)] p-5 shadow-2xl backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
    >
      <h2 className="text-lg font-black">{t("title")}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        {t("description")}{" "}
        <Link
          className="font-bold text-primary underline"
          href={`/${locale}/cookies`}
        >
          {t("readPolicy")}
        </Link>
      </p>
      {customize && (
        <div className="mt-4 grid gap-2 border-y border-border py-4">
          <Choice
            checked
            disabled
            label={t("essential")}
            description={t("essentialDescription")}
            onChange={() => undefined}
          />
          <Choice
            checked={preferences}
            label={t("preferences")}
            description={t("preferencesDescription")}
            onChange={setPreferences}
          />
          <Choice
            checked={analytics}
            label={t("analytics")}
            description={t("analyticsDescription")}
            onChange={setAnalytics}
          />
          <Choice
            checked={marketing}
            label={t("marketing")}
            description={t("marketingDescription")}
            onChange={setMarketing}
          />
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            save({ preferences: true, analytics: true, marketing: true })
          }
          className="focus-ring rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950"
        >
          {t("accept")}
        </button>
        <button
          type="button"
          onClick={() =>
            save({ preferences: false, analytics: false, marketing: false })
          }
          className="focus-ring rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-foreground"
        >
          {t("reject")}
        </button>
        {customize ? (
          <button
            type="button"
            onClick={() => save({ preferences, analytics, marketing })}
            className="focus-ring rounded-xl border border-primary/50 px-4 py-2.5 text-sm font-bold text-primary"
          >
            {t("save")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCustomize(true)}
            className="focus-ring rounded-xl px-4 py-2.5 text-sm font-bold text-primary"
          >
            {t("customize")}
          </button>
        )}
      </div>
    </aside>
  );
}

function Choice({
  checked,
  disabled = false,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  description: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-lg px-1 py-1.5">
      <span>
        <span className="block text-sm font-bold text-foreground">{label}</span>
        <span className="block text-xs leading-5 text-muted">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="focus-ring mt-1 size-4 accent-[var(--primary)]"
      />
    </label>
  );
}
