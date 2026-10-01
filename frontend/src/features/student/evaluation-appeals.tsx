"use client";

import { formatLocalizedDateTime } from "@/i18n/date-time";
import { api } from "@/lib/api";
import { useStudentEvaluations } from "@/features/student/student-evaluation-page";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

type Evaluation = {
  id: string;
  status: string;
  calculatedGrade: string | null;
};

type Appeal = {
  id: string;
  evaluationRequestId: string;
  status: string;
  reason: string;
  decisionRationale: string | null;
  createdAtUtc: string;
  reviewedAtUtc: string | null;
  withdrawnAtUtc: string | null;
};

export function EvaluationAppeals() {
  const locale = useLocale();
  const t = useTranslations("studentWorkspace.evaluationAppeals");
  const client = useQueryClient();
  const [evaluationRequestId, setEvaluationRequestId] = useState("");
  const [reason, setReason] = useState("");
  const evaluations = useStudentEvaluations<Evaluation>(false);
  const appeals = useQuery({
    queryKey: ["evaluation-appeals", "mine"],
    queryFn: () => api<Appeal[]>("/evaluation-appeals/mine"),
    retry: false,
  });
  const completed = useMemo(
    () =>
      (evaluations.data?.pages.flatMap((page) => page.items) ?? []).filter(
        (item) => item.status === "Completed",
      ),
    [evaluations.data],
  );
  const create = useMutation({
    mutationFn: () =>
      api<Appeal>("/evaluation-appeals", {
        method: "POST",
        body: JSON.stringify({ evaluationRequestId, reason: reason.trim() }),
      }),
    onSuccess: () => {
      setReason("");
      setEvaluationRequestId("");
      void client.invalidateQueries({
        queryKey: ["evaluation-appeals", "mine"],
      });
    },
  });
  const withdraw = useMutation({
    mutationFn: (appealId: string) =>
      api<void>(`/evaluation-appeals/${appealId}/withdraw`, { method: "POST" }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["evaluation-appeals", "mine"] }),
  });
  const canSubmit = Boolean(evaluationRequestId) && reason.trim().length >= 10;
  const date = (value: string) => formatLocalizedDateTime(value, locale);

  return (
    <section className="shell py-8 sm:py-10">
      <div className="max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
          BETCCO · {t("integrity")}
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-3 leading-7 text-muted">{t("description")}</p>
      </div>

      <form
        className="card mt-6 grid max-w-3xl gap-4 p-5 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) create.mutate();
        }}
      >
        <h2 className="text-lg font-black">{t("form.title")}</h2>
        <label className="grid gap-2 text-sm font-black">
          {t("form.releasedEvaluation")}
          <select
            className="focus-ring rounded-xl border border-border bg-background px-3 py-3 text-foreground"
            value={evaluationRequestId}
            onChange={(event) => setEvaluationRequestId(event.target.value)}
            required
          >
            <option value="">{t("form.chooseEvaluation")}</option>
            {completed.map((evaluation) => (
              <option key={evaluation.id} value={evaluation.id}>
                {t("form.outcome")} {evaluation.calculatedGrade ?? "—"} ·{" "}
                {evaluation.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        {evaluations.isFetchNextPageError ? (
          <p role="alert" className="text-sm text-red-500">
            {t("evaluations.loadMoreError")}
          </p>
        ) : null}
        {evaluations.hasNextPage || evaluations.isFetchNextPageError ? (
          <button
            type="button"
            className="focus-ring justify-self-start rounded-xl border border-border px-4 py-2 font-semibold disabled:opacity-50"
            disabled={evaluations.isFetchingNextPage}
            onClick={() => void evaluations.fetchNextPage()}
          >
            {evaluations.isFetchingNextPage
              ? t("evaluations.loading")
              : t("evaluations.loadMore")}
          </button>
        ) : null}
        {evaluations.isSuccess &&
        !evaluations.hasNextPage &&
        completed.length === 0 ? (
          <p className="rounded-xl border border-border bg-page/40 p-3 text-sm text-muted">
            {t("evaluations.empty")}
          </p>
        ) : null}
        <label className="grid gap-2 text-sm font-black">
          {t("form.reason")}
          <textarea
            className="focus-ring min-h-32 rounded-xl border border-border bg-background px-3 py-3 text-foreground"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={10}
            maxLength={4000}
            required
            aria-describedby="appeal-reason-help"
          />
          <span
            id="appeal-reason-help"
            className="text-xs font-normal text-muted"
          >
            {t("form.reasonHelp")}
          </span>
        </label>
        <button
          type="submit"
          disabled={!canSubmit || create.isPending}
          className="focus-ring justify-self-start rounded-xl bg-primary px-5 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {create.isPending ? t("form.submitting") : t("form.submit")}
        </button>
        {create.isError ? (
          <p role="alert" className="text-sm text-red-500">
            {create.error instanceof Error
              ? create.error.message
              : t("form.submitError")}
          </p>
        ) : null}
      </form>

      <div className="mt-8 max-w-3xl">
        <h2 className="text-xl font-black">{t("appeals.title")}</h2>
        {appeals.isPending ? (
          <p className="mt-4 text-muted">{t("appeals.loading")}</p>
        ) : null}
        {appeals.isError ? (
          <p role="alert" className="mt-4 text-sm text-red-500">
            {t("appeals.loadError")}
          </p>
        ) : null}
        {appeals.isSuccess && appeals.data.length === 0 ? (
          <p className="card mt-4 p-4 text-muted">{t("appeals.empty")}</p>
        ) : null}
        <div className="mt-4 grid gap-3">
          {appeals.data?.map((appeal) => {
            const canWithdraw = appeal.status === "Submitted";
            return (
              <article key={appeal.id} className="card grid gap-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-black text-primary">
                    {appeal.status}
                  </span>
                  <time
                    className="text-sm text-muted"
                    dateTime={appeal.createdAtUtc}
                  >
                    {date(appeal.createdAtUtc)}
                  </time>
                </div>
                <p className="whitespace-pre-wrap leading-7">{appeal.reason}</p>
                {appeal.decisionRationale ? (
                  <div className="rounded-xl border border-border bg-page/40 p-3 text-sm leading-6">
                    <strong>{t("appeals.reviewerDecision")}</strong>
                    {appeal.decisionRationale}
                  </div>
                ) : null}
                {canWithdraw ? (
                  <button
                    type="button"
                    onClick={() => withdraw.mutate(appeal.id)}
                    disabled={withdraw.isPending}
                    className="focus-ring justify-self-start rounded-xl border border-border px-4 py-2 text-sm font-black hover:border-primary disabled:opacity-60"
                  >
                    {t("appeals.withdraw")}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
