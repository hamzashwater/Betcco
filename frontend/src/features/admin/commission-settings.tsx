"use client";

import { MutationOutcome, QueryState } from "@/components/ui/query-state";
import styles from "./commission-settings.module.css";
import { formatLocalizedPercentage } from "@/i18n/number-format";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgePercent, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type Commission = {
  platformCommissionPercent: number;
  teacherSharePercent: number;
};

type SalesTax = { salesTaxPercent: number };

export function CommissionSettings() {
  const locale = useLocale();
  const t = useTranslations("commerceCatalog");
  const client = useQueryClient();
  const [draft, setDraft] = useState<string>();
  const [taxDraft, setTaxDraft] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [noticeContext, setNoticeContext] = useState<{
    owner: "commission" | "tax";
    kind: "success" | "error";
  }>();
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
      setNoticeContext({ owner: "commission", kind: "success" });
      client.invalidateQueries({ queryKey: ["platform-commission"] });
      client.invalidateQueries({ queryKey: ["admin-wallet"] });
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : t("requestFailed"));
      setNoticeContext({ owner: "commission", kind: "error" });
    },
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
      setNoticeContext({ owner: "tax", kind: "success" });
      client.invalidateQueries({ queryKey: ["sales-tax"] });
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : t("requestFailed"));
      setNoticeContext({ owner: "tax", kind: "error" });
    },
  });

  return (
    <section
      className={styles.workspace}
      aria-labelledby="finance-settings-title"
    >
      <header className={styles.header}>
        <BadgePercent size={20} strokeWidth={2} aria-hidden="true" />
        <h2 id="finance-settings-title" className={styles.title}>
          {t("financeSettings")}
        </h2>
      </header>
      <div className={styles.panel}>
        <form
          className={styles.setting}
          aria-labelledby="commission-heading"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid || save.isPending) return;
            if (!window.confirm(t("commissionConfirm"))) return;
            save.mutate(value);
          }}
        >
          <div className={styles.context}>
            <h3 id="commission-heading" className={styles.settingTitle}>
              {t("commissionTitle")}
            </h3>
            <p className={styles.description}>{t("commissionDescription")}</p>
            <dl className={styles.current}>
              <dt>{t("currentServerValue")}</dt>
              <dd>
                <bdi>
                  {commission.data === undefined
                    ? "—"
                    : formatLocalizedPercentage(
                        commission.data.platformCommissionPercent,
                        locale,
                      )}
                </bdi>
              </dd>
            </dl>
            {commission.isPending && commission.data === undefined ? (
              <QueryState kind="loading" title={t("commissionLoading")} />
            ) : null}
            {commission.isError ? (
              <QueryState kind="error" title={t("commissionUnavailable")} />
            ) : null}
          </div>
          <div className={styles.editor}>
            <p className={styles.draftLabel}>
              {t(draft === undefined ? "currentServerValue" : "localDraft")}
            </p>
            <label className={styles.field} htmlFor="commission-percent">
              {t("platformCommission")}
            </label>
            <input
              id="commission-percent"
              required
              type="number"
              min="0"
              max="100"
              step="0.001"
              value={displayed}
              onChange={(event) => setDraft(event.target.value)}
              className={styles.input}
              dir="ltr"
              aria-describedby="commission-hint"
              aria-invalid={!valid || undefined}
            />
            {!valid ? (
              <p className={styles.invalid}>{t("invalidPercentage")}</p>
            ) : null}
            <div className={styles.preview}>
              <p className={styles.draftLabel}>{t("derivedPreview")}</p>
              <p>
                {t("teacherShare", {
                  percentage:
                    commission.data === undefined && draft === undefined
                      ? "—"
                      : teacherShare === undefined
                        ? "—"
                        : formatLocalizedPercentage(teacherShare, locale, {
                            minimumFractionDigits: 3,
                            maximumFractionDigits: 3,
                          }),
                })}
              </p>
              <p className={styles.previewHint}>{t("previewHint")}</p>
            </div>
            <p id="commission-hint" className={styles.hint}>
              {t("confirmationRequired")}
            </p>
            <button
              type="submit"
              disabled={!valid || save.isPending || commission.isPending}
              className={styles.save}
              aria-busy={save.isPending}
            >
              <Save size={16} strokeWidth={2} aria-hidden="true" />
              {save.isPending ? t("saving") : t("commissionSave")}
            </button>
            {notice && noticeContext?.owner === "commission" ? (
              <MutationOutcome kind={noticeContext.kind}>
                {notice}
              </MutationOutcome>
            ) : null}
          </div>
        </form>
        <form
          className={styles.setting}
          aria-labelledby="tax-heading"
          onSubmit={(event) => {
            event.preventDefault();
            if (!taxIsValid || saveTax.isPending) return;
            if (!window.confirm(t("taxConfirm"))) return;
            saveTax.mutate(taxValue);
          }}
        >
          <div className={styles.context}>
            <h3 id="tax-heading" className={styles.settingTitle}>
              {t("salesTax")}
            </h3>
            <p className={styles.description}>{t("salesTaxDescription")}</p>
            <dl className={styles.current}>
              <dt>{t("currentServerValue")}</dt>
              <dd>
                <bdi>
                  {salesTax.data === undefined
                    ? "—"
                    : formatLocalizedPercentage(
                        salesTax.data.salesTaxPercent,
                        locale,
                      )}
                </bdi>
              </dd>
            </dl>
            {salesTax.isPending && salesTax.data === undefined ? (
              <QueryState kind="loading" title={t("taxLoading")} />
            ) : null}
            {salesTax.isError ? (
              <QueryState kind="error" title={t("taxUnavailable")} />
            ) : null}
          </div>
          <div className={styles.editor}>
            <p className={styles.draftLabel}>
              {t(taxDraft === undefined ? "currentServerValue" : "localDraft")}
            </p>
            <label className={styles.field} htmlFor="sales-tax-percent">
              {t("salesTax")}
            </label>
            <input
              id="sales-tax-percent"
              required
              type="number"
              min="0"
              max="100"
              step="0.001"
              value={displayedTax}
              onChange={(event) => setTaxDraft(event.target.value)}
              className={styles.input}
              dir="ltr"
              aria-describedby="tax-hint"
              aria-invalid={!taxIsValid || undefined}
            />
            {!taxIsValid ? (
              <p className={styles.invalid}>{t("invalidPercentage")}</p>
            ) : null}
            <p id="tax-hint" className={styles.hint}>
              {t("confirmationRequired")}
            </p>
            <button
              type="submit"
              disabled={!taxIsValid || saveTax.isPending || salesTax.isPending}
              className={styles.save}
              aria-busy={saveTax.isPending}
            >
              <Save size={16} strokeWidth={2} aria-hidden="true" />
              {saveTax.isPending ? t("saving") : t("salesTaxSave")}
            </button>
            {notice && noticeContext?.owner === "tax" ? (
              <MutationOutcome kind={noticeContext.kind}>
                {notice}
              </MutationOutcome>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
