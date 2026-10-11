"use client";

import { useTranslations } from "next-intl";

export default function PayTabsResultPage() {
  const copy = useTranslations("publicPurchase.result");
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <section className="card p-6 sm:p-8">
        <h1 className="text-2xl font-black tracking-tight">{copy("title")}</h1>
        <p className="mt-3 text-sm leading-7 text-muted">
          {copy("description")}
        </p>
      </section>
    </main>
  );
}
