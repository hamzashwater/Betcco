"use client";

import { formatLocalizedDate } from "@/i18n/date-time";
import { formatLocalizedCurrency } from "@/i18n/number-format";
import { FilePicker } from "@/components/forms/file-picker";
import { academicText } from "@/lib/academic-localization";
import { api, ApiError } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useLocale } from "next-intl";
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

function activationError(error: Error, locale: string) {
  if (!(error instanceof ApiError))
    return locale === "ar"
      ? "تعذر بدء إعادة التقييم. حاول مجددًا."
      : "Unable to start the Resit. Please retry.";
  const messages: Record<string, [string, string]> = {
    RESIT_AUTHORIZATION_REVOKED: [
      "فرصة إعادة التقييم هذه لم تعد متاحة.",
      "This Resit opportunity is no longer available.",
    ],
    RESIT_ORIGINAL_NO_LONGER_VALID: [
      "لم يعد الطلب الأصلي مؤهلًا لإعادة التقييم.",
      "The original request is no longer eligible for Resit.",
    ],
    RESIT_ACADEMIC_SNAPSHOT_INVALID: [
      "تعذر قراءة بيانات التقييم الأصلية. تواصل مع الدعم.",
      "The original assessment details are unavailable. Contact support.",
    ],
    RESIT_ACTIVATION_CONFLICT: [
      "تغيرت حالة الفرصة. حدّث الصفحة وحاول مجددًا.",
      "This opportunity changed. Refresh and try again.",
    ],
  };
  const message =
    error.status === 404
      ? [
          "الفرصة غير متاحة. حدّث الصفحة.",
          "Opportunity unavailable. Refresh the page.",
        ]
      : messages[error.code ?? ""];
  return message
    ? message[locale === "ar" ? 0 : 1]
    : locale === "ar"
      ? "تعذر بدء إعادة التقييم. حاول مجددًا."
      : "Unable to start the Resit. Please retry.";
}

export function StudentResitOpportunities() {
  const locale = useLocale();
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
    <section
      className="mt-6 grid gap-3"
      aria-label={locale === "ar" ? "فرص إعادة التقييم" : "Resit opportunities"}
    >
      <h2 className="text-xl font-black">
        {locale === "ar" ? "فرص إعادة التقييم" : "Resit opportunities"}
      </h2>
      {opportunities.isPending ? (
        <p role="status">
          {locale === "ar" ? "جارٍ تحميل الفرص…" : "Loading opportunities…"}
        </p>
      ) : null}
      {opportunities.isError ? (
        <p role="alert">
          {locale === "ar"
            ? "تعذر تحميل فرص إعادة التقييم."
            : "Unable to load Resit opportunities."}
        </p>
      ) : null}
      {opportunities.data?.items?.length === 0 ? (
        <p className="text-sm text-muted">
          {locale === "ar"
            ? "لا توجد فرص إعادة تقييم حاليًا."
            : "No Resit opportunities available."}
        </p>
      ) : null}
      {opportunities.data?.items?.map((item) => (
        <article
          className="card grid min-w-0 gap-2 p-4"
          key={item.authorizationId}
        >
          <strong className="text-primary">
            {locale === "ar" ? "فرصة إعادة التقييم" : "Resit opportunity"}
          </strong>
          <AcademicContext academic={item.academic} locale={locale} />
          <p className="text-sm">
            {locale === "ar" ? "الطلب الأصلي" : "Original request"}:{" "}
            {item.originalEvaluationRequestId.slice(0, 8)}
          </p>
          <p className="text-xs text-muted">
            {formatLocalizedDate(item.authorizedAtUtc, locale)}
          </p>
          {item.state === "Authorized" ? (
            <>
              <p className="text-sm text-muted">
                {locale === "ar"
                  ? "مراجعة استشارية نهائية مستقلة من BETCCO بملفات وأدلة جديدة ودفع منفصل لاحقًا."
                  : "One separate final BETCCO advisory review with fresh files and evidence. Separate payment follows later."}
              </p>
              <button
                type="button"
                className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 font-bold text-white disabled:opacity-50"
                disabled={activate.isPending}
                onClick={() => activate.mutate(item.authorizationId)}
              >
                {locale === "ar" ? "بدء إعادة التقييم" : "Start Resit"}
              </button>
            </>
          ) : item.state === "Activated" && item.resitEvaluationRequestId ? (
            <>
              <p className="text-sm">
                {locale === "ar"
                  ? "تم التفعيل · طلب إعادة التقييم"
                  : "Activated · Resit request"}
                : {item.resitEvaluationRequestId.slice(0, 8)}
              </p>
              <Link
                className="focus-ring w-fit font-bold text-primary underline"
                href={`/${locale}/student/evaluations/${item.resitEvaluationRequestId}`}
              >
                {locale === "ar"
                  ? "فتح مسودة إعادة التقييم"
                  : "Open Resit draft"}
              </Link>
            </>
          ) : (
            <p className="text-sm text-muted">
              {locale === "ar"
                ? "فرصة إعادة التقييم هذه لم تعد متاحة."
                : "This Resit opportunity is no longer available."}
            </p>
          )}
        </article>
      ))}
      {activate.isError ? (
        <p role="alert" className="text-sm text-red-500">
          {activationError(activate.error, locale)}
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
            {locale === "ar" ? "السابق" : "Previous"}
          </button>
          <button
            type="button"
            className="focus-ring rounded-lg border px-3 py-2 disabled:opacity-50"
            disabled={!opportunities.data.hasNextPage}
            onClick={() => setPage((current) => current + 1)}
          >
            {locale === "ar" ? "التالي" : "Next"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function StudentResitDetail({ evaluationId }: { evaluationId: string }) {
  const locale = useLocale();
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
        {locale === "ar" ? "العودة إلى الطلبات" : "Back to evaluations"}
      </Link>
      {detail.isPending ? (
        <p role="status">
          {locale === "ar" ? "جارٍ تحميل الطلب…" : "Loading request…"}
        </p>
      ) : null}
      {detail.isError || (data && !data.isResit) ? (
        <p role="alert">
          {locale === "ar"
            ? "طلب إعادة التقييم غير متاح."
            : "Resit request unavailable."}
        </p>
      ) : null}
      {data?.isResit ? (
        <>
          <header className="card grid gap-2 p-5">
            <h1 className="text-2xl font-black">
              {locale === "ar" ? "مراجعة Resit نهائية" : "Resit final review"}
            </h1>
            <AcademicContext academic={data.academic} locale={locale} />
            <p>
              {locale === "ar" ? "الحالة" : "Status"}: {data.status}
            </p>
            {data.resitOfEvaluationRequestId ? (
              <p className="text-sm">
                {locale === "ar" ? "الطلب الأصلي" : "Original request"}:{" "}
                {data.resitOfEvaluationRequestId.slice(0, 8)}
              </p>
            ) : null}
          </header>
          {data.status === "Draft" ? (
            <div className="card grid gap-5 p-5">
              <h2 className="text-xl font-black">
                {locale === "ar"
                  ? "تجهيز أدلة إعادة التقييم"
                  : "Prepare Resit evidence"}
              </h2>
              <FilePicker
                label={
                  locale === "ar"
                    ? "ملفات إعادة التقييم الجديدة"
                    : "Fresh Resit files"
                }
                files={files}
                onFilesChange={setFiles}
                locale={locale}
                accept=".pdf,.docx,.xlsx,.txt,.jpg,.jpeg,.png,.webp"
                multiple
                maxFileBytes={100 * 1024 * 1024}
                chooseLabel={
                  locale === "ar" ? "اختيار الملفات" : "Choose files"
                }
              />
              <button
                type="button"
                className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 font-bold text-white disabled:opacity-50"
                disabled={!files.length || upload.isPending}
                onClick={() => upload.mutate()}
              >
                {locale === "ar" ? "رفع الملفات" : "Upload files"}
              </button>
              {upload.isError ? (
                <p role="alert" className="text-red-500">
                  {locale === "ar"
                    ? "تعذر رفع الملفات. حاول مجددًا."
                    : "File upload failed. Please retry."}
                </p>
              ) : null}
              {upload.isSuccess ? (
                <p role="status" className="text-sm text-primary">
                  {locale === "ar" ? "تم حفظ الملفات." : "Files saved."}
                </p>
              ) : null}
              <div className="grid gap-2">
                <h3 className="font-bold">
                  {locale === "ar" ? "الملفات المحفوظة" : "Saved files"}
                </h3>
                {data.files.length ? (
                  <ul className="grid gap-1 text-sm">
                    {data.files.map((file) => (
                      <li key={file.id} className="break-words">
                        {file.originalFileName} · {file.scanStatus}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">
                    {locale === "ar"
                      ? "لم تُرفع ملفات بعد."
                      : "No files uploaded yet."}
                  </p>
                )}
              </div>
              <div className="grid gap-3">
                <h3 className="font-bold">
                  {locale === "ar" ? "أدلة المعايير" : "Criterion evidence"}
                </h3>
                {data.criteria.map((criterion) => {
                  const saved =
                    data.evidence.find(
                      (item) => item.criterionCode === criterion,
                    )?.narrative ?? "";
                  return (
                    <div key={criterion} className="grid gap-2">
                      <label className="grid gap-1 text-sm font-semibold">
                        {locale === "ar"
                          ? `دليل ${criterion}`
                          : `Evidence for ${criterion}`}
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
                        {locale === "ar" ? "حفظ الدليل" : "Save evidence"}
                      </button>
                    </div>
                  );
                })}
                {saveEvidence.isError ? (
                  <p role="alert" className="text-red-500">
                    {locale === "ar"
                      ? "تعذر حفظ الدليل."
                      : "Unable to save evidence."}
                  </p>
                ) : null}
                {saveEvidence.isSuccess ? (
                  <p role="status" className="text-sm text-primary">
                    {locale === "ar" ? "تم حفظ الدليل." : "Evidence saved."}
                  </p>
                ) : null}
              </div>
              {data.hasAuthenticityDeclaration ? (
                <p role="status" className="font-semibold text-primary">
                  {locale === "ar"
                    ? "تم تأكيد أصالة العمل"
                    : "Originality confirmed"}
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
                    {locale === "ar"
                      ? "أقر بأن الملفات والأدلة المقدمة تخصني وأنني ذكرت مصادر المساعدة المسموح بها."
                      : "I declare these files and evidence are my own and acknowledge permitted sources of help."}
                  </label>
                  <button
                    type="button"
                    className="focus-ring w-fit rounded-lg border px-3 py-2 font-semibold disabled:opacity-50"
                    disabled={!confirmOriginality || declare.isPending}
                    onClick={() => declare.mutate()}
                  >
                    {locale === "ar"
                      ? "تأكيد أصالة العمل"
                      : "Confirm originality"}
                  </button>
                  {declare.isError ? (
                    <p role="alert" className="text-red-500">
                      {locale === "ar"
                        ? "تعذر تسجيل الإقرار."
                        : "Unable to record declaration."}
                    </p>
                  ) : null}
                </>
              )}
              {data.files.some((file) => file.scanStatus === "Clean") &&
              data.hasAuthenticityDeclaration ? (
                <p role="status" className="font-semibold">
                  {locale === "ar"
                    ? "اكتمل تجهيز الأدلة."
                    : "Preparation complete."}
                </p>
              ) : null}
              <div className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
                <p className="font-black">
                  {locale === "ar"
                    ? "مراجعة Resit مدفوعة"
                    : "Paid Resit review"}
                </p>
                <p>
                  {locale === "ar"
                    ? `السعر المحدد من الخادم: ${formatLocalizedCurrency(data.price, data.currency, locale)}. تُحسب أي ضريبة مطبقة عند الدفع.`
                    : `Server-owned Resit review price: ${formatLocalizedCurrency(data.price, data.currency, locale)}. Any applicable tax is calculated at checkout.`}
                </p>
                <label className="grid gap-1 font-semibold">
                  {locale === "ar" ? "طريقة الدفع" : "Payment method"}
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    className="rounded-lg border bg-transparent p-3"
                  >
                    <option value="Card">
                      {locale === "ar" ? "بطاقة بنكية" : "Bank card"}
                    </option>
                    <option value="BankTransfer">
                      {locale === "ar" ? "تحويل بنكي" : "Bank transfer"}
                    </option>
                    <option value="EWallet">
                      {locale === "ar" ? "محفظة إلكترونية" : "E-wallet"}
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
                  {checkout.isPending
                    ? "…"
                    : locale === "ar"
                      ? "المتابعة إلى الدفع"
                      : "Continue to payment"}
                </button>
                {checkout.isError ? (
                  <p role="alert" className="text-red-500">
                    {checkout.error.message ===
                    "RESIT_INCLUDED_CREDIT_INVARIANT_VIOLATION"
                      ? locale === "ar"
                        ? "تعارض في حالة الدفع. تواصل مع الدعم."
                        : "Payment state conflict. Contact support."
                      : locale === "ar"
                        ? "تعذر بدء الدفع. حدّث حالة الطلب قبل المحاولة مجددًا."
                        : "Unable to start payment. Refresh the request status before retrying."}
                  </p>
                ) : null}
              </div>
            </div>
          ) : data.status === "PendingPayment" ? (
            <div className="card grid gap-3 p-5" aria-live="polite">
              <h2 className="text-xl font-black">
                {locale === "ar" ? "الدفع قيد الانتظار" : "Payment pending"}
              </h2>
              {paymentSession?.provider.startsWith("Fake") ? (
                <>
                  <p>
                    {locale === "ar"
                      ? "دفعة اختبارية — بيئة التطوير فقط. أكملها يدويًا؛ هذا ليس بديلًا عن تأكيد مزود الدفع الحقيقي."
                      : "Development test payment only. Complete it explicitly; this is not a substitute for real provider confirmation."}
                  </p>
                  <button
                    type="button"
                    className="focus-ring w-fit rounded-lg border border-primary px-3 py-2 font-black text-primary disabled:opacity-50"
                    disabled={confirmDevelopmentPayment.isPending}
                    onClick={() => confirmDevelopmentPayment.mutate()}
                  >
                    {confirmDevelopmentPayment.isPending
                      ? "…"
                      : locale === "ar"
                        ? "إتمام الدفع الاختباري"
                        : "Complete test payment"}
                  </button>
                  {confirmDevelopmentPayment.isError ? (
                    <p role="alert">
                      {locale === "ar"
                        ? "تعذر تأكيد الدفع الاختباري."
                        : "Unable to confirm test payment."}
                    </p>
                  ) : null}
                </>
              ) : (
                <p>
                  {locale === "ar"
                    ? "تحقق من سجل دفعاتك أو تواصل مع الدعم إذا بقيت الحالة معلقة. لا تبدأ دفعة أخرى."
                    : "Check your payment history or contact support if this remains pending. Do not start another payment."}
                </p>
              )}
            </div>
          ) : data.status === "Completed" ? (
            <div className="card grid gap-3 p-5">
              <h2 className="text-xl font-black">
                {locale === "ar"
                  ? "النتيجة الاستشارية النهائية للـ Resit"
                  : "Final Resit advisory result"}
              </h2>
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
              <p className="text-xs text-muted">
                {locale === "ar"
                  ? "هذه نتيجة إرشادية من BETCCO وليست نتيجة رسمية من الجهة التعليمية."
                  : "This is a BETCCO advisory result, not an official school or awarding body result."}
              </p>
            </div>
          ) : (
            <p className="card p-5 text-sm text-muted">
              {locale === "ar"
                ? "ستظهر النتيجة بعد اكتمال المراجعة."
                : "The result will appear after review is complete."}
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
