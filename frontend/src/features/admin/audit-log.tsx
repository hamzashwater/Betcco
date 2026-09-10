"use client";

import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, History, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type AuditLog = {
  id: string;
  actorUserId?: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId?: string;
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
  outcome: string;
  metadataJson?: string;
  oldValuesJson?: string;
  newValuesJson?: string;
  createdAtUtc: string;
};
type AuditLogPage = {
  items: AuditLog[];
  page: number;
  pageSize: number;
  totalCount: number;
};

export function AuditLogViewer() {
  const locale = useLocale();
  const t = useTranslations("auditLog");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const result = useQuery({
    queryKey: ["admin-audit-logs", search, page],
    queryFn: () =>
      api<AuditLogPage>(
        `/admin/audit-logs?page=${page}&pageSize=25&search=${encodeURIComponent(search)}`,
      ),
    placeholderData: (previous) => previous,
  });
  const values = result.data;
  const pageCount = values
    ? Math.max(1, Math.ceil(values.totalCount / values.pageSize))
    : 1;
  return (
    <section className="shell py-10">
      <header className="relative overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_86%_14%,color-mix(in_srgb,var(--primary)_24%,transparent),transparent_38%),linear-gradient(125deg,color-mix(in_srgb,var(--surface)_92%,transparent),color-mix(in_srgb,var(--surface-solid)_72%,transparent))] p-6 shadow-[var(--shadow)] sm:p-8">
        <span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary">
          <History size={21} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
          {t("description")}
        </p>
      </header>
      <form
        className="mt-6 flex max-w-2xl gap-2 rounded-2xl border border-border bg-surface-solid/50 p-2"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(searchInput.trim());
        }}
      >
        <label className="flex min-w-0 flex-1 items-center gap-2 px-2">
          <Search
            size={17}
            className="shrink-0 text-muted"
            aria-hidden="true"
          />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-foreground outline-none"
            aria-label={t("search")}
          />
        </label>
        <button
          type="submit"
          className="focus-ring rounded-xl bg-primary px-4 py-2 text-sm font-black text-slate-950"
        >
          {t("search")}
        </button>
      </form>
      {result.isPending ? (
        <div className="card mt-6 p-6" aria-busy>
          {t("loading")}
        </div>
      ) : result.isError ? (
        <p className="card mt-6 p-6 text-sm text-red-500" role="alert">
          {t("loadError")}
        </p>
      ) : !values?.items.length ? (
        <p className="card mt-6 p-6 text-sm text-muted">{t("empty")}</p>
      ) : (
        <>
          <div className="mt-6 grid gap-3">
            {values.items.map((item) => (
              <article
                key={item.id}
                className="card grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="font-black text-foreground">{item.action}</p>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.outcome === "Success" ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/15 text-red-300"}`}
                    >
                      {item.outcome}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {t("actor")}:{" "}
                    <span className="font-bold text-foreground">
                      {item.actorName}
                    </span>
                    <span className="px-2">·</span>
                    {t("entity")}:{" "}
                    <span className="font-bold text-foreground">
                      {item.entityType}
                    </span>
                    {item.entityId ? (
                      <span className="break-all text-xs">
                        {" "}
                        · {item.entityId}
                      </span>
                    ) : null}
                  </p>
                  {item.metadataJson ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-bold text-primary">
                        {t("details")}
                      </summary>
                      <pre
                        className="mt-2 overflow-x-auto rounded-lg border border-border bg-black/15 p-3 text-xs text-muted"
                        dir="ltr"
                      >
                        {item.metadataJson}
                      </pre>
                    </details>
                  ) : null}
                  {item.oldValuesJson || item.newValuesJson ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-bold text-primary">
                        {t("changes")}
                      </summary>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {item.oldValuesJson ? (
                          <AuditValue
                            label={t("oldValue")}
                            value={item.oldValuesJson}
                          />
                        ) : null}
                        {item.newValuesJson ? (
                          <AuditValue
                            label={t("newValue")}
                            value={item.newValuesJson}
                          />
                        ) : null}
                      </div>
                    </details>
                  ) : null}
                  {item.ipAddress || item.userAgent || item.correlationId ? (
                    <p className="mt-3 break-all text-xs text-muted" dir="ltr">
                      {[item.ipAddress, item.userAgent, item.correlationId]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
                <p className="whitespace-nowrap text-xs text-muted">
                  {new Date(item.createdAtUtc).toLocaleString(locale)}
                </p>
              </article>
            ))}
          </div>
          <nav
            className="mt-6 flex items-center justify-between gap-3"
            aria-label={t("pagination")}
          >
            <p className="text-sm text-muted">
              {t("total", { count: values.totalCount })}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || result.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="focus-ring inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm font-bold disabled:opacity-50"
              >
                <ChevronLeft size={16} aria-hidden="true" />
                {t("previous")}
              </button>
              <span className="text-sm font-bold text-muted">
                {t("page", { page, pageCount })}
              </span>
              <button
                type="button"
                disabled={page >= pageCount || result.isFetching}
                onClick={() =>
                  setPage((current) => Math.min(pageCount, current + 1))
                }
                className="focus-ring inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm font-bold disabled:opacity-50"
              >
                {t("next")}
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </nav>
        </>
      )}
    </section>
  );
}

function AuditValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold text-muted">{label}</p>
      <pre
        className="mt-1 overflow-x-auto rounded-lg border border-border bg-black/15 p-3 text-xs text-muted"
        dir="ltr"
      >
        {value}
      </pre>
    </div>
  );
}
