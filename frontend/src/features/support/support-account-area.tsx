"use client";

import { AccountProfile } from "@/features/auth/account-profile";
import { AccountSecurity } from "@/features/auth/account-security";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useState, useSyncExternalStore } from "react";

const subscribeToHydration = () => () => {};

type FreezeTarget = {
  id: string;
  displayName: string;
  email: string;
  isFrozen: boolean;
};
type TargetResponse = { items: FreezeTarget[]; totalCount: number };

export function SupportAccountArea({ segment }: { segment: string[] }) {
  const locale = useLocale();
  const client = useQueryClient();
  const [role, setRole] = useState<"Student" | "Teacher">("Student");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const current = segment.join("/") || "accounts";
  const viewer = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api<{ roles: string[] }>("/auth/me"),
  });
  const permitted =
    viewer.data?.roles.includes("SupportAdmin") ||
    viewer.data?.roles.includes("Admin") ||
    viewer.data?.roles.includes("SystemAdmin");
  const targets = useQuery({
    queryKey: ["support-freeze-targets", role, term, page],
    queryFn: () =>
      api<TargetResponse>(
        `/admin/users/freeze-targets?${new URLSearchParams({ role, search: term, page: String(page) })}`,
      ),
    enabled: Boolean(permitted) && current === "accounts",
  });
  const freeze = useMutation({
    mutationFn: ({ id, frozen }: { id: string; frozen: boolean }) =>
      api<void>(`/admin/users/${id}/freeze`, {
        method: "POST",
        body: JSON.stringify({ frozen }),
      }),
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["support-freeze-targets"] }),
  });

  if (!mounted || viewer.isPending)
    return (
      <p className="shell py-10" aria-busy="true">
        {locale === "ar" ? "جارٍ التحميل…" : "Loading…"}
      </p>
    );
  if (!permitted)
    return (
      <p className="shell py-10" role="alert">
        {locale === "ar"
          ? "لا تملك صلاحية إدارة الحسابات."
          : "You do not have account management access."}
      </p>
    );
  if (current === "profile") return <AccountProfile role="support" />;
  if (current === "security") return <AccountSecurity role="support" />;

  return (
    <section className="shell min-w-0 py-8">
      <h1 className="text-3xl font-black">
        {locale === "ar" ? "مساعدة إدارة الحسابات" : "Account support"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {locale === "ar"
          ? "يمكنك تجميد حسابات الطلاب والمعلمين أو إعادة تفعيلها فقط."
          : "Freeze or reactivate Student and Teacher accounts only."}
      </p>
      <nav
        aria-label={locale === "ar" ? "روابط الحساب" : "Account links"}
        className="mt-5 flex flex-wrap gap-3 text-sm font-bold text-primary"
      >
        <Link className="focus-ring" href={`/${locale}/support/profile`}>
          {locale === "ar" ? "الملف الشخصي" : "Profile"}
        </Link>
        <Link className="focus-ring" href={`/${locale}/support/security`}>
          {locale === "ar" ? "أمان الحساب" : "Security"}
        </Link>
      </nav>
      <div className="card mt-6 grid min-w-0 gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap gap-2">
          {(["Student", "Teacher"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={role === value}
              onClick={() => {
                setRole(value);
                setPage(1);
              }}
              className="focus-ring rounded-xl border border-border px-4 py-2 text-sm font-bold aria-pressed:bg-primary aria-pressed:text-slate-950"
            >
              {value === "Student"
                ? locale === "ar"
                  ? "الطلاب"
                  : "Students"
                : locale === "ar"
                  ? "المعلمون"
                  : "Teachers"}
            </button>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setTerm(search);
            setPage(1);
          }}
          className="flex min-w-0 flex-wrap gap-2"
        >
          <label className="min-w-0 flex-1 text-sm font-bold">
            <span className="sr-only">
              {locale === "ar" ? "بحث عن حساب" : "Search accounts"}
            </span>
            <input
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                locale === "ar" ? "الاسم أو البريد" : "Name or email"
              }
              className="focus-ring w-full min-w-0 rounded-xl border border-border bg-transparent px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="focus-ring rounded-xl bg-primary px-4 py-2 text-sm font-bold text-slate-950"
          >
            {locale === "ar" ? "بحث" : "Search"}
          </button>
        </form>
        {targets.isPending ? (
          <p aria-busy="true">
            {locale === "ar" ? "جارٍ تحميل الحسابات…" : "Loading accounts…"}
          </p>
        ) : targets.isError ? (
          <p role="alert" className="text-red-600">
            {locale === "ar"
              ? "تعذر تحميل الحسابات."
              : "Unable to load accounts."}
          </p>
        ) : targets.data?.items.length ? (
          <div className="grid gap-3">
            {targets.data.items.map((target) => (
              <article
                key={target.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"
              >
                <div className="min-w-0">
                  <p className="font-bold">{target.displayName}</p>
                  <p className="break-all text-sm text-muted" dir="ltr">
                    {target.email}
                  </p>
                  <p className="text-xs text-muted">
                    {target.isFrozen
                      ? locale === "ar"
                        ? "مجمّد"
                        : "Frozen"
                      : locale === "ar"
                        ? "نشط"
                        : "Active"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={freeze.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        target.isFrozen
                          ? locale === "ar"
                            ? "إعادة تفعيل الحساب؟"
                            : "Reactivate this account?"
                          : locale === "ar"
                            ? "تجميد الحساب وإنهاء جلساته؟"
                            : "Freeze this account and end its sessions?",
                      )
                    )
                      freeze.mutate({
                        id: target.id,
                        frozen: !target.isFrozen,
                      });
                  }}
                  className="focus-ring rounded-xl border border-border px-3 py-2 text-sm font-bold disabled:opacity-60"
                >
                  {target.isFrozen
                    ? locale === "ar"
                      ? "إعادة تفعيل"
                      : "Reactivate"
                    : locale === "ar"
                      ? "تجميد"
                      : "Freeze"}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            {locale === "ar"
              ? "لا توجد حسابات مطابقة."
              : "No matching accounts."}
          </p>
        )}
        {freeze.isError && (
          <p role="alert" className="text-sm text-red-600">
            {locale === "ar"
              ? "تعذر تحديث الحساب."
              : "Unable to update the account."}
          </p>
        )}
        {targets.data && (
          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="focus-ring disabled:opacity-50"
            >
              {locale === "ar" ? "السابق" : "Previous"}
            </button>
            <span>{page}</span>
            <button
              type="button"
              disabled={page * 25 >= targets.data.totalCount}
              onClick={() => setPage(page + 1)}
              className="focus-ring disabled:opacity-50"
            >
              {locale === "ar" ? "التالي" : "Next"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
