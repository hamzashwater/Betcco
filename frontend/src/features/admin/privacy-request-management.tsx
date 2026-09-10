"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useState } from "react";

type PrivacyRequestType =
  | "Access"
  | "Rectification"
  | "Restriction"
  | "ErasureOrConcealment"
  | "ObjectionToProfiling"
  | "Portability"
  | "WithdrawMarketingConsent";
type PrivacyRequestStatus =
  | "Submitted"
  | "IdentityVerificationRequired"
  | "InReview"
  | "Completed"
  | "Rejected"
  | "Cancelled";
type PrivacyRequest = {
  id: string;
  requestType: PrivacyRequestType;
  status: PrivacyRequestStatus;
  description?: string | null;
  resolutionSummary?: string | null;
  identityVerifiedAtUtc?: string | null;
  createdAtUtc: string;
  resolvedAtUtc?: string | null;
};
type PrivacyRequestPage = {
  items: PrivacyRequest[];
  page: number;
  pageSize: number;
  totalCount: number;
};

const statuses: PrivacyRequestStatus[] = [
  "Submitted",
  "IdentityVerificationRequired",
  "InReview",
  "Completed",
  "Rejected",
  "Cancelled",
];
const reviewStatuses: PrivacyRequestStatus[] = [
  "IdentityVerificationRequired",
  "InReview",
  "Completed",
  "Rejected",
];

export function PrivacyRequestManagement() {
  const locale = useLocale();
  const ar = locale === "ar";
  const [status, setStatus] = useState<PrivacyRequestStatus | "">("");
  const [selected, setSelected] = useState<PrivacyRequest | null>(null);
  const [nextStatus, setNextStatus] =
    useState<PrivacyRequestStatus>("InReview");
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [identityVerified, setIdentityVerified] = useState(false);
  const query = useQuery({
    queryKey: ["admin-privacy-requests", status],
    queryFn: () =>
      api<PrivacyRequestPage>(
        `/privacy/admin/requests?pageSize=50${status ? `&status=${status}` : ""}`,
      ),
    retry: false,
  });
  const review = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("No privacy request selected.");
      return api<PrivacyRequest>(`/privacy/admin/requests/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({
          status: nextStatus,
          resolutionSummary: resolutionSummary.trim() || null,
          markIdentityVerified: identityVerified,
        }),
      });
    },
    onSuccess: (updated) => {
      setSelected(updated);
      setResolutionSummary(updated.resolutionSummary ?? "");
      setIdentityVerified(Boolean(updated.identityVerifiedAtUtc));
      void query.refetch();
    },
  });
  const date = (value: string) =>
    new Intl.DateTimeFormat(ar ? "ar-JO" : "en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  const typeLabel = (type: PrivacyRequestType) =>
    ({
      Access: ar ? "الوصول إلى البيانات" : "Data access",
      Rectification: ar ? "تصحيح البيانات" : "Data correction",
      Restriction: ar ? "تقييد المعالجة" : "Restrict processing",
      ErasureOrConcealment: ar ? "المحو أو الإخفاء" : "Erase or conceal",
      ObjectionToProfiling: ar ? "الاعتراض على التنميط" : "Object to profiling",
      Portability: ar ? "نسخة قابلة للنقل" : "Portable copy",
      WithdrawMarketingConsent: ar
        ? "سحب موافقة التسويق"
        : "Withdraw marketing consent",
    })[type];
  const statusLabel = (value: PrivacyRequestStatus) =>
    ({
      Submitted: ar ? "تم الإرسال" : "Submitted",
      IdentityVerificationRequired: ar
        ? "مطلوب تحقق من الهوية"
        : "Identity check required",
      InReview: ar ? "قيد المراجعة" : "In review",
      Completed: ar ? "مكتمل" : "Completed",
      Rejected: ar ? "مرفوض" : "Rejected",
      Cancelled: ar ? "ملغى" : "Cancelled",
    })[value];
  const selectRequest = (item: PrivacyRequest) => {
    setSelected(item);
    setNextStatus(item.status === "Submitted" ? "InReview" : item.status);
    setResolutionSummary(item.resolutionSummary ?? "");
    setIdentityVerified(Boolean(item.identityVerifiedAtUtc));
    review.reset();
  };
  const isFinal = selected?.status
    ? ["Completed", "Rejected", "Cancelled"].includes(selected.status)
    : false;

  return (
    <section className="shell py-8 sm:py-10">
      <div className="max-w-6xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
          BETCCO · Privacy operations
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
          {ar ? "طلبات الخصوصية" : "Privacy requests"}
        </h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted">
          {ar
            ? "سجل تشغيلي للمراجعة البشرية. لا تنفّذ الحذف أو التصدير من هذه الشاشة قبل التحقق من الهوية والالتزام بالسياسة القانونية المعتمدة."
            : "A human-review queue. Do not erase or export data from this screen before identity verification and the approved legal policy checks."}
        </p>
      </div>
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,.7fr)]">
        <div className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-black">
              {ar ? "قائمة المراجعة" : "Review queue"}
              {query.data ? ` (${query.data.totalCount})` : ""}
            </h2>
            <label className="text-sm font-black">
              <span className="sr-only">{ar ? "الحالة" : "Status"}</span>
              <select
                className="focus-ring rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as PrivacyRequestStatus | "")
                }
              >
                <option value="">{ar ? "كل الحالات" : "All statuses"}</option>
                {statuses.map((item) => (
                  <option key={item} value={item}>
                    {statusLabel(item)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {query.isPending ? (
            <div
              className="mt-5 h-56 animate-pulse rounded-2xl bg-surface-solid"
              aria-busy
            />
          ) : query.isError ? (
            <p
              className="mt-5 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger"
              role="alert"
            >
              {query.error.message}
            </p>
          ) : query.data?.items.length ? (
            <ul className="mt-5 grid gap-3">
              {query.data.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => selectRequest(item)}
                    className={`focus-ring w-full rounded-2xl border p-4 text-start transition ${selected?.id === item.id ? "border-primary bg-primary/10" : "border-border bg-surface-solid/45 hover:bg-surface"}`}
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-black">
                        {typeLabel(item.requestType)}
                      </span>
                      <span className="text-sm text-primary">
                        {statusLabel(item.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {date(item.createdAtUtc)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted">
              {ar
                ? "لا توجد طلبات بهذه الحالة."
                : "There are no requests with this status."}
            </p>
          )}
        </div>
        <aside className="card h-fit p-5 sm:p-6" aria-live="polite">
          {!selected ? (
            <p className="text-muted">
              {ar
                ? "اختر طلبًا من القائمة لمراجعته."
                : "Select a request from the queue to review it."}
            </p>
          ) : (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                review.mutate();
              }}
            >
              <div>
                <p className="font-black">{typeLabel(selected.requestType)}</p>
                <p className="mt-1 text-sm text-muted">
                  {statusLabel(selected.status)} · {date(selected.createdAtUtc)}
                </p>
              </div>
              {selected.description && (
                <div className="rounded-xl border border-border bg-surface-solid/50 p-3 text-sm leading-6 text-muted">
                  {selected.description}
                </div>
              )}
              <label className="grid gap-2 text-sm font-black">
                {ar ? "حالة المراجعة" : "Review status"}
                <select
                  className="focus-ring min-h-11 rounded-xl border border-border bg-background px-3 text-foreground"
                  value={nextStatus}
                  disabled={isFinal}
                  onChange={(event) =>
                    setNextStatus(event.target.value as PrivacyRequestStatus)
                  }
                >
                  {reviewStatuses.map((item) => (
                    <option key={item} value={item}>
                      {statusLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-black">
                {ar ? "ملاحظة للمستخدم" : "User-facing review note"}
                <textarea
                  className="focus-ring min-h-28 rounded-xl border border-border bg-background p-3 text-foreground"
                  value={resolutionSummary}
                  maxLength={2000}
                  disabled={isFinal}
                  onChange={(event) => setResolutionSummary(event.target.value)}
                  placeholder={
                    ar
                      ? "مطلوبة عند الإكمال أو الرفض. لا تضع ملاحظات داخلية حساسة هنا."
                      : "Required for completion or rejection. Do not put sensitive internal notes here."
                  }
                />
              </label>
              <label className="flex items-start gap-3 text-sm leading-6 text-muted">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={identityVerified}
                  disabled={isFinal || Boolean(selected.identityVerifiedAtUtc)}
                  onChange={(event) =>
                    setIdentityVerified(event.target.checked)
                  }
                />
                <span>
                  {ar
                    ? "تم التحقق من هوية صاحب الطلب وفق الإجراء التشغيلي المعتمد."
                    : "The requester's identity was verified under the approved operational procedure."}
                </span>
              </label>
              {selected.identityVerifiedAtUtc && (
                <p className="text-sm text-muted">
                  {ar ? "تم توثيق التحقق:" : "Verification recorded:"}{" "}
                  {date(selected.identityVerifiedAtUtc)}
                </p>
              )}
              {!isFinal && (
                <button
                  type="submit"
                  className="focus-ring rounded-xl bg-primary px-4 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={review.isPending}
                >
                  {review.isPending
                    ? ar
                      ? "جارٍ الحفظ…"
                      : "Saving…"
                    : ar
                      ? "حفظ قرار المراجعة"
                      : "Save review decision"}
                </button>
              )}
              {review.isError && (
                <p className="text-sm text-danger" role="alert">
                  {review.error.message}
                </p>
              )}
              {review.isSuccess && (
                <p className="text-sm text-emerald-600" role="status">
                  {ar ? "تم حفظ قرار المراجعة." : "Review decision saved."}
                </p>
              )}
            </form>
          )}
        </aside>
      </div>
    </section>
  );
}
