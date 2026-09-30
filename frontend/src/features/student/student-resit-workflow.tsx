"use client";

import { formatLocalizedDate } from "@/i18n/date-time";
import { formatLocalizedCurrency } from "@/i18n/number-format";
import { FilePicker } from "@/components/forms/file-picker";
import { academicText } from "@/lib/academic-localization";
import { api, ApiError } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Academic = {
  qualificationCode: string;
  qualificationArabicName: string;
  qualificationEnglishName: string;
  unitCode: string;
  unitArabicTitle: string;
  unitEnglishTitle: string;
  assessmentCode: string;
  assessmentArabicTitle: string;
  assessmentEnglishTitle: string;
};

type Authorization = {
  authorizationId: string;
  originalEvaluationRequestId: string;
  resitEvaluationRequestId: string | null;
  authorizedAtUtc: string;
  activatedAtUtc: string | null;
  state: "Authorized" | "Activated" | "Revoked";
  academic: Academic | null;
};

type AuthorizationPage = {
  items: Authorization[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
};

type Detail = {
  id: string;
  status: string;
  price: number;
  currency: string;
  isResit: boolean;
  resitOfEvaluationRequestId: string | null;
  academic: Academic | null;
  criteria: string[];
  files: {
    id: string;
    originalFileName: string;
    scanStatus: string;
    createdAtUtc: string;
  }[];
  evidence: { criterionCode: string; narrative: string }[];
  hasAuthenticityDeclaration: boolean | null;
  calculatedGrade: string | null;
  sectionResults: { section: string; grade: string }[];
  results: {
    criterionCode: string;
    achievement: string;
    comment: string | null;
  }[];
  feedback: { body: string; createdAtUtc: string }[];
};

function AcademicContext({
  academic,
  locale,
}: {
  academic: Academic | null;
  locale: string;
}) {
  if (!academic) return null;
  return (
    <p className="min-w-0 break-words text-sm text-muted">
      {academic.qualificationCode} · {academic.unitCode} ·{" "}
      {academicText(
        locale,
        academic.unitArabicTitle,
        academic.unitEnglishTitle,
      )}{" "}
      ·{" "}
      {academicText(
        locale,
        academic.assessmentArabicTitle,
        academic.assessmentEnglishTitle,
      )}
    </p>
  );
}

function activationError(
  error: Error,
  t: ReturnType<
    typeof useTranslations<"studentWorkspace.resitWorkflow.activationErrors">
  >,
) {
  if (!(error instanceof ApiError)) return t("fallback");
  if (error.status === 404) return t("notFound");
  switch (error.code) {
    case "RESIT_AUTHORIZATION_REVOKED":
      return t("revoked");
    case "RESIT_ORIGINAL_NO_LONGER_VALID":
      return t("originalNoLongerValid");
    case "RESIT_ACADEMIC_SNAPSHOT_INVALID":
      return t("academicSnapshotInvalid");
    case "RESIT_ACTIVATION_CONFLICT":
      return t("conflict");
    default:
      return t("fallback");
  }
}

export function StudentResitOpportunities() {
  const locale = useLocale();
  const t = useTranslations("studentWorkspace.resitWorkflow.opportunities");
  const tActivationErrors = useTranslations(
    "studentWorkspace.resitWorkflow.activationErrors",
  );
  const router = useRouter();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const opportunities = useQuery({
    queryKey: ["student", "resit-authorizations", page],
    queryFn: () =>
      api<AuthorizationPage>(
        `/student/resit-authorizations?page=${page}&pageSize=10`,
      ),
  });
  const activate = useMutation({
    mutationFn: (authorizationId: string) =>
      api<{ status: string; resitEvaluationRequestId: string }>(
        `/student/resit-authorizations/${authorizationId}/activate`,
        { method: "POST" },
      ),
    onSuccess: async (result) => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["student", "resit-authorizations"],
        }),
        client.invalidateQueries({ queryKey: ["evaluations", "mine"] }),
      ]);
      if (result.resitEvaluationRequestId)
        router.push(
          `/${locale}/student/evaluations/${result.resitEvaluationRequestId}`,
        );
    },
  });
  return (
    <section className="mt-6 grid gap-3" aria-label={t("ariaLabel")}>
      <h2 className="text-xl font-black">{t("title")}</h2>
      {opportunities.isPending ? <p role="status">{t("loading")}</p> : null}
      {opportunities.isError ? <p role="alert">{t("loadError")}</p> : null}
      {opportunities.data?.items?.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : null}
      {opportunities.data?.items?.map((item) => (
        <article
          className="card grid min-w-0 gap-2 p-4"
          key={item.authorizationId}
        >
          <strong className="text-primary">{t("cardTitle")}</strong>
          <AcademicContext academic={item.academic} locale={locale} />
          <p className="text-sm">
            {t("originalRequest")}:{" "}
            {item.originalEvaluationRequestId.slice(0, 8)}
          </p>
          <p className="text-xs text-muted">
            {formatLocalizedDate(item.authorizedAtUtc, locale)}
          </p>
          {item.state === "Authorized" ? (
            <>
              <p className="text-sm text-muted">{t("authorizedDescription")}</p>
              <button
                type="button"
                className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 font-bold text-white disabled:opacity-50"
                disabled={activate.isPending}
                onClick={() => activate.mutate(item.authorizationId)}
              >
                {t("start")}
              </button>
            </>
          ) : item.state === "Activated" && item.resitEvaluationRequestId ? (
            <>
              <p className="text-sm">
                {t("activatedRequest")}:{" "}
                {item.resitEvaluationRequestId.slice(0, 8)}
              </p>
              <Link
                className="focus-ring w-fit font-bold text-primary underline"
                href={`/${locale}/student/evaluations/${item.resitEvaluationRequestId}`}
              >
                {t("openDraft")}
              </Link>
            </>
          ) : (
            <p className="text-sm text-muted">{t("unavailable")}</p>
          )}
        </article>
      ))}
      {activate.isError ? (
        <p role="alert" className="text-sm text-red-500">
          {activationError(activate.error, tActivationErrors)}
        </p>
      ) : null}
      {opportunities.data ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="focus-ring rounded-lg border px-3 py-2 disabled:opacity-50"
            disabled={page === 1}
            onClick={() => setPage((current) => current - 1)}
          >
            {t("previous")}
          </button>
          <button
            type="button"
            className="focus-ring rounded-lg border px-3 py-2 disabled:opacity-50"
            disabled={!opportunities.data.hasNextPage}
            onClick={() => setPage((current) => current + 1)}
          >
            {t("next")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function StudentResitDetail({ evaluationId }: { evaluationId: string }) {
  const locale = useLocale();
  const t = useTranslations("studentWorkspace.resitWorkflow.detail");
  const router = useRouter();
  const client = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmOriginality, setConfirmOriginality] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Card");
  const [paymentSession, setPaymentSession] = useState<{
    paymentId: string;
    provider: string;
    redirectUrl: string | null;
    total: number;
    currency: string;
  } | null>(null);
  const checkoutKey = useRef<string | null>(null);
  const detail = useQuery({
    queryKey: ["evaluations", "detail", evaluationId],
    queryFn: () => api<Detail>(`/evaluations/${evaluationId}`),
  });
  const refresh = () =>
    client.invalidateQueries({
      queryKey: ["evaluations", "detail", evaluationId],
    });
  const upload = useMutation({
    mutationFn: async () => {
      for (const file of files) {
        const body = new FormData();
        body.set("file", file);
        await api(`/evaluations/${evaluationId}/files`, {
          method: "POST",
          body,
        });
      }
    },
    onSuccess: async () => {
      setFiles([]);
      await refresh();
    },
  });
  const saveEvidence = useMutation({
    mutationFn: ({
      criterionCode,
      narrative,
    }: {
      criterionCode: string;
      narrative: string;
    }) =>
      api(`/evaluations/${evaluationId}/evidence`, {
        method: "POST",
        body: JSON.stringify({ criterionCode, narrative }),
      }),
    onSuccess: refresh,
  });
  const declare = useMutation({
    mutationFn: () =>
      api(`/evaluations/${evaluationId}/authenticity-declaration`, {
        method: "POST",
      }),
    onSuccess: async () => {
      setConfirmOriginality(false);
      await refresh();
    },
  });
  const checkout = useMutation({
    mutationFn: async () => {
      checkoutKey.current ??= crypto.randomUUID();
      const result = await api<{
        includedCreditApplied: boolean;
        paymentId: string;
        provider: string;
        redirectUrl: string | null;
        total: number;
        currency: string;
      }>(`/evaluations/${evaluationId}/checkout`, {
        method: "POST",
        headers: { "Idempotency-Key": checkoutKey.current },
        body: JSON.stringify({ paymentMethod, expectIncludedCredit: false }),
      });
      if (result.includedCreditApplied)
        throw new Error("RESIT_INCLUDED_CREDIT_INVARIANT_VIOLATION");
      return result;
    },
    onSuccess: async (result) => {
      checkoutKey.current = null;
      if (result.redirectUrl) {
        window.location.assign(result.redirectUrl);
        return;
      }
      setPaymentSession(result);
      await refresh();
    },
  });
  const confirmDevelopmentPayment = useMutation({
    mutationFn: async () => {
      if (!paymentSession?.provider.startsWith("Fake"))
        throw new Error("No development test payment is available.");
      await api("/payments/fake/confirm", {
        method: "POST",
        body: JSON.stringify({
          paymentId: paymentSession.paymentId,
          providerEventId: `resit_test_${crypto.randomUUID()}`,
        }),
      });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["evaluations"] });
      await client.invalidateQueries({
        queryKey: ["student", "resit-authorizations"],
      });
      router.push(`/${locale}/student/evaluations`);
    },
  });
  const data = detail.data;
  return (
    <section className="shell grid min-w-0 gap-4 py-10">
      <Link
        className="focus-ring w-fit font-semibold text-primary underline"
        href={`/${locale}/student/evaluations`}
      >
        {t("back")}
      </Link>
      {detail.isPending ? <p role="status">{t("loading")}</p> : null}
      {detail.isError || (data && !data.isResit) ? (
        <p role="alert">{t("unavailable")}</p>
      ) : null}
      {data?.isResit ? (
        <>
          <header className="card grid gap-2 p-5">
            <h1 className="text-2xl font-black">{t("header.title")}</h1>
            <AcademicContext academic={data.academic} locale={locale} />
            <p>
              {t("header.status")}: {data.status}
            </p>
            {data.resitOfEvaluationRequestId ? (
              <p className="text-sm">
                {t("header.originalRequest")}:{" "}
                {data.resitOfEvaluationRequestId.slice(0, 8)}
              </p>
            ) : null}
          </header>
          {data.status === "Draft" ? (
            <div className="card grid gap-5 p-5">
              <h2 className="text-xl font-black">{t("draft.title")}</h2>
              <FilePicker
                label={t("draft.files.label")}
                files={files}
                onFilesChange={setFiles}
                locale={locale}
                accept=".pdf,.docx,.xlsx,.txt,.jpg,.jpeg,.png,.webp"
                multiple
                maxFileBytes={100 * 1024 * 1024}
                chooseLabel={t("draft.files.choose")}
              />
              <button
                type="button"
                className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 font-bold text-white disabled:opacity-50"
                disabled={!files.length || upload.isPending}
                onClick={() => upload.mutate()}
              >
                {t("draft.files.upload")}
              </button>
              {upload.isError ? (
                <p role="alert" className="text-red-500">
                  {t("draft.files.uploadError")}
                </p>
              ) : null}
              {upload.isSuccess ? (
                <p role="status" className="text-sm text-primary">
                  {t("draft.files.saved")}
                </p>
              ) : null}
              <div className="grid gap-2">
                <h3 className="font-bold">{t("draft.files.savedTitle")}</h3>
                {data.files.length ? (
                  <ul className="grid gap-1 text-sm">
                    {data.files.map((file) => (
                      <li key={file.id} className="break-words">
                        {file.originalFileName} · {file.scanStatus}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">{t("draft.files.empty")}</p>
                )}
              </div>
              <div className="grid gap-3">
                <h3 className="font-bold">{t("draft.evidence.title")}</h3>
                {data.criteria.map((criterion) => {
                  const saved =
                    data.evidence.find(
                      (item) => item.criterionCode === criterion,
                    )?.narrative ?? "";
                  return (
                    <div key={criterion} className="grid gap-2">
                      <label className="grid gap-1 text-sm font-semibold">
                        {t("draft.evidence.label", { criterion })}
                        <textarea
                          key={`${criterion}:${saved}`}
                          className="min-h-24 min-w-0 rounded-xl border border-border bg-transparent p-3"
                          maxLength={4000}
                          defaultValue={saved}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [criterion]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="focus-ring w-fit rounded-lg border px-3 py-2 font-semibold disabled:opacity-50"
                        disabled={
                          saveEvidence.isPending ||
                          !(drafts[criterion] ?? saved).trim()
                        }
                        onClick={() =>
                          saveEvidence.mutate({
                            criterionCode: criterion,
                            narrative: (drafts[criterion] ?? saved).trim(),
                          })
                        }
                      >
                        {t("draft.evidence.save")}
                      </button>
                    </div>
                  );
                })}
                {saveEvidence.isError ? (
                  <p role="alert" className="text-red-500">
                    {t("draft.evidence.saveError")}
                  </p>
                ) : null}
                {saveEvidence.isSuccess ? (
                  <p role="status" className="text-sm text-primary">
                    {t("draft.evidence.saved")}
                  </p>
                ) : null}
              </div>
              {data.hasAuthenticityDeclaration ? (
                <p role="status" className="font-semibold text-primary">
                  {t("draft.authenticity.confirmed")}
                </p>
              ) : (
                <>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="focus-ring mt-1"
                      checked={confirmOriginality}
                      onChange={(event) =>
                        setConfirmOriginality(event.target.checked)
                      }
                    />
                    {t("draft.authenticity.declaration")}
                  </label>
                  <button
                    type="button"
                    className="focus-ring w-fit rounded-lg border px-3 py-2 font-semibold disabled:opacity-50"
                    disabled={!confirmOriginality || declare.isPending}
                    onClick={() => declare.mutate()}
                  >
                    {t("draft.authenticity.confirm")}
                  </button>
                  {declare.isError ? (
                    <p role="alert" className="text-red-500">
                      {t("draft.authenticity.error")}
                    </p>
                  ) : null}
                </>
              )}
              {data.files.some((file) => file.scanStatus === "Clean") &&
              data.hasAuthenticityDeclaration ? (
                <p role="status" className="font-semibold">
                  {t("draft.preparationComplete")}
                </p>
              ) : null}
              <div className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
                <p className="font-black">{t("payment.title")}</p>
                <p>
                  {t("payment.price", {
                    price: formatLocalizedCurrency(
                      data.price,
                      data.currency,
                      locale,
                    ),
                  })}
                </p>
                <label className="grid gap-1 font-semibold">
                  {t("payment.method")}
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    className="rounded-lg border bg-transparent p-3"
                  >
                    <option value="Card">{t("payment.methods.card")}</option>
                    <option value="BankTransfer">
                      {t("payment.methods.bankTransfer")}
                    </option>
                    <option value="EWallet">
                      {t("payment.methods.eWallet")}
                    </option>
                  </select>
                </label>
                <button
                  type="button"
                  className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 font-bold text-white disabled:opacity-50"
                  disabled={
                    checkout.isPending ||
                    !data.files.some((file) => file.scanStatus === "Clean") ||
                    !data.hasAuthenticityDeclaration
                  }
                  onClick={() => checkout.mutate()}
                >
                  {checkout.isPending ? "…" : t("payment.continue")}
                </button>
                {checkout.isError ? (
                  <p role="alert" className="text-red-500">
                    {checkout.error.message ===
                    "RESIT_INCLUDED_CREDIT_INVARIANT_VIOLATION"
                      ? t("payment.stateConflict")
                      : t("payment.startError")}
                  </p>
                ) : null}
              </div>
            </div>
          ) : data.status === "PendingPayment" ? (
            <div className="card grid gap-3 p-5" aria-live="polite">
              <h2 className="text-xl font-black">
                {t("payment.pendingTitle")}
              </h2>
              {paymentSession?.provider.startsWith("Fake") ? (
                <>
                  <p>{t("payment.developmentDescription")}</p>
                  <button
                    type="button"
                    className="focus-ring w-fit rounded-lg border border-primary px-3 py-2 font-black text-primary disabled:opacity-50"
                    disabled={confirmDevelopmentPayment.isPending}
                    onClick={() => confirmDevelopmentPayment.mutate()}
                  >
                    {confirmDevelopmentPayment.isPending
                      ? "…"
                      : t("payment.completeTest")}
                  </button>
                  {confirmDevelopmentPayment.isError ? (
                    <p role="alert">{t("payment.confirmTestError")}</p>
                  ) : null}
                </>
              ) : (
                <p>{t("payment.pendingHelp")}</p>
              )}
            </div>
          ) : data.status === "Completed" ? (
            <div className="card grid gap-3 p-5">
              <h2 className="text-xl font-black">{t("completed.title")}</h2>
              <p className="text-2xl font-black">
                {data.calculatedGrade ?? "—"}
              </p>
              {data.sectionResults.map((result) => (
                <p key={result.section}>
                  {result.section}: {result.grade}
                </p>
              ))}
              {data.results.map((result) => (
                <p key={result.criterionCode}>
                  {result.criterionCode}: {result.achievement}
                  {result.comment ? ` · ${result.comment}` : ""}
                </p>
              ))}
              {data.feedback.map((item) => (
                <p key={item.createdAtUtc}>{item.body}</p>
              ))}
              <p className="text-xs text-muted">{t("completed.disclaimer")}</p>
            </div>
          ) : (
            <p className="card p-5 text-sm text-muted">{t("awaitingResult")}</p>
          )}
        </>
      ) : null}
    </section>
  );
}
