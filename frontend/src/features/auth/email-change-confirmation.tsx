"use client";

import { api } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";

export function EmailChangeConfirmation() {
  const locale = useLocale();
  const params = useSearchParams();
  const userId = params.get("userId");
  const newEmail = params.get("email");
  const proof = params.get("proof");
  const mode = params.get("mode");
  const validLink = Boolean(
    userId && newEmail && proof && (mode === "student" || mode === "managed"),
  );
  const confirm = useMutation({
    mutationFn: () =>
      api<void>("/auth/email-change/confirm", {
        method: "POST",
        body: JSON.stringify({ userId, newEmail, proof, mode }),
      }),
  });

  return (
    <section className="card mx-auto grid max-w-lg gap-4 p-6">
      <h1 className="text-2xl font-black">
        {locale === "ar" ? "تأكيد البريد الجديد" : "Confirm new email"}
      </h1>
      {!validLink ? (
        <p role="alert" className="text-sm text-red-600">
          {locale === "ar"
            ? "الرابط غير مكتمل. اطلب رابطًا جديدًا من إعدادات الحساب."
            : "This link is incomplete. Request a new one from account settings."}
        </p>
      ) : confirm.isSuccess ? (
        <>
          <p role="status" className="text-sm text-emerald-700">
            {locale === "ar"
              ? "تغيّر البريد. سجّل الدخول بالبريد الجديد."
              : "Your email changed. Sign in with the new address."}
          </p>
          <Link
            href={`/${locale}/login`}
            className="focus-ring font-bold text-primary"
          >
            {locale === "ar" ? "تسجيل الدخول" : "Sign in"}
          </Link>
        </>
      ) : (
        <>
          <p className="text-sm leading-6 text-muted">
            {locale === "ar"
              ? "سجّل الدخول بحسابك الحالي ثم أكّد ملكية البريد الجديد. تنتهي صلاحية الرابط بعد ساعة."
              : "Sign in to your current account, then confirm ownership of the new address. This link expires after one hour."}
          </p>
          <p className="break-all text-sm font-bold" dir="ltr">
            {newEmail}
          </p>
          <button
            type="button"
            disabled={confirm.isPending}
            onClick={() => confirm.mutate()}
            className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60"
          >
            {locale === "ar" ? "تأكيد تغيير البريد" : "Confirm email change"}
          </button>
          {confirm.isError && (
            <p role="alert" className="text-sm text-red-600">
              {locale === "ar"
                ? "تعذر التأكيد. تأكد من تسجيل الدخول بالحساب الحالي وصلاحية الرابط."
                : "Confirmation failed. Check that you are signed in to the current account and the link is still valid."}
            </p>
          )}
          <Link
            href={`/${locale}/login`}
            className="focus-ring w-fit text-sm font-bold text-primary"
          >
            {locale === "ar" ? "تسجيل الدخول أولًا" : "Sign in first"}
          </Link>
        </>
      )}
    </section>
  );
}
