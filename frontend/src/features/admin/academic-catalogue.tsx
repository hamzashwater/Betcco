"use client";

import { api } from "@/lib/api";
import { academicText, academicUnitLabel } from "@/lib/academic-localization";
import { AcademicCatalogManagement } from "@/features/admin/academic-catalog-management";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import styles from "./academic-catalogue.module.css";

type Version = {
  id: string;
  qualificationCode: string;
  versionCode: string;
  isActive: boolean;
  qualificationArabicName?: string;
  qualificationEnglishName?: string;
};
type Criterion = {
  id: string;
  code: string;
  band: "Pass" | "Merit" | "Distinction";
  arabicDescription: string;
  englishDescription: string;
};
type Aim = {
  id: string;
  code: string;
  arabicTitle: string;
  englishTitle: string;
  criteria: Criterion[];
};
type Scope = {
  id: string;
  version: number;
  gradeArabicName: string;
  gradeEnglishName: string;
  specializationArabicName: string;
  specializationEnglishName: string;
  rubricArabicTitle: string;
  rubricEnglishTitle: string;
  isActive: boolean;
  validation: string[];
};
type Definition = {
  id: string;
  code: string;
  version: number;
  arabicTitle: string;
  englishTitle: string;
  sourceReference: string | null;
  isActive: boolean;
  aimIds: string[];
  criterionIds: string[];
  validation: string[];
  scopes: Scope[];
};
type Unit = {
  id: string;
  code: string;
  arabicTitle: string;
  englishTitle: string;
  isActive: boolean;
  source: string;
  arabicTitleSource?: string;
  aims: Aim[];
  definitions: Definition[];
};
type Catalogue = { version: Version; units: Unit[] };

const issueKeys: Record<string, string> = {
  Draft: "draft",
  MissingSource: "missingSource",
  MissingAims: "missingAims",
  MissingCriteria: "missingCriteria",
  InactiveQualificationVersion: "inactiveVersion",
  InvalidMapping: "invalidMapping",
  DuplicateCriterionCode: "duplicateCriterion",
  RubricMismatch: "rubricMismatch",
  RubricCriteriaMismatch: "rubricCriteriaMismatch",
};

export function AcademicCatalogue() {
  const t = useTranslations("academicCatalogue");
  const locale = useLocale();
  const client = useQueryClient();
  const [chosenVersionId, setChosenVersionId] = useState("");
  const [arabicDrafts, setArabicDrafts] = useState<Record<string, string>>({});
  const versions = useQuery({
    queryKey: ["academic-catalogue", "versions"],
    queryFn: () => api<Version[]>("/admin/academic-catalogue/versions"),
    retry: false,
  });
  const versionId = chosenVersionId || versions.data?.[0]?.id || "";
  const catalogue = useQuery({
    queryKey: ["academic-catalogue", versionId],
    queryFn: () =>
      api<Catalogue>(`/admin/academic-catalogue/versions/${versionId}`),
    enabled: Boolean(versionId),
    retry: false,
  });
  const publish = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/academic-catalogue/definitions/${id}/publish`, {
        method: "POST",
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["academic-catalogue", versionId] }),
  });
  const activate = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/academic-catalogue/scopes/${id}/activate`, {
        method: "POST",
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["academic-catalogue", versionId] }),
  });
  const unitStatus = useMutation({
    mutationFn: (unit: Unit) =>
      api(`/admin/academic-records/units/${unit.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !unit.isActive }),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["academic-catalogue", versionId] }),
  });
  const localizeUnit = useMutation({
    mutationFn: ({ id, arabicTitle }: { id: string; arabicTitle: string }) =>
      api(`/admin/academic-records/units/${id}/arabic-localization`, {
        method: "PUT",
        body: JSON.stringify({ arabicTitle }),
      }),
    onSuccess: async (_, { id }) => {
      setArabicDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      await client.invalidateQueries({
        queryKey: ["academic-catalogue", versionId],
      });
    },
  });
  const issueLabel = (issue: string) => t(issueKeys[issue] ?? "invalidMapping");
  const state = (issues: string[], active: boolean) =>
    issues.length > 0
      ? issues.map(issueLabel).join(" · ")
      : active
        ? t("ready")
        : t("draft");

  return (
    <section
      className={`shell ${styles.workspace}`}
      aria-labelledby="academic-title"
    >
      <header className={styles.header}>
        <h1 id="academic-title" className={styles.title}>
          {t("title")}
        </h1>
        <p className={styles.description}>{t("description")}</p>
      </header>
      {versions.isSuccess ? <AcademicCatalogManagement /> : null}
      <section
        className={styles.contextPanel}
        aria-label={t("qualificationVersion")}
      >
        <h2 className={styles.sectionTitle}>{t("qualificationVersion")}</h2>
        <ReadState query={versions} loading={t("loading")} />
        {versions.data !== undefined &&
          (versions.data.length === 0 ? (
            <p className={styles.empty}>{t("noVersions")}</p>
          ) : (
            <>
              <label className={styles.field} htmlFor="academic-version">
                {t("qualificationVersion")}
              </label>
              <select
                id="academic-version"
                value={versionId}
                onChange={(event) => setChosenVersionId(event.target.value)}
                className={styles.control}
              >
                {versions.data?.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.qualificationCode} ·{" "}
                    {academicText(
                      locale,
                      version.qualificationArabicName,
                      version.qualificationEnglishName,
                    ) || version.qualificationCode}{" "}
                    · {version.versionCode}
                  </option>
                ))}
              </select>
              <p className={styles.hint}>{t("versionContextHelp")}</p>
            </>
          ))}
      </section>
      <section className={styles.register} aria-label={t("unitRegister")}>
        <div className={styles.registerHeader}>
          <h2 className={styles.sectionTitle}>{t("unitRegister")}</h2>
          <p className={styles.hint}>{t("registerHelp")}</p>
        </div>
        {!versionId ? (
          <p className={styles.empty}>{t("waitingForVersion")}</p>
        ) : (
          <>
            <ReadState query={catalogue} loading={t("loadingUnits")} />
            {catalogue.data !== undefined &&
              (catalogue.data.units.length === 0 ? (
                <p className={styles.empty}>{t("noUnits")}</p>
              ) : (
                <div className={styles.units}>
                  {catalogue.data.units.map((unit, unitIndex) => {
                    const aims = new Map(unit.aims.map((aim) => [aim.id, aim]));
                    const criteria = new Map(
                      unit.aims.flatMap((aim) =>
                        aim.criteria.map(
                          (criterion) => [criterion.id, criterion] as const,
                        ),
                      ),
                    );
                    return (
                      <article key={unit.id} className={styles.unit}>
                        <details
                          open={unitIndex === 0}
                          className={styles.expander}
                        >
                          <summary>
                            <div className={styles.identity}>
                              <h2 className={styles.unitTitle}>
                                {academicUnitLabel(
                                  locale,
                                  unit.code,
                                  unit.arabicTitle,
                                  unit.englishTitle,
                                )}
                              </h2>
                              <p className={styles.meta}>
                                {unit.source === "PearsonOfficial"
                                  ? "PearsonOfficial"
                                  : unit.source === "AdminCustom"
                                    ? "AdminCustom"
                                    : "Unknown"}{" "}
                                · {catalogue.data.version.qualificationCode} /{" "}
                                {catalogue.data.version.versionCode}
                              </p>
                            </div>
                            <Badge
                              text={unit.isActive ? t("active") : t("draft")}
                              ready={unit.isActive}
                            />
                            <span className={styles.inspect}>
                              {t("inspectUnit")}
                            </span>
                          </summary>
                          <div className={styles.unitBody}>
                            <div className={styles.identityLayout}>
                              <div className={styles.identity}>
                                <p className={styles.meta}>
                                  {t("unit")} ·{" "}
                                  {catalogue.data.version.qualificationCode} /{" "}
                                  {catalogue.data.version.versionCode}
                                </p>
                                <h3 className={styles.sectionTitle}>
                                  {t("unitIdentity")}
                                </h3>
                                <p className={styles.hint} lang="en">
                                  {t("residualenglish")} {unit.englishTitle}
                                </p>
                                <p className={styles.hint} lang="ar" dir="rtl">
                                  {t("residualarabicLabel")}{" "}
                                  {academicText(
                                    "ar",
                                    unit.arabicTitle,
                                    unit.englishTitle,
                                  )}
                                </p>
                                <p className={styles.meta}>
                                  {unit.source === "PearsonOfficial"
                                    ? "PearsonOfficial"
                                    : unit.source === "AdminCustom"
                                      ? "AdminCustom"
                                      : "Unknown"}
                                </p>
                                {unit.source === "PearsonOfficial" ? (
                                  <div className={styles.localization}>
                                    <p className={styles.hint}>
                                      {t(
                                        "residualtheEnglishTitleIsPearsonsOfficialIdentityTheArabicDisplayTitleIsB",
                                      )}
                                    </p>
                                    <label className={styles.field}>
                                      {t("residualbETCCOArabicDisplayTitle")}
                                      <input
                                        dir="rtl"
                                        lang="ar"
                                        value={
                                          arabicDrafts[unit.id] ??
                                          unit.arabicTitle
                                        }
                                        onChange={(event) =>
                                          setArabicDrafts((current) => ({
                                            ...current,
                                            [unit.id]: event.target.value,
                                          }))
                                        }
                                        className={styles.control}
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      className={styles.secondary}
                                      disabled={
                                        localizeUnit.isPending ||
                                        !arabicDrafts[unit.id]?.trim() ||
                                        arabicDrafts[unit.id]?.trim() ===
                                          unit.arabicTitle
                                      }
                                      onClick={() =>
                                        localizeUnit.mutate({
                                          id: unit.id,
                                          arabicTitle: arabicDrafts[unit.id],
                                        })
                                      }
                                    >
                                      {t("residualsaveArabicDisplayTitle")}
                                    </button>
                                    {localizeUnit.variables?.id === unit.id && (
                                      <OperationFeedback
                                        mutation={localizeUnit}
                                        label={t(
                                          "residualsaveArabicDisplayTitle",
                                        )}
                                      />
                                    )}
                                  </div>
                                ) : null}
                              </div>
                              <div className={styles.actions}>
                                <Badge
                                  text={
                                    unit.isActive ? t("active") : t("draft")
                                  }
                                  ready={unit.isActive}
                                />
                                <button
                                  type="button"
                                  disabled={unitStatus.isPending}
                                  className={styles.secondary}
                                  onClick={() => unitStatus.mutate(unit)}
                                >
                                  {unit.isActive
                                    ? t("residualarchive")
                                    : t("residualactivate")}
                                </button>
                                {unitStatus.variables?.id === unit.id && (
                                  <OperationFeedback
                                    mutation={unitStatus}
                                    label={t("unitStatus")}
                                  />
                                )}
                              </div>
                            </div>
                            <div className={styles.detailLayout}>
                              <div className={styles.workingSection}>
                                <h3 className={styles.sectionTitle}>
                                  {t("learningAims")}
                                </h3>
                                {unit.aims.length === 0 ? (
                                  <p className={styles.empty}>{t("noAims")}</p>
                                ) : (
                                  <div className={styles.rows}>
                                    {unit.aims.map((aim) => (
                                      <div
                                        key={aim.id}
                                        className={styles.record}
                                      >
                                        <h4 className={styles.itemTitle}>
                                          <span dir="ltr">{aim.code}</span> ·{" "}
                                          {academicText(
                                            locale,
                                            aim.arabicTitle,
                                            aim.englishTitle,
                                          )}
                                        </h4>
                                        {aim.criteria.length === 0 ? (
                                          <p className={styles.empty}>
                                            {t("noCriteria")}
                                          </p>
                                        ) : (
                                          <ul className={styles.criteria}>
                                            {aim.criteria.map((criterion) => (
                                              <li
                                                key={criterion.id}
                                                className={styles.criterion}
                                              >
                                                <div
                                                  className={styles.rowHeading}
                                                >
                                                  <span dir="ltr">
                                                    {criterion.code}
                                                  </span>
                                                  <span className={styles.band}>
                                                    {t(
                                                      `band.${criterion.band}`,
                                                    )}
                                                  </span>
                                                </div>
                                                <p className={styles.hint}>
                                                  {academicText(
                                                    locale,
                                                    criterion.arabicDescription,
                                                    criterion.englishDescription,
                                                  )}
                                                </p>
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className={styles.workingSection}>
                                <h3 className={styles.sectionTitle}>
                                  {t("assessmentDefinitions")}
                                </h3>
                                {unit.definitions.length === 0 ? (
                                  <p className={styles.empty}>
                                    {t("noDefinitions")}
                                  </p>
                                ) : (
                                  <div className={styles.rows}>
                                    {unit.definitions.map((definition) => (
                                      <div
                                        key={definition.id}
                                        className={styles.record}
                                      >
                                        <div className={styles.rowHeading}>
                                          <h4 className={styles.itemTitle}>
                                            <span dir="ltr">
                                              {definition.code}
                                            </span>{" "}
                                            ·{" "}
                                            {academicText(
                                              locale,
                                              definition.arabicTitle,
                                              definition.englishTitle,
                                            )}{" "}
                                            <span className={styles.hint}>
                                              {t("definitionVersion", {
                                                version: definition.version,
                                              })}
                                            </span>
                                          </h4>
                                          <span className={styles.meta}>
                                            {t("validation")}
                                          </span>
                                          <Badge
                                            text={state(
                                              definition.validation,
                                              definition.isActive,
                                            )}
                                            ready={
                                              definition.validation.length ===
                                                0 && definition.isActive
                                            }
                                          />
                                        </div>
                                        <p className={styles.meta}>
                                          {t("publicationState")}:{" "}
                                          {definition.isActive
                                            ? t("active")
                                            : t("draft")}
                                        </p>
                                        {definition.sourceReference && (
                                          <p className={styles.hint} dir="auto">
                                            {t("sourceReference")}:{" "}
                                            {definition.sourceReference}
                                          </p>
                                        )}
                                        {publish.variables ===
                                          definition.id && (
                                          <OperationFeedback
                                            mutation={publish}
                                            label={t("publish")}
                                          />
                                        )}
                                        <p className={styles.hint}>
                                          {t("linkedAims")}:{" "}
                                          {definition.aimIds
                                            .map((id) => aims.get(id)?.code)
                                            .filter(Boolean)
                                            .join(", ") || t("none")}
                                        </p>
                                        <p className={styles.hint}>
                                          {t("linkedCriteria")}:{" "}
                                          {definition.criterionIds
                                            .map((id) => criteria.get(id)?.code)
                                            .filter(Boolean)
                                            .join(", ") || t("none")}
                                        </p>
                                        {definition.validation.length === 0 &&
                                          !definition.isActive && (
                                            <button
                                              type="button"
                                              className={styles.primary}
                                              disabled={publish.isPending}
                                              onClick={() =>
                                                publish.mutate(definition.id)
                                              }
                                            >
                                              {publish.isPending &&
                                              publish.variables ===
                                                definition.id
                                                ? t("saving")
                                                : t("publish")}
                                            </button>
                                          )}
                                        <div className={styles.scopes}>
                                          <h5 className={styles.sectionTitle}>
                                            {t("assessmentScopes")}
                                          </h5>
                                          {definition.scopes.length === 0 ? (
                                            <p className={styles.empty}>
                                              {t("noScopes")}
                                            </p>
                                          ) : (
                                            <ul className={styles.rows}>
                                              {definition.scopes.map(
                                                (scope) => (
                                                  <li
                                                    key={scope.id}
                                                    className={styles.scope}
                                                  >
                                                    <div
                                                      className={
                                                        styles.rowHeading
                                                      }
                                                    >
                                                      <span
                                                        className={
                                                          styles.itemTitle
                                                        }
                                                      >
                                                        {academicText(
                                                          locale,
                                                          scope.gradeArabicName,
                                                          scope.gradeEnglishName,
                                                        )}{" "}
                                                        ·{" "}
                                                        {academicText(
                                                          locale,
                                                          scope.specializationArabicName,
                                                          scope.specializationEnglishName,
                                                        )}
                                                      </span>
                                                      <span
                                                        className={styles.meta}
                                                      >
                                                        {t("validation")}
                                                      </span>
                                                      <Badge
                                                        text={state(
                                                          scope.validation,
                                                          scope.isActive,
                                                        )}
                                                        ready={
                                                          scope.validation
                                                            .length === 0 &&
                                                          scope.isActive
                                                        }
                                                      />
                                                    </div>
                                                    <p className={styles.meta}>
                                                      {t("scopeState")}:{" "}
                                                      {scope.isActive
                                                        ? t("active")
                                                        : t("draft")}
                                                    </p>
                                                    {activate.variables ===
                                                      scope.id && (
                                                      <OperationFeedback
                                                        mutation={activate}
                                                        label={t("activate")}
                                                      />
                                                    )}
                                                    <p className={styles.hint}>
                                                      {t("rubric")}:{" "}
                                                      {academicText(
                                                        locale,
                                                        scope.rubricArabicTitle,
                                                        scope.rubricEnglishTitle,
                                                      )}{" "}
                                                      ·{" "}
                                                      {t("scopeVersion", {
                                                        version: scope.version,
                                                      })}
                                                    </p>
                                                    {scope.validation.length ===
                                                      0 &&
                                                      !scope.isActive && (
                                                        <button
                                                          type="button"
                                                          className={
                                                            styles.primary
                                                          }
                                                          disabled={
                                                            activate.isPending
                                                          }
                                                          onClick={() =>
                                                            activate.mutate(
                                                              scope.id,
                                                            )
                                                          }
                                                        >
                                                          {activate.isPending &&
                                                          activate.variables ===
                                                            scope.id
                                                            ? t("saving")
                                                            : t("activate")}
                                                        </button>
                                                      )}
                                                  </li>
                                                ),
                                              )}
                                            </ul>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </details>
                      </article>
                    );
                  })}
                </div>
              ))}
          </>
        )}
      </section>
    </section>
  );
}

function ReadState({
  query,
  loading,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    isFetching: boolean;
    data: unknown;
    refetch: () => unknown;
  };
  loading: string;
}) {
  const t = useTranslations("academicCatalogue");
  if (query.isPending)
    return (
      <p className={styles.notice} role="status" aria-busy="true">
        {loading}
      </p>
    );
  if (!query.isError) return null;
  return (
    <div
      className={styles.notice}
      data-tone={query.data === undefined ? "danger" : "warning"}
      role="alert"
    >
      <p>{query.data === undefined ? t("loadError") : t("refreshWarning")}</p>
      <button
        type="button"
        className={styles.secondary}
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        {t("retry")}
      </button>
    </div>
  );
}
function OperationFeedback({
  mutation,
  label,
}: {
  mutation: { isPending: boolean; isError: boolean; isSuccess: boolean };
  label: string;
}) {
  const t = useTranslations("academicCatalogue");
  if (!mutation.isPending && !mutation.isError && !mutation.isSuccess)
    return null;
  return (
    <div
      className={styles.notice}
      data-tone={mutation.isError ? "danger" : "info"}
      role={mutation.isError ? "alert" : "status"}
      aria-busy={mutation.isPending}
    >
      <strong>{label}</strong>
      <span>
        {mutation.isPending
          ? t("saving")
          : mutation.isError
            ? t("saveError")
            : t("saved")}
      </span>
    </div>
  );
}
function Badge({ text, ready }: { text: string; ready: boolean }) {
  return (
    <span className={styles.badge} data-ready={ready}>
      {text}
    </span>
  );
}
