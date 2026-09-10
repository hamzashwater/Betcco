"use client";

import { RefreshCw } from "lucide-react";
import { useLocale } from "next-intl";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  void error;
  const isArabic = useLocale() === "ar";

  return (
    <main className="shell py-16">
      <section
        className="card mx-auto max-w-xl p-7 text-center sm:p-10"
        role="alert"
      >
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
          BETCCO
        </p>
        <h1 className="mt-3 text-3xl font-black">
          {isArabic ? "تعذر تحميل هذه الصفحة" : "This page could not be loaded"}
        </h1>
        <p className="mt-3 leading-7 text-muted">
          {isArabic
            ? "حدثت مشكلة مؤقتة أثناء تحميل المحتوى. يمكنك المحاولة مرة أخرى بأمان."
            : "A temporary problem occurred while loading this content. You can safely try again."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="focus-ring mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 font-black text-slate-950"
        >
          <RefreshCw size={18} aria-hidden="true" />
          {isArabic ? "إعادة المحاولة" : "Try again"}
        </button>
      </section>
    </main>
  );
}
