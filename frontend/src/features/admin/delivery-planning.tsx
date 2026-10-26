"use client";

import { MutationOutcome, QueryState } from "@/components/ui/query-state";
import { ArrowDown, ArrowUp, Check } from "lucide-react";
import styles from "./delivery-planning.module.css";

import { api, ApiError } from "@/lib/api";
import { academicText, academicUnitLabel } from "@/lib/academic-localization";
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
  specializationId?: string;
  specializationEnglishName?: string;
  specializationArabicName?: string;
  qualificationEnglishName?: string;
  qualificationArabicName?: string;
};
type Grade = {
  id: string;
  learningTrackId: string;
  arabicName: string;
  englishName: string;
  isVisible: boolean;
};
type Specialization = {
  id: string;
  learningTrackId: string;
  isVisible: boolean;
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
  gradeId?: string;
  gradeEnglishName?: string;
  gradeArabicName?: string;
  specializationEnglishName?: string;
  specializationArabicName?: string;
  qualificationEnglishName?: string;
  qualificationArabicName?: string;
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
  const [gradeId, setGradeId] = useState("");
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
  const grades = useQuery({
    queryKey: ["academic-taxonomy-grades"],
    queryFn: async () => {
      const value = await api<Grade[]>("/admin/academic-taxonomy/grades");
      return Array.isArray(value) ? value : [];
    },
  });
  const specializations = useQuery({
    queryKey: ["academic-taxonomy-specializations"],
    queryFn: async () => {
      const value = await api<Specialization[]>(
        "/admin/academic-taxonomy/specializations",
      );
      return Array.isArray(value) ? value : [];
    },
  });
  const selectedVersion = versions.data?.items.find(
    (item) => item.id === versionId,
  );
  const selectedSpecialization = specializations.data?.find(
    (item) => item.id === selectedVersion?.specializationId,
  );
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
          gradeId,
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
  const operationError = (failedError: unknown) => {
    const errorCode =
      failedError instanceof ApiError ? failedError.code : undefined;
    return errorCode === "InvalidCode"
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
  };
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

  const retryAction = (
    <button
      className={styles.secondary}
      onClick={() => {
        void years.refetch();
        void versions.refetch();
      }}
    >
      {t("retry")}
    </button>
  );
  if (
    (years.isPending && years.data === undefined) ||
    (versions.isPending && versions.data === undefined)
  )
    return (
      <section className={`shell py-10 ${styles.workspace}`}>
        <p role="status" aria-busy="true" className={styles.state}>
          {t("loading")}
        </p>
      </section>
    );
  if (
    (years.isError && years.data === undefined) ||
    (versions.isError && versions.data === undefined)
  )
    return (
      <section className={`shell py-10 ${styles.workspace}`}>
        <QueryState kind="error" title={t("loadError")} action={retryAction} />
      </section>
    );

  return (
    <section
      className={`shell py-8 sm:py-10 ${styles.workspace}`}
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <header className={styles.header}>
        <p className={styles.eyebrow}>{t("eyebrow")}</p>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.description}>{t("description")}</p>
        <p className={styles.context}>
          {currentYearId
            ? t("yearContext", {
                year:
                  years.data?.items.find((item) => item.id === currentYearId)
                    ?.code ?? "",
              })
            : t("chooseYearContext")}
        </p>
        {(years.isError || versions.isError) && (
          <QueryState
            kind="error"
            title={t("loadError")}
            action={retryAction}
          />
        )}
      </header>
      <div className={styles.layout}>
        <aside
          className={styles.yearPanel}
          aria-labelledby="delivery-years-title"
        >
          <div className={styles.panelHeader}>
            <h2 id="delivery-years-title" className={styles.sectionTitle}>
              {t("academicYears")}
            </h2>
            <p className={styles.hint}>{t("yearScope")}</p>
          </div>
          {years.data?.items.length === 0 && !years.isError ? (
            <QueryState kind="empty" title={t("noYears")} />
          ) : null}
          <ul className={styles.yearRows}>
            {years.data?.items.map((item) => (
              <li
                key={item.id}
                className={styles.yearRow}
                data-selected={currentYearId === item.id}
              >
                <button
                  type="button"
                  className={styles.yearSelect}
                  aria-pressed={currentYearId === item.id}
                  onClick={() => {
                    setSelectedYearId(item.id);
                    setSelectedPlanId("");
                    setEntryTermId("");
                  }}
                >
                  <strong className={styles.itemTitle}>{item.code}</strong>
                  <span className={styles.date} dir="ltr">
                    {item.startDate} — {item.endDate}
                  </span>
                  <span className={styles.chip} data-active={item.isActive}>
                    {item.isActive ? t("active") : t("inactive")}
                  </span>
                  {currentYearId === item.id && (
                    <span className={styles.selected}>
                      <Check size={16} aria-hidden="true" />
                      {t("selectedYear")}
                    </span>
                  )}
                </button>
                <div className={styles.rowFooter}>
                  {yearId === item.id && (
                    <span className={styles.hint}>{t("editing")}</span>
                  )}
                  <button
                    type="button"
                    className={styles.textButton}
                    aria-label={t("editYearLabel", { year: item.code })}
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
                </div>
              </li>
            ))}
          </ul>
          <div className={styles.editor}>
            <p className={styles.hint}>{t("yearDraftHint")}</p>
            <form
              className={styles.form}
              onSubmit={submitYear}
              aria-label={t("yearWorkbench")}
            >
              <h3 className={styles.itemTitle}>
                {yearId ? t("editYear") : t("newYear")}
              </h3>
              <div className={styles.fields}>
                <Field label={t("code")}>
                  <input
                    required
                    minLength={2}
                    maxLength={64}
                    className={styles.control}
                    value={yearForm.code}
                    onChange={(e) =>
                      setYearForm({ ...yearForm, code: e.target.value })
                    }
                  />
                </Field>
                <Field label={t("status")}>
                  <select
                    className={styles.control}
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
                    className={styles.control}
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
                    className={styles.control}
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
              <OperationFeedback
                state={saveYear}
                message={operationError(saveYear.error)}
              />
            </form>
          </div>
        </aside>

        <div className={styles.main}>
          {currentYearId && (
            <section
              className={styles.panel}
              aria-labelledby="delivery-terms-title"
            >
              <div className={styles.panelHeader}>
                <h2 id="delivery-terms-title" className={styles.sectionTitle}>
                  {t("terms")}
                </h2>
                <p className={styles.hint}>
                  {t("termContext", {
                    year:
                      years.data?.items.find(
                        (item) => item.id === currentYearId,
                      )?.code ?? "",
                  })}
                </p>
              </div>
              <div className={styles.termLayout}>
                <div className={styles.termList}>
                  {terms.isPending && terms.data === undefined ? (
                    <QueryState kind="loading" title={t("loadingTerms")} />
                  ) : null}
                  {terms.isError ? (
                    <QueryState kind="error" title={t("termsError")} />
                  ) : null}
                  {terms.data?.items.length === 0 && !terms.isError ? (
                    <QueryState kind="empty" title={t("noTerms")} />
                  ) : null}
                  <ul className={styles.rows}>
                    {terms.data?.items.map((item) => (
                      <li key={item.id} className={styles.termRow}>
                        <div className={styles.rowHeading}>
                          <strong className={styles.itemTitle}>
                            {item.sortOrder}. {item.code}
                          </strong>
                          <span
                            className={styles.chip}
                            data-active={item.isActive}
                          >
                            {item.isActive ? t("active") : t("inactive")}
                          </span>
                        </div>
                        <p className={styles.date} dir="ltr">
                          {item.startDate} — {item.endDate}
                        </p>
                        <div className={styles.rowFooter}>
                          {termId === item.id && (
                            <span className={styles.hint}>{t("editing")}</span>
                          )}
                          <button
                            type="button"
                            className={styles.textButton}
                            aria-label={t("editTermLabel", { term: item.code })}
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
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={styles.termEditor}>
                  <form
                    className={styles.form}
                    onSubmit={submitTerm}
                    aria-label={t("termWorkbench")}
                  >
                    <h3 className={styles.itemTitle}>
                      {termId ? t("editTerm") : t("newTerm")}
                    </h3>
                    <div className={styles.fields}>
                      <Field label={t("code")}>
                        <input
                          required
                          minLength={2}
                          maxLength={64}
                          className={styles.control}
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
                          className={styles.control}
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
                          className={styles.control}
                          value={termForm.startDate}
                          onChange={(e) =>
                            setTermForm({
                              ...termForm,
                              startDate: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label={t("endDate")}>
                        <input
                          required
                          type="date"
                          className={styles.control}
                          value={termForm.endDate}
                          onChange={(e) =>
                            setTermForm({
                              ...termForm,
                              endDate: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <label className={styles.checkbox}>
                        <input
                          type="checkbox"
                          checked={termForm.isActive}
                          onChange={(e) =>
                            setTermForm({
                              ...termForm,
                              isActive: e.target.checked,
                            })
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
                    <OperationFeedback
                      state={saveTerm}
                      message={operationError(saveTerm.error)}
                    />
                  </form>
                </div>
              </div>
            </section>
          )}

          {currentYearId && (
            <section
              className={styles.panel}
              aria-labelledby="delivery-plans-title"
            >
              <div className={styles.panelHeader}>
                <h2 id="delivery-plans-title" className={styles.sectionTitle}>
                  {t("deliveryPlans")}
                </h2>
                <p className={styles.hint}>{t("planScope")}</p>
              </div>
              <section
                className={styles.planCreate}
                aria-label={t("planWorkbench")}
              >
                <h3 className={styles.itemTitle}>{t("createPlan")}</h3>
                <p className={styles.hint}>{t("planDraftHint")}</p>
                <div className={styles.createFields}>
                  <Field label={t("qualificationVersion")}>
                    <select
                      className={styles.control}
                      value={versionId}
                      onChange={(e) => {
                        setVersionId(e.target.value);
                        setGradeId("");
                      }}
                    >
                      <option value="">{t("chooseVersion")}</option>
                      {versions.data?.items
                        .filter(
                          (item) =>
                            item.isActive && Boolean(item.specializationId),
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.qualificationCode} ·{" "}
                            {academicText(
                              locale,
                              item.qualificationArabicName,
                              item.qualificationEnglishName,
                            ) || item.qualificationCode}{" "}
                            · {item.versionCode}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label={t("residualgrade")}>
                    <select
                      className={styles.control}
                      value={gradeId}
                      onChange={(event) => setGradeId(event.target.value)}
                    >
                      <option value="">{t("residualchooseGrade")}</option>
                      {grades.data
                        ?.filter(
                          (item) =>
                            item.isVisible &&
                            item.learningTrackId ===
                              selectedSpecialization?.learningTrackId,
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {academicText(
                              locale,
                              item.arabicName,
                              item.englishName,
                            )}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <p className={styles.derived}>
                    {t("residualspecialization")}
                    {academicText(
                      locale,
                      selectedVersion?.specializationArabicName,
                      selectedVersion?.specializationEnglishName,
                    )}
                  </p>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={
                      !versionId ||
                      !gradeId ||
                      !currentYearId ||
                      isSaving ||
                      Boolean(
                        plans.data?.items.some(
                          (item) =>
                            item.qualificationVersionId === versionId &&
                            item.gradeId === gradeId,
                        ),
                      )
                    }
                    onClick={() => createPlan.mutate()}
                  >
                    {isSaving ? t("saving") : t("createPlan")}
                  </button>
                </div>
                <p className={styles.hint}>{t("derivedSpecialization")}</p>
                {grades.isPending || specializations.isPending ? (
                  <QueryState kind="loading" title={t("loadingTaxonomy")} />
                ) : null}
                {grades.isError ? (
                  <QueryState kind="error" title={t("gradesError")} />
                ) : null}
                {specializations.isError ? (
                  <QueryState kind="error" title={t("specializationsError")} />
                ) : null}
                {Boolean(
                  plans.data?.items.some(
                    (item) =>
                      item.qualificationVersionId === versionId &&
                      item.gradeId === gradeId,
                  ),
                ) && <p className={styles.hint}>{t("loadedDuplicate")}</p>}
                <OperationFeedback
                  state={createPlan}
                  message={operationError(createPlan.error)}
                />
              </section>
              <div className={styles.planRegister}>
                {plans.isPending && plans.data === undefined ? (
                  <QueryState kind="loading" title={t("loadingPlans")} />
                ) : null}
                {plans.isError ? (
                  <QueryState kind="error" title={t("plansError")} />
                ) : null}
                {plans.data ? (
                  <p className={styles.hint}>
                    {t("planTotal", { count: plans.data.totalCount })}
                  </p>
                ) : null}
                {plans.data?.items.length === 0 && !plans.isError ? (
                  <QueryState kind="empty" title={t("noPlans")} />
                ) : null}
                <ul className={styles.rows}>
                  {plans.data?.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={styles.planRow}
                        onClick={() => setSelectedPlanId(item.id)}
                        aria-pressed={currentPlanId === item.id}
                      >
                        <span className={styles.itemTitle}>
                          {academicText(
                            locale,
                            item.qualificationArabicName,
                            item.qualificationEnglishName,
                          ) || item.qualificationCode}{" "}
                          · {item.qualificationVersionCode} ·{" "}
                          {academicText(
                            locale,
                            item.gradeArabicName,
                            item.gradeEnglishName,
                          )}
                        </span>
                        <span className={styles.rowMetadata}>
                          <span>
                            {t("entryCount", { count: item.entryCount })}
                          </span>
                          <span
                            className={styles.chip}
                            data-active={item.isActive}
                          >
                            {item.isActive ? t("active") : t("inactive")}
                          </span>
                          {currentPlanId === item.id && (
                            <span className={styles.selected}>
                              <Check size={16} aria-hidden="true" />
                              {t("selectedPlan")}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          <section
            className={styles.panel}
            aria-label={t("selectedPlanWorkspace")}
          >
            <div className={styles.panelHeader}>
              <h2 className={styles.sectionTitle}>
                {t("selectedPlanWorkspace")}
              </h2>
            </div>
            {!currentPlanId && (
              <p className={styles.description}>{t("choosePlanContext")}</p>
            )}
            {currentPlanId && plan.isPending && plan.data === undefined ? (
              <QueryState kind="loading" title={t("loadingPlan")} />
            ) : null}
            {currentPlanId && plan.isError ? (
              <QueryState kind="error" title={t("planError")} />
            ) : null}
            {currentPlanId && !plan.isPending && !plan.isError && !plan.data ? (
              <QueryState kind="empty" title={t("noSelectedPlan")} />
            ) : null}
            {plan.data && (
              <div className={styles.planWorkspace}>
                <div className={styles.selectedHeader}>
                  <div>
                    <h3 className={styles.itemTitle}>
                      {academicText(
                        locale,
                        plan.data.plan.qualificationArabicName,
                        plan.data.plan.qualificationEnglishName,
                      ) || plan.data.plan.qualificationCode}{" "}
                      · {plan.data.plan.qualificationVersionCode} ·{" "}
                      {plan.data.plan.academicYearCode}
                    </h3>
                    <p className={styles.hint}>
                      {plan.data.plan.isActive
                        ? t("editable")
                        : t("inactivePlan")}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={isSaving}
                    onClick={() => updatePlan.mutate(!plan.data.plan.isActive)}
                  >
                    {plan.data.plan.isActive ? t("deactivate") : t("activate")}
                  </button>
                </div>

                <p className={styles.hint}>
                  {t("planGrade", {
                    grade:
                      academicText(
                        locale,
                        plan.data.plan.gradeArabicName,
                        plan.data.plan.gradeEnglishName,
                      ) || "—",
                  })}
                </p>
                <OperationFeedback
                  state={updatePlan}
                  message={operationError(updatePlan.error)}
                />
                <section
                  className={styles.unitAdd}
                  aria-label={t("unitWorkbench")}
                >
                  <h3 className={styles.itemTitle}>{t("unitWorkbench")}</h3>
                  <p className={styles.hint}>{t("unitDraftHint")}</p>
                  {plan.data.plan.isActive &&
                  units.isPending &&
                  units.data === undefined ? (
                    <QueryState kind="loading" title={t("loadingUnits")} />
                  ) : null}
                  {plan.data.plan.isActive && units.isError ? (
                    <QueryState kind="error" title={t("unitsError")} />
                  ) : null}
                  {plan.data.plan.isActive && (
                    <div className={styles.unitFields}>
                      <Field label={t("canonicalUnit")}>
                        <select
                          className={styles.control}
                          value={unitId}
                          onChange={(e) => setUnitId(e.target.value)}
                        >
                          <option value="">{t("chooseUnit")}</option>
                          {availableUnits.map((item) => (
                            <option key={item.id} value={item.id}>
                              {academicUnitLabel(
                                locale,
                                item.code,
                                item.arabicTitle,
                                item.englishTitle,
                              )}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t("term")}>
                        <select
                          className={styles.control}
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
                        className={styles.primary}
                        disabled={!unitId || !currentEntryTermId || isSaving}
                        onClick={() => addEntry.mutate()}
                      >
                        {t("addUnit")}
                      </button>
                    </div>
                  )}

                  <OperationFeedback
                    state={addEntry}
                    message={operationError(addEntry.error)}
                  />
                </section>
                <section
                  className={styles.sequence}
                  aria-label={t("unitSequence")}
                >
                  <h3 className={styles.sectionTitle}>{t("unitSequence")}</h3>
                  <p className={styles.hint}>{t("sequenceHint")}</p>
                  <OperationFeedback
                    state={updateEntry}
                    message={operationError(updateEntry.error)}
                  />
                  <OperationFeedback
                    state={reorder}
                    message={operationError(reorder.error)}
                  />
                  <OperationFeedback
                    state={removeEntry}
                    message={operationError(removeEntry.error)}
                  />
                  {plan.data.entries.length === 0 ? (
                    <p className={styles.description}>{t("noEntries")}</p>
                  ) : (
                    <ol className={styles.entries}>
                      {plan.data.entries.map((entry, index) => (
                        <li key={entry.id} className={styles.entry}>
                          <div className={styles.entryLayout}>
                            <div className={styles.entryIdentity}>
                              <strong className={styles.itemTitle}>
                                {index + 1}.{" "}
                                {academicUnitLabel(
                                  locale,
                                  entry.unitCode,
                                  entry.unitArabicTitle,
                                  entry.unitEnglishTitle,
                                )}
                              </strong>
                              <p className={styles.assignedTerm}>
                                {t("assignedTerm", { term: entry.termCode })}
                              </p>
                            </div>
                            <label
                              className={styles.field}
                              hidden={!plan.data.plan.isActive}
                            >
                              <span>{t("term")}</span>
                              <select
                                className={styles.control}
                                value={entry.academicTermId}
                                hidden={!plan.data.plan.isActive}
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
                            <div className={styles.entryActions}>
                              <button
                                type="button"
                                className={styles.secondary}
                                aria-label={t("moveUp", {
                                  unit: entry.unitCode,
                                })}
                                disabled={
                                  !plan.data.plan.isActive ||
                                  index === 0 ||
                                  isSaving
                                }
                                onClick={() => move(index, -1)}
                              >
                                <ArrowUp size={18} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className={styles.secondary}
                                aria-label={t("moveDown", {
                                  unit: entry.unitCode,
                                })}
                                disabled={
                                  !plan.data.plan.isActive ||
                                  index === plan.data.entries.length - 1 ||
                                  isSaving
                                }
                                onClick={() => move(index, 1)}
                              >
                                <ArrowDown size={18} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className={styles.remove}
                                disabled={!plan.data.plan.isActive || isSaving}
                                onClick={() => removeEntry.mutate(entry.id)}
                              >
                                {t("removeFromPlan")}
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
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
    <div className={styles.formActions}>
      <button type="submit" className={styles.primary} disabled={saving}>
        {saving ? t("saving") : editing ? t("update") : t("create")}
      </button>
      {editing && (
        <button
          type="button"
          className={styles.secondary}
          disabled={saving}
          onClick={cancel}
        >
          {t("cancel")}
        </button>
      )}
    </div>
  );
}

function OperationFeedback({
  state,
  message,
}: {
  state: { isPending: boolean; isError: boolean; isSuccess: boolean };
  message: string;
}) {
  const t = useTranslations("deliveryPlanning");
  return (
    <div className={styles.feedback}>
      {state.isPending ? (
        <QueryState kind="loading" title={t("saving")} />
      ) : null}
      {state.isError ? (
        <MutationOutcome kind="error">{message}</MutationOutcome>
      ) : null}
      {state.isSuccess && !state.isError && !state.isPending ? (
        <MutationOutcome kind="success">{t("saved")}</MutationOutcome>
      ) : null}
    </div>
  );
}
