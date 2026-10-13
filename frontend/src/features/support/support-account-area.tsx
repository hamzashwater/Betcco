"use client";

import { AccountProfile } from "@/features/auth/account-profile";
import { AccountSecurity } from "@/features/auth/account-security";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
  const supportCopy = useTranslations("supportWorkspace");
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
        {supportCopy("account.loading")}
      </p>
    );
  if (!permitted)
    return (
      <p className="shell py-10" role="alert">
        {supportCopy("account.denied")}
      </p>
    );
  if (current === "profile") return <AccountProfile role="support" />;
  if (current === "security") return <AccountSecurity role="support" />;

  return (
    <section className="shell min-w-0 py-8">
      <h1 className="text-3xl font-black">{supportCopy("account.title")}</h1>
      <p className="mt-2 text-sm text-muted">{supportCopy("account.scope")}</p>
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
                ? supportCopy("account.students")
                : supportCopy("account.teachers")}
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
              {supportCopy("account.searchLabel")}
            </span>
            <input
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={supportCopy("account.searchPlaceholder")}
              className="focus-ring w-full min-w-0 rounded-xl border border-border bg-transparent px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="focus-ring rounded-xl bg-primary px-4 py-2 text-sm font-bold text-slate-950"
          >
            {supportCopy("account.search")}
          </button>
        </form>
        {targets.isPending ? (
          <p aria-busy="true">{supportCopy("account.loadingAccounts")}</p>
        ) : targets.isError ? (
          <p role="alert" className="text-red-600">
            {supportCopy("account.loadFailed")}
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
                      ? supportCopy("account.frozen")
                      : supportCopy("account.active")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={freeze.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        target.isFrozen
                          ? supportCopy("account.confirmReactivate")
                          : supportCopy("account.confirmFreeze"),
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
                    ? supportCopy("account.reactivate")
                    : supportCopy("account.freeze")}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{supportCopy("account.empty")}</p>
        )}
        {freeze.isError && (
          <p role="alert" className="text-sm text-red-600">
            {supportCopy("account.updateFailed")}
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
              {supportCopy("account.previous")}
            </button>
            <span>{page}</span>
            <button
              type="button"
              disabled={page * 25 >= targets.data.totalCount}
              onClick={() => setPage(page + 1)}
              className="focus-ring disabled:opacity-50"
            >
              {supportCopy("account.next")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
