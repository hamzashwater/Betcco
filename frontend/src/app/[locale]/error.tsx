"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  void error;
  const t = useTranslations("appShell.error");

  return (
    <main className="shell py-16">
      <section
        className="card mx-auto max-w-xl p-7 text-center sm:p-10"
        role="alert"
      >
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
          BETCCO
        </p>
        <h1 className="mt-3 text-3xl font-black">{t("title")}</h1>
        <p className="mt-3 leading-7 text-muted">{t("description")}</p>
        <button
          type="button"
          onClick={reset}
          className="focus-ring mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 font-black text-slate-950"
        >
          <RefreshCw size={18} aria-hidden="true" />
          {t("retry")}
        </button>
      </section>
    </main>
  );
}
