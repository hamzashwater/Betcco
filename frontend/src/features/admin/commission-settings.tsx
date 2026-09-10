"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgePercent, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

type Commission = {
  platformCommissionPercent: number;
  teacherSharePercent: number;
};

type SalesTax = { salesTaxPercent: number };

export function CommissionSettings() {
  const t = useTranslations("commerceCatalog");
  const client = useQueryClient();
  const [draft, setDraft] = useState<string>();
  const [taxDraft, setTaxDraft] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const commission = useQuery({
    queryKey: ["platform-commission"],
    queryFn: () => api<Commission>("/admin/commerce-catalog/commission"),
  });
  const salesTax = useQuery({
    queryKey: ["sales-tax"],
    queryFn: () => api<SalesTax>("/admin/commerce-catalog/sales-tax"),
  });
  const displayed =
    draft ?? commission.data?.platformCommissionPercent.toString() ?? "";
  const save = useMutation({
    mutationFn: (platformCommissionPercent: number) =>
      api("/admin/commerce-catalog/commission", {
        method: "PUT",
        body: JSON.stringify({ platformCommissionPercent }),
      }),
    onSuccess: () => {
      setDraft(undefined);
      setNotice(t("commissionUpdated"));
      client.invalidateQueries({ queryKey: ["platform-commission"] });
      client.invalidateQueries({ queryKey: ["admin-wallet"] });
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : t("requestFailed")),
  });
  const value = Number(displayed);
  const valid = Number.isFinite(value) && value >= 0 && value <= 100;
  const teacherShare = valid
    ? 100 - value
    : commission.data?.teacherSharePercent;
  const displayedTax =
    taxDraft ?? salesTax.data?.salesTaxPercent.toString() ?? "";
  const taxValue = Number(displayedTax);
  const taxIsValid =
    Number.isFinite(taxValue) && taxValue >= 0 && taxValue <= 100;
  const saveTax = useMutation({
    mutationFn: (salesTaxPercent: number) =>
      api("/admin/commerce-catalog/sales-tax", {
        method: "PUT",
        body: JSON.stringify({ salesTaxPercent }),
      }),
    onSuccess: () => {
      setTaxDraft(undefined);
      setNotice(t("taxUpdated"));
      client.invalidateQueries({ queryKey: ["sales-tax"] });
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : t("requestFailed")),
  });

  return (
    <section className="card mt-6 grid gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
          <BadgePercent size={20} aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-black">{t("commissionTitle")}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            {t("commissionDescription")}
          </p>
        </div>
      </div>
      <form
        className="grid gap-3 sm:grid-cols-[minmax(0,15rem)_1fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid || save.isPending) return;
          if (!window.confirm(t("commissionConfirm"))) return;
          save.mutate(value);
        }}
      >
        <label className="grid gap-1.5 text-sm font-bold">
          <span>{t("platformCommission")}</span>
          <input
            required
            type="number"
            min="0"
            max="100"
            step="0.001"
            value={displayed}
            onChange={(event) => setDraft(event.target.value)}
            className="focus-ring rounded-xl border border-border bg-transparent px-3 py-2.5 text-foreground"
            dir="ltr"
          />
        </label>
        <p className="pb-2.5 text-sm text-muted">
          {t("teacherShare", {
            percentage:
              teacherShare === undefined ? "—" : teacherShare.toFixed(3),
          })}
        </p>
        <button
          type="submit"
          disabled={!valid || save.isPending || commission.isPending}
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
        >
          <Save size={16} aria-hidden="true" />
          {save.isPending ? t("saving") : t("commissionSave")}
        </button>
      </form>
      <form
        className="border-t border-border pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!taxIsValid || saveTax.isPending) return;
          if (!window.confirm(t("taxConfirm"))) return;
          saveTax.mutate(taxValue);
        }}
      >
        <label className="grid max-w-xs gap-1.5 text-sm font-bold">
          <span>{t("salesTax")}</span>
          <input
            required
            type="number"
            min="0"
            max="100"
            step="0.001"
            value={displayedTax}
            onChange={(event) => setTaxDraft(event.target.value)}
            className="focus-ring rounded-xl border border-border bg-transparent px-3 py-2.5 text-foreground"
            dir="ltr"
          />
          <span className="text-xs font-normal leading-5 text-muted">
            {t("salesTaxDescription")}
          </span>
        </label>
        <button
          type="submit"
          disabled={!taxIsValid || saveTax.isPending || salesTax.isPending}
          className="focus-ring mt-3 inline-flex items-center justify-center gap-2 rounded-xl border border-primary px-4 py-2.5 text-sm font-black text-primary disabled:opacity-50"
        >
          <Save size={16} aria-hidden="true" />
          {saveTax.isPending ? t("saving") : t("salesTaxSave")}
        </button>
      </form>
      {notice ? (
        <p
          role="status"
          className={`text-sm ${save.isError ? "text-red-500" : "text-primary"}`}
        >
          {notice}
        </p>
      ) : null}
    </section>
  );
}
