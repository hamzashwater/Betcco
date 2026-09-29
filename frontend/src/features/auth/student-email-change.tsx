"use client";

import { api } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function StudentEmailChange() {
  const t = useTranslations("auth.studentEmailChange");
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
      setNotice(t("success"));
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
      <h2 className="text-xl font-black">{t("title")}</h2>
      <p className="text-sm text-muted">{t("description")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-bold">
          <span>{t("newEmail")}</span>
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
          <span>{t("currentPassword")}</span>
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
        {t("sendConfirmationLink")}
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
            : t("requestFailed")}
        </p>
      )}
    </form>
  );
}
