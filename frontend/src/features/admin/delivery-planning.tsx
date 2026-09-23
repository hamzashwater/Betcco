"use client";

import { api, ApiError } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";

type Paged<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
};
type AcademicYear = {
  id: string;
  code: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};
type AcademicTerm = AcademicYear & {
  academicYearId: string;
  sortOrder: number;
};
type Version = {
  id: string;
  qualificationCode: string;
  versionCode: string;
  isActive: boolean;
};
type Unit = {
  id: string;
  code: string;
  arabicTitle: string;
  englishTitle: string;
  isActive: boolean;
};
type PlanSummary = {
  id: string;
  qualificationVersionId: string;
  qualificationCode: string;
  qualificationVersionCode: string;
  academicYearId: string;
  academicYearCode: string;
  isActive: boolean;
  entryCount: number;
};
type PlanEntry = {
  id: string;
  unitDefinitionId: string;
  unitCode: string;
  unitArabicTitle: string;
  unitEnglishTitle: string;
  academicTermId: string;
  termCode: string;
  sortOrder: number;
};
type Plan = { plan: PlanSummary; entries: PlanEntry[] };

const emptyYear = { code: "", startDate: "", endDate: "", isActive: true };
const emptyTerm = {
  code: "",
  startDate: "",
  endDate: "",
  sortOrder: 10,
  isActive: true,
};

export function DeliveryPlanning() {
  const t = useTranslations("deliveryPlanning");
  const locale = useLocale();
  const client = useQueryClient();
  const [selectedYearId, setSelectedYearId] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [yearId, setYearId] = useState<string | null>(null);
  const [termId, setTermId] = useState<string | null>(null);
  const [yearForm, setYearForm] = useState(emptyYear);
  const [termForm, setTermForm] = useState(emptyTerm);
  const [versionId, setVersionId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [entryTermId, setEntryTermId] = useState("");

  const years = useQuery({
    queryKey: ["delivery-planning-years"],
    queryFn: () =>
      api<Paged<AcademicYear>>(
        "/admin/delivery-planning/academic-years?pageSize=100",
      ),
  });
  const versions = useQuery({
    queryKey: ["delivery-planning-versions"],
    queryFn: () =>
      api<Paged<Version>>(
        "/admin/delivery-planning/qualification-versions?pageSize=100",
      ),
  });
  const currentYearId = years.data?.items.some(
    (item) => item.id === selectedYearId,
  )
    ? selectedYearId
    : (years.data?.items[0]?.id ?? "");
  const terms = useQuery({
    queryKey: ["delivery-planning-terms", currentYearId],
    queryFn: () =>
      api<Paged<AcademicTerm>>(
        `/admin/delivery-planning/academic-years/${currentYearId}/terms?pageSize=100`,
      ),
    enabled: Boolean(currentYearId),
  });
  const plans = useQuery({
    queryKey: ["delivery-planning-plans", currentYearId],
    queryFn: () =>
      api<Paged<PlanSummary>>(
        `/admin/delivery-planning/plans?academicYearId=${currentYearId}&pageSize=100`,
      ),
    enabled: Boolean(currentYearId),
  });
  const currentPlanId = plans.data?.items.some(
    (item) => item.id === selectedPlanId,
  )
    ? selectedPlanId
    : (plans.data?.items[0]?.id ?? "");
  const plan = useQuery({
    queryKey: ["delivery-planning-plan", currentPlanId],
    queryFn: () => api<Plan>(`/admin/delivery-planning/plans/${currentPlanId}`),
    enabled: Boolean(currentPlanId),
  });
  const planVersionId = plan.data?.plan.qualificationVersionId ?? "";
  const units = useQuery({
    queryKey: ["delivery-planning-units", planVersionId],
    queryFn: () =>
      api<Paged<Unit>>(
        `/admin/delivery-planning/qualification-versions/${planVersionId}/units?pageSize=100`,
      ),
    enabled: Boolean(planVersionId),
  });

  const currentEntryTermId = terms.data?.items.some(
    (item) => item.id === entryTermId && item.isActive,
  )
    ? entryTermId
    : (terms.data?.items.find((item) => item.isActive)?.id ?? "");

  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["delivery-planning-years"] }),
      client.invalidateQueries({ queryKey: ["delivery-planning-terms"] }),
      client.invalidateQueries({ queryKey: ["delivery-planning-plans"] }),
      client.invalidateQueries({ queryKey: ["delivery-planning-plan"] }),
    ]);
  };
  const saveYear = useMutation({
    mutationFn: () =>
      api<AcademicYear>(
        yearId
          ? `/admin/delivery-planning/academic-years/${yearId}`
          : "/admin/delivery-planning/academic-years",
        {
          method: yearId ? "PUT" : "POST",
          body: JSON.stringify(yearForm),
        },
      ),
    onSuccess: async (saved) => {
      setSelectedYearId(saved.id);
      setYearId(null);
      setYearForm(emptyYear);
      await invalidate();
    },
  });
  const saveTerm = useMutation({
    mutationFn: () =>
      api<AcademicTerm>(
        termId
          ? `/admin/delivery-planning/terms/${termId}`
          : "/admin/delivery-planning/terms",
        {
          method: termId ? "PUT" : "POST",
          body: JSON.stringify({ ...termForm, academicYearId: currentYearId }),
        },
      ),
    onSuccess: async () => {
      setTermId(null);
      setTermForm(emptyTerm);
      await invalidate();
    },
  });
  const createPlan = useMutation({
    mutationFn: () =>
      api<Plan>("/admin/delivery-planning/plans", {
        method: "POST",
        body: JSON.stringify({
          qualificationVersionId: versionId,
          academicYearId: currentYearId,
        }),
      }),
    onSuccess: async (saved) => {
      setSelectedPlanId(saved.plan.id);
      await invalidate();
    },
  });
  const updatePlan = useMutation({
    mutationFn: (isActive: boolean) =>
      api<Plan>(`/admin/delivery-planning/plans/${currentPlanId}`, {
        method: "PUT",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: invalidate,
  });
  const addEntry = useMutation({
    mutationFn: () =>
      api<Plan>(`/admin/delivery-planning/plans/${currentPlanId}/entries`, {
        method: "POST",
        body: JSON.stringify({
          unitDefinitionId: unitId,
          academicTermId: currentEntryTermId,
        }),
      }),
    onSuccess: async () => {
      setUnitId("");
      await invalidate();
    },
  });
  const updateEntry = useMutation({
    mutationFn: ({
      id,
      academicTermId,
    }: {
      id: string;
      academicTermId: string;
    }) =>
      api<Plan>(`/admin/delivery-planning/entries/${id}`, {
        method: "PUT",
        body: JSON.stringify({ academicTermId }),
      }),
    onSuccess: invalidate,
  });
  const reorder = useMutation({
    mutationFn: (entryIds: string[]) =>
      api<Plan>(`/admin/delivery-planning/plans/${currentPlanId}/entry-order`, {
        method: "PUT",
        body: JSON.stringify({ entryIds }),
      }),
    onSuccess: invalidate,
  });
  const removeEntry = useMutation({
    mutationFn: (id: string) =>
      api<Plan>(`/admin/delivery-planning/entries/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const mutations = [
    saveYear,
    saveTerm,
    createPlan,
    updatePlan,
    addEntry,
    updateEntry,
    reorder,
    removeEntry,
  ];
  const isSaving = mutations.some((mutation) => mutation.isPending);
  const hasError = mutations.some((mutation) => mutation.isError);
  const hasSuccess = mutations.some((mutation) => mutation.isSuccess);
  const failedError = mutations.find((mutation) => mutation.isError)?.error;
  const errorCode =
    failedError instanceof ApiError ? failedError.code : undefined;
  const errorMessage =
    errorCode === "InvalidCode"
      ? t("errors.invalidCode")
      : errorCode === "InvalidDateRange" ||
          errorCode === "TermOutsideAcademicYear"
        ? t("errors.invalidDates")
        : errorCode === "OverlappingActiveTerm"
          ? t("errors.overlap")
          : errorCode?.startsWith("Duplicate")
            ? t("errors.duplicate")
            : errorCode?.includes("Outside") || errorCode?.includes("Immutable")
              ? t("errors.wrongAssociation")
              : errorCode?.includes("HasActive")
                ? t("errors.inUse")
                : errorCode === "DeliveryPlanNotEditable"
                  ? t("errors.inactivePlan")
                  : t("saveError");
  const availableUnits = useMemo(() => {
    const selected = new Set(
      plan.data?.entries.map((entry) => entry.unitDefinitionId),
    );
    return (
      units.data?.items.filter(
        (item) => item.isActive && !selected.has(item.id),
      ) ?? []
    );
  }, [plan.data, units.data]);

  const submitYear = (event: FormEvent) => {
    event.preventDefault();
    saveYear.mutate();
  };
  const submitTerm = (event: FormEvent) => {
    event.preventDefault();
    saveTerm.mutate();
  };
  const move = (index: number, direction: -1 | 1) => {
    if (!plan.data) return;
    const ids = plan.data.entries.map((entry) => entry.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  };

  if (years.isPending || versions.isPending)
    return (
      <section className="shell py-10">
        <p className="card p-6" aria-busy="true">
          {t("loading")}
        </p>
      </section>
    );
  if (years.isError || versions.isError)
    return (
      <section className="shell py-10">
        <div className="card p-6" role="alert">
          <p>{t("loadError")}</p>
          <button
            className="focus-ring mt-4 rounded-lg border border-primary px-4 py-2"
            onClick={() => {
              void years.refetch();
              void versions.refetch();
            }}
          >
            {t("retry")}
          </button>
        </div>
      </section>
    );

  return (
    <section
      className="shell min-w-0 py-10"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1 className="mt-2 text-3xl font-black">{t("title")}</h1>
      <p className="mt-3 max-w-3xl text-muted">{t("description")}</p>

      {hasError && (
        <p className="card mt-5 border-red-300 p-4 text-red-700" role="alert">
          {errorMessage}
        </p>
      )}
      {hasSuccess && !hasError && (
        <p className="mt-5 text-sm text-green-700" role="status">
          {t("saved")}
        </p>
      )}

      <div className="mt-8 grid min-w-0 gap-6 xl:grid-cols-2">
        <form className="card min-w-0 p-5" onSubmit={submitYear}>
          <h2 className="text-xl font-bold">
            {yearId ? t("editYear") : t("newYear")}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t("code")}>
              <input
                required
                minLength={2}
                maxLength={64}
                className="input"
                value={yearForm.code}
                onChange={(e) =>
                  setYearForm({ ...yearForm, code: e.target.value })
                }
              />
            </Field>
            <Field label={t("status")}>
              <select
                className="input"
                value={String(yearForm.isActive)}
                onChange={(e) =>
                  setYearForm({
                    ...yearForm,
                    isActive: e.target.value === "true",
                  })
                }
              >
                <option value="true">{t("active")}</option>
                <option value="false">{t("inactive")}</option>
              </select>
            </Field>
            <Field label={t("startDate")}>
              <input
                required
                type="date"
                className="input"
                value={yearForm.startDate}
                onChange={(e) =>
                  setYearForm({ ...yearForm, startDate: e.target.value })
                }
              />
            </Field>
            <Field label={t("endDate")}>
              <input
                required
                type="date"
                className="input"
                value={yearForm.endDate}
                onChange={(e) =>
                  setYearForm({ ...yearForm, endDate: e.target.value })
                }
              />
            </Field>
          </div>
          <FormActions
            editing={Boolean(yearId)}
            saving={isSaving}
            cancel={() => {
              setYearId(null);
              setYearForm(emptyYear);
            }}
          />
        </form>

        <div className="card min-w-0 p-5">
          <h2 className="text-xl font-bold">{t("academicYears")}</h2>
          {years.data.items.length === 0 ? (
            <p className="mt-4 text-muted">{t("noYears")}</p>
          ) : (
            <div className="mt-4 grid gap-2">
              {years.data.items.map((item) => (
                <div
                  key={item.id}
                  className={`min-w-0 rounded-xl border p-3 ${currentYearId === item.id ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <button
                    type="button"
                    className="focus-ring block w-full min-w-0 text-start"
                    onClick={() => {
                      setSelectedYearId(item.id);
                      setSelectedPlanId("");
                      setEntryTermId("");
                    }}
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="break-words">{item.code}</strong>
                      <span className="text-xs text-muted">
                        {item.startDate} — {item.endDate}
                      </span>
                    </span>
                  </button>
                  <span className="mt-2 flex items-center justify-between gap-2 text-sm">
                    <span>{item.isActive ? t("active") : t("inactive")}</span>
                    <button
                      type="button"
                      className="focus-ring text-primary underline"
                      onClick={() => {
                        setYearId(item.id);
                        setYearForm({
                          code: item.code,
                          startDate: item.startDate,
                          endDate: item.endDate,
                          isActive: item.isActive,
                        });
                      }}
                    >
                      {t("edit")}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {currentYearId && (
        <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-2">
          <form className="card min-w-0 p-5" onSubmit={submitTerm}>
            <h2 className="text-xl font-bold">
              {termId ? t("editTerm") : t("newTerm")}
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={t("code")}>
                <input
                  required
                  minLength={2}
                  maxLength={64}
                  className="input"
                  value={termForm.code}
                  onChange={(e) =>
                    setTermForm({ ...termForm, code: e.target.value })
                  }
                />
              </Field>
              <Field label={t("sortOrder")}>
                <input
                  required
                  type="number"
                  min={0}
                  max={10000}
                  className="input"
                  value={termForm.sortOrder}
                  onChange={(e) =>
                    setTermForm({
                      ...termForm,
                      sortOrder: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label={t("startDate")}>
                <input
                  required
                  type="date"
                  className="input"
                  value={termForm.startDate}
                  onChange={(e) =>
                    setTermForm({ ...termForm, startDate: e.target.value })
                  }
                />
              </Field>
              <Field label={t("endDate")}>
                <input
                  required
                  type="date"
                  className="input"
                  value={termForm.endDate}
                  onChange={(e) =>
                    setTermForm({ ...termForm, endDate: e.target.value })
                  }
                />
              </Field>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={termForm.isActive}
                  onChange={(e) =>
                    setTermForm({ ...termForm, isActive: e.target.checked })
                  }
                />
                {t("active")}
              </label>
            </div>
            <FormActions
              editing={Boolean(termId)}
              saving={isSaving}
              cancel={() => {
                setTermId(null);
                setTermForm(emptyTerm);
              }}
            />
          </form>
          <div className="card min-w-0 p-5">
            <h2 className="text-xl font-bold">{t("terms")}</h2>
            {terms.isPending ? (
              <p className="mt-4" aria-busy="true">
                {t("loadingTerms")}
              </p>
            ) : terms.isError ? (
              <p className="mt-4 text-red-700" role="alert">
                {t("loadError")}
              </p>
            ) : terms.data?.items.length === 0 ? (
              <p className="mt-4 text-muted">{t("noTerms")}</p>
            ) : (
              <ul className="mt-4 grid gap-2">
                {terms.data?.items.map((item) => (
                  <li
                    key={item.id}
                    className="min-w-0 rounded-xl border border-border p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong>
                        {item.sortOrder}. {item.code}
                      </strong>
                      <button
                        type="button"
                        className="focus-ring text-sm text-primary underline"
                        onClick={() => {
                          setTermId(item.id);
                          setTermForm({
                            code: item.code,
                            startDate: item.startDate,
                            endDate: item.endDate,
                            sortOrder: item.sortOrder,
                            isActive: item.isActive,
                          });
                        }}
                      >
                        {t("edit")}
                      </button>
                    </div>
                    <p className="mt-1 break-words text-sm text-muted">
                      {item.startDate} — {item.endDate} ·{" "}
                      {item.isActive ? t("active") : t("inactive")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {currentYearId && (
        <div className="card mt-6 min-w-0 p-5">
          <h2 className="text-xl font-bold">{t("deliveryPlans")}</h2>
          <div className="mt-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
            <Field label={t("qualificationVersion")}>
              <select
                className="input"
                value={versionId}
                onChange={(e) => setVersionId(e.target.value)}
              >
                <option value="">{t("chooseVersion")}</option>
                {versions.data.items
                  .filter(
                    (item) =>
                      item.isActive &&
                      !plans.data?.items.some(
                        (planItem) =>
                          planItem.qualificationVersionId === item.id,
                      ),
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.qualificationCode} · {item.versionCode}
                    </option>
                  ))}
              </select>
            </Field>
            <button
              type="button"
              className="focus-ring rounded-lg bg-primary px-4 py-3 font-bold text-white disabled:opacity-50"
              disabled={!versionId || !currentYearId || isSaving}
              onClick={() => createPlan.mutate()}
            >
              {isSaving ? t("saving") : t("createPlan")}
            </button>
          </div>
          {plans.isPending ? (
            <p className="mt-4" aria-busy="true">
              {t("loadingPlans")}
            </p>
          ) : plans.isError ? (
            <p className="mt-4 text-red-700" role="alert">
              {t("loadError")}
            </p>
          ) : plans.data?.items.length === 0 ? (
            <p className="mt-4 text-muted">{t("noPlans")}</p>
          ) : (
            <div className="mt-4 flex min-w-0 flex-wrap gap-2">
              {plans.data?.items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setSelectedPlanId(item.id)}
                  className={`focus-ring min-w-0 rounded-lg border px-3 py-2 text-sm ${currentPlanId === item.id ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <span className="break-words font-bold">
                    {item.qualificationCode} · {item.qualificationVersionCode}
                  </span>{" "}
                  <span className="text-muted">({item.entryCount})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {currentPlanId && (
        <div className="card mt-6 min-w-0 p-5">
          {plan.isPending ? (
            <p aria-busy="true">{t("loadingPlan")}</p>
          ) : plan.isError || !plan.data ? (
            <p className="text-red-700" role="alert">
              {t("loadError")}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="break-words text-xl font-bold">
                    {plan.data.plan.qualificationCode} ·{" "}
                    {plan.data.plan.qualificationVersionCode} ·{" "}
                    {plan.data.plan.academicYearCode}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {plan.data.plan.isActive
                      ? t("editable")
                      : t("inactivePlan")}
                  </p>
                </div>
                <button
                  type="button"
                  className="focus-ring rounded-lg border border-primary px-3 py-2 font-bold text-primary disabled:opacity-50"
                  disabled={isSaving}
                  onClick={() => updatePlan.mutate(!plan.data.plan.isActive)}
                >
                  {plan.data.plan.isActive ? t("deactivate") : t("activate")}
                </button>
              </div>
              {plan.data.plan.isActive && (
                <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
                  <Field label={t("canonicalUnit")}>
                    <select
                      className="input"
                      value={unitId}
                      onChange={(e) => setUnitId(e.target.value)}
                    >
                      <option value="">{t("chooseUnit")}</option>
                      {availableUnits.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} ·{" "}
                          {locale === "ar"
                            ? item.arabicTitle
                            : item.englishTitle}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("term")}>
                    <select
                      className="input"
                      value={currentEntryTermId}
                      onChange={(e) => setEntryTermId(e.target.value)}
                    >
                      <option value="">{t("chooseTerm")}</option>
                      {terms.data?.items
                        .filter((item) => item.isActive)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.code}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <button
                    type="button"
                    className="focus-ring rounded-lg bg-primary px-4 py-3 font-bold text-white disabled:opacity-50"
                    disabled={!unitId || !currentEntryTermId || isSaving}
                    onClick={() => addEntry.mutate()}
                  >
                    {t("addUnit")}
                  </button>
                </div>
              )}
              {plan.data.entries.length === 0 ? (
                <p className="mt-5 text-muted">{t("noEntries")}</p>
              ) : (
                <ol className="mt-5 grid min-w-0 gap-3">
                  {plan.data.entries.map((entry, index) => (
                    <li
                      key={entry.id}
                      className="min-w-0 rounded-xl border border-border p-4"
                    >
                      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="min-w-0 flex-1">
                          <strong className="break-words">
                            {index + 1}. {entry.unitCode} ·{" "}
                            {locale === "ar"
                              ? entry.unitArabicTitle
                              : entry.unitEnglishTitle}
                          </strong>
                        </div>
                        <label className="grid gap-1 text-sm font-semibold">
                          <span>{t("term")}</span>
                          <select
                            className="input"
                            value={entry.academicTermId}
                            disabled={!plan.data.plan.isActive || isSaving}
                            onChange={(e) =>
                              updateEntry.mutate({
                                id: entry.id,
                                academicTermId: e.target.value,
                              })
                            }
                          >
                            {terms.data?.items
                              .filter((item) => item.isActive)
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.code}
                                </option>
                              ))}
                          </select>
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="focus-ring rounded-lg border border-border px-3 py-2 disabled:opacity-40"
                            aria-label={t("moveUp", { unit: entry.unitCode })}
                            disabled={
                              !plan.data.plan.isActive ||
                              index === 0 ||
                              isSaving
                            }
                            onClick={() => move(index, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="focus-ring rounded-lg border border-border px-3 py-2 disabled:opacity-40"
                            aria-label={t("moveDown", { unit: entry.unitCode })}
                            disabled={
                              !plan.data.plan.isActive ||
                              index === plan.data.entries.length - 1 ||
                              isSaving
                            }
                            onClick={() => move(index, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="focus-ring rounded-lg border border-red-300 px-3 py-2 text-red-700 disabled:opacity-40"
                            disabled={!plan.data.plan.isActive || isSaving}
                            onClick={() => removeEntry.mutate(entry.id)}
                          >
                            {t("remove")}
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FormActions({
  editing,
  saving,
  cancel,
}: {
  editing: boolean;
  saving: boolean;
  cancel: () => void;
}) {
  const t = useTranslations("deliveryPlanning");
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <button
        type="submit"
        className="focus-ring rounded-lg bg-primary px-4 py-2 font-bold text-white disabled:opacity-50"
        disabled={saving}
      >
        {saving ? t("saving") : editing ? t("update") : t("create")}
      </button>
      {editing && (
        <button
          type="button"
          className="focus-ring rounded-lg border border-border px-4 py-2"
          disabled={saving}
          onClick={cancel}
        >
          {t("cancel")}
        </button>
      )}
    </div>
  );
}
