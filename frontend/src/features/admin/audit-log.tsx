"use client";

import { formatLocalizedDateTime } from "@/i18n/date-time";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { QueryState } from "@/components/ui/query-state";
import styles from "./audit-log.module.css";

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
  const emptyFilters = {
    search: "",
    action: "",
    entityType: "",
    outcome: "",
    fromDate: "",
    toDate: "",
  };
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string>();
  const result = useQuery({
    queryKey: ["admin-audit-logs", filters, page],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "25",
      });
      if (filters.search) params.set("search", filters.search);
      if (filters.action) params.set("action", filters.action);
      if (filters.entityType) params.set("entityType", filters.entityType);
      if (filters.outcome) params.set("outcome", filters.outcome);
      if (filters.fromDate)
        params.set("fromUtc", `${filters.fromDate}T00:00:00Z`);
      if (filters.toDate)
        params.set("toUtc", `${filters.toDate}T23:59:59.999Z`);
      return api<AuditLogPage>(`/admin/audit-logs?${params.toString()}`);
    },
    placeholderData: (previous) => previous,
  });
  const exportCurrent = async () => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.action) params.set("action", filters.action);
    if (filters.entityType) params.set("entityType", filters.entityType);
    if (filters.outcome) params.set("outcome", filters.outcome);
    if (filters.fromDate)
      params.set("fromUtc", `${filters.fromDate}T00:00:00Z`);
    if (filters.toDate) params.set("toUtc", `${filters.toDate}T23:59:59.999Z`);

    setExportError(undefined);
    setIsExporting(true);
    try {
      const response = await fetch(
        `/api/v1/admin/audit-logs/export?${params.toString()}`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as
          { message?: string } | undefined;
        throw new Error(body?.message ?? t("exportError"));
      }
      const blob = await response.blob();
      const fileName =
        response.headers
          .get("content-disposition")
          ?.match(/filename="?([^";]+)"?/i)?.[1] ?? "betcco-audit-log.csv";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : t("exportError"));
    } finally {
      setIsExporting(false);
    }
  };

  const values = result.data;
  const pageCount = values
    ? Math.max(1, Math.ceil(values.totalCount / values.pageSize))
    : 1;
  return (
    <section className={`shell py-8 ${styles.workspace}`}>
      <header className={styles.header}>
        <h1>{t("title")}</h1>
        <p>{t("description")}</p>
      </header>
      <form
        className={styles.filters}
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setFilters({
            ...draftFilters,
            search: draftFilters.search.trim(),
            action: draftFilters.action.trim(),
            entityType: draftFilters.entityType.trim(),
          });
        }}
      >
        <label className={styles.search}>
          <Search size={18} strokeWidth={2} aria-hidden="true" />
          <input
            value={draftFilters.search}
            onChange={(event) =>
              setDraftFilters((current) => ({
                ...current,
                search: event.target.value,
              }))
            }
            placeholder={t("searchPlaceholder")}
            aria-label={t("search")}
          />
        </label>
        <FilterTextField
          label={t("actionFilter")}
          value={draftFilters.action}
          onChange={(value) =>
            setDraftFilters((current) => ({ ...current, action: value }))
          }
        />
        <FilterTextField
          label={t("entityFilter")}
          value={draftFilters.entityType}
          onChange={(value) =>
            setDraftFilters((current) => ({ ...current, entityType: value }))
          }
        />
        <label className={styles.field}>
          {t("outcomeFilter")}
          <select
            value={draftFilters.outcome}
            onChange={(event) =>
              setDraftFilters((current) => ({
                ...current,
                outcome: event.target.value,
              }))
            }
          >
            <option value="">{t("outcomeAll")}</option>
            <option value="Success">{t("outcomeSuccess")}</option>
            <option value="Failure">{t("outcomeFailure")}</option>
            <option value="RiskObserved">{t("outcomeRiskObserved")}</option>
          </select>
        </label>
        <DateFilter
          label={t("fromDate")}
          value={draftFilters.fromDate}
          onChange={(value) =>
            setDraftFilters((current) => ({ ...current, fromDate: value }))
          }
        />
        <DateFilter
          label={t("toDate")}
          value={draftFilters.toDate}
          onChange={(value) =>
            setDraftFilters((current) => ({ ...current, toDate: value }))
          }
        />
        <div className={styles.actions}>
          <button type="submit">{t("search")}</button>
          <button
            type="button"
            onClick={() => {
              setDraftFilters(emptyFilters);
              setFilters(emptyFilters);
              setPage(1);
            }}
          >
            {t("clearFilters")}
          </button>
        </div>
      </form>
      <div className={styles.export}>
        <button
          type="button"
          onClick={exportCurrent}
          disabled={isExporting}
          aria-busy={isExporting}
        >
          <Download size={18} strokeWidth={2} aria-hidden="true" />
          {isExporting ? t("exporting") : t("exportCsv")}
        </button>
        <p>{t("exportHint")}</p>
      </div>
      {exportError ? (
        <QueryState
          kind="error"
          title={exportError}
          className={styles.notice}
        />
      ) : null}
      {result.isPending || result.isFetching ? (
        <QueryState
          kind="loading"
          title={t("loading")}
          className={styles.notice}
        />
      ) : null}
      {result.isError ? (
        <QueryState
          kind="error"
          title={t("loadError")}
          className={styles.notice}
        />
      ) : null}
      {values &&
      !values.items.length &&
      !result.isPlaceholderData &&
      !result.isError ? (
        <QueryState kind="empty" title={t("empty")} className={styles.notice} />
      ) : null}
      {values?.items.length ? (
        <>
          <div className={styles.ledger}>
            {values.items.map((item) => (
              <article key={item.id} className={styles.row}>
                <div className={styles.facts}>
                  <time className={styles.when} dateTime={item.createdAtUtc}>
                    {formatLocalizedDateTime(item.createdAtUtc, locale)}
                  </time>
                  <p className={styles.actor}>
                    <span className={styles.label}>{t("actor")}</span>
                    {item.actorName}
                  </p>
                  <p className={styles.action}>{item.action}</p>
                  <p className={styles.entity}>
                    <span className={styles.label}>{t("entity")}</span>
                    {item.entityType}
                    {item.entityId ? (
                      <bdi className={styles.identifier}>{item.entityId}</bdi>
                    ) : null}
                  </p>
                  <span className={styles.outcome} data-outcome={item.outcome}>
                    {item.outcome}
                  </span>
                </div>
                <div className={styles.disclosures}>
                  {item.metadataJson ||
                  item.ipAddress ||
                  item.userAgent ||
                  item.correlationId ? (
                    <details>
                      <summary>{t("details")}</summary>
                      <div className={styles.detail}>
                        {item.metadataJson ? (
                          <pre className={styles.json} dir="ltr">
                            {item.metadataJson}
                          </pre>
                        ) : null}
                        {item.ipAddress ||
                        item.userAgent ||
                        item.correlationId ? (
                          <p dir="ltr">
                            {[
                              item.ipAddress,
                              item.userAgent,
                              item.correlationId,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    </details>
                  ) : null}
                  {item.oldValuesJson || item.newValuesJson ? (
                    <details>
                      <summary>{t("changes")}</summary>
                      <div className={`${styles.detail} ${styles.changes}`}>
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
                </div>
              </article>
            ))}
          </div>
          <nav className={styles.pagination} aria-label={t("pagination")}>
            <p>{t("total", { count: values.totalCount })}</p>
            <div className={styles.pages}>
              <button
                type="button"
                disabled={page <= 1 || result.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
                {t("previous")}
              </button>
              <span>{t("page", { page, pageCount })}</span>
              <button
                type="button"
                disabled={page >= pageCount || result.isFetching}
                onClick={() =>
                  setPage((current) => Math.min(pageCount, current + 1))
                }
              >
                {t("next")}
                <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </nav>
        </>
      ) : null}
    </section>
  );
}

function FilterTextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.field}>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.field}>
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function AuditValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p>{label}</p>
      <pre className={styles.json} dir="ltr">
        {value}
      </pre>
    </div>
  );
}
