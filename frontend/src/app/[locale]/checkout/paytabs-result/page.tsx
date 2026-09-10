"use client";

import { useLocale } from "next-intl";

export default function PayTabsResultPage() {
  const locale = useLocale();
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <section className="card p-6 sm:p-8">
        <h1 className="text-2xl font-black tracking-tight">
          {locale === "ar"
            ? "جارٍ التحقق من الدفع"
            : "Payment verification in progress"}
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted">
          {locale === "ar"
            ? "العودة من صفحة الدفع لا تؤكد نجاح العملية. سيتم تفعيل الوصول فقط بعد التحقق الآمن من العملية لدى مزود الدفع."
            : "Returning from the payment page does not confirm success. Access is activated only after the server securely verifies the transaction with the payment provider."}
        </p>
      </section>
    </main>
  );
}
