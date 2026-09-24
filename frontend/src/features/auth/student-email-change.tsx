"use client";

import { api } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useState } from "react";

export function StudentEmailChange() {
  const locale = useLocale();
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const request = useMutation({
    mutationFn: () =>
      api<void>("/auth/email-change/request", {
        method: "POST",
        body: JSON.stringify({ newEmail, currentPassword }),
      }),
    onSuccess: () => {
      setNewEmail("");
      setCurrentPassword("");
      setNotice(
        locale === "ar"
          ? "أرسلنا رابط التحقق إلى البريد الجديد. صلاحيته ساعة واحدة."
          : "A confirmation link was sent to the new address. It expires in one hour.",
      );
    },
  });
  return (
    <form
      className="card mt-5 grid min-w-0 gap-4 p-5 sm:p-7"
      onSubmit={(event) => {
        event.preventDefault();
        setNotice(null);
        request.mutate();
      }}
    >
      <h2 className="text-xl font-black">
        {locale === "ar" ? "تغيير البريد الإلكتروني" : "Change email"}
      </h2>
      <p className="text-sm text-muted">
        {locale === "ar"
          ? "تحقق من ملكية البريد الجديد قبل تغيير بيانات الدخول. سيتطلب التأكيد تسجيل دخول جديدًا."
          : "Verify the new address before it becomes your sign-in email. Confirmation will sign you out."}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-bold">
          <span>{locale === "ar" ? "البريد الجديد" : "New email"}</span>
          <input
            type="email"
            required
            maxLength={320}
            autoComplete="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            className="focus-ring min-w-0 rounded-xl border border-border bg-transparent px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          <span>
            {locale === "ar" ? "كلمة المرور الحالية" : "Current password"}
          </span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="focus-ring min-w-0 rounded-xl border border-border bg-transparent px-3 py-2"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={request.isPending}
        className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60"
      >
        {locale === "ar" ? "إرسال رابط التحقق" : "Send confirmation link"}
      </button>
      {notice && (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {request.isError && (
        <p role="alert" className="text-sm text-red-600">
          {request.error instanceof Error
            ? request.error.message
            : locale === "ar"
              ? "تعذر إرسال الرابط."
              : "Unable to send the link."}
        </p>
      )}
    </form>
  );
}
