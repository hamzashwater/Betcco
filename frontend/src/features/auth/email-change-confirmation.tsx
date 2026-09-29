"use client";

import { api } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

export function EmailChangeConfirmation() {
  const locale = useLocale();
  const t = useTranslations("auth.emailChange");
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
      <h1 className="text-2xl font-black">{t("title")}</h1>
      {!validLink ? (
        <p role="alert" className="text-sm text-red-600">
          {t("missingLink")}
        </p>
      ) : confirm.isSuccess ? (
        <>
          <p role="status" className="text-sm text-emerald-700">
            {t("success")}
          </p>
          <Link
            href={`/${locale}/login`}
            className="focus-ring font-bold text-primary"
          >
            {t("signIn")}
          </Link>
        </>
      ) : (
        <>
          <p className="text-sm leading-6 text-muted">{t("description")}</p>
          <p className="break-all text-sm font-bold" dir="ltr">
            {newEmail}
          </p>
          <button
            type="button"
            disabled={confirm.isPending}
            onClick={() => confirm.mutate()}
            className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60"
          >
            {t("confirm")}
          </button>
          {confirm.isError && (
            <p role="alert" className="text-sm text-red-600">
              {t("failed")}
            </p>
          )}
          <Link
            href={`/${locale}/login`}
            className="focus-ring w-fit text-sm font-bold text-primary"
          >
            {t("signInFirst")}
          </Link>
        </>
      )}
    </section>
  );
}
