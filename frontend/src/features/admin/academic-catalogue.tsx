"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type Version = {
  id: string;
  qualificationCode: string;
  versionCode: string;
  isActive: boolean;
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
  const ar = locale === "ar";
  const client = useQueryClient();
  const [chosenVersionId, setChosenVersionId] = useState("");
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
  const issueLabel = (issue: string) => t(issueKeys[issue] ?? "invalidMapping");
  const state = (issues: string[], active: boolean) =>
    issues.length > 0
      ? issues.map(issueLabel).join(" · ")
      : active
        ? t("ready")
        : t("draft");

  return (
    <section
      className="shell min-w-0 py-8 sm:py-10"
      aria-labelledby="academic-title"
    >
      <div className="max-w-4xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
          BETCCO · {t("eyebrow")}
        </p>
        <h1
          id="academic-title"
          className="mt-3 text-3xl font-black tracking-tight sm:text-4xl"
        >
          {t("title")}
        </h1>
        <p className="mt-3 leading-7 text-muted">{t("description")}</p>
      </div>

      {versions.isPending ? (
        <p className="card mt-7 p-6" role="status" aria-busy="true">
          {t("loading")}
        </p>
      ) : versions.isError ? (
        <div className="card mt-7 p-6" role="alert">
          <p>{t("loadError")}</p>
          <button
            type="button"
            className="focus-ring mt-3 rounded-lg border border-border px-4 py-2"
            onClick={() => void versions.refetch()}
          >
            {t("retry")}
          </button>
        </div>
      ) : versions.data?.length === 0 ? (
        <p className="card mt-7 p-6" role="status">
          {t("noVersions")}
        </p>
      ) : (
        <>
          <div className="card mt-7 max-w-xl p-5">
            <label
              htmlFor="academic-version"
              className="block text-sm font-bold"
            >
              {t("qualificationVersion")}
            </label>
            <select
              id="academic-version"
              value={versionId}
              onChange={(event) => setChosenVersionId(event.target.value)}
              className="focus-ring mt-2 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2"
            >
              {versions.data?.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.qualificationCode} · {version.versionCode}
                </option>
              ))}
            </select>
          </div>
          {catalogue.isPending ? (
            <p className="card mt-6 p-6" role="status" aria-busy="true">
              {t("loadingUnits")}
            </p>
          ) : catalogue.isError || !catalogue.data ? (
            <div className="card mt-6 p-6" role="alert">
              <p>{t("loadError")}</p>
              <button
                type="button"
                className="focus-ring mt-3 rounded-lg border border-border px-4 py-2"
                onClick={() => void catalogue.refetch()}
              >
                {t("retry")}
              </button>
            </div>
          ) : catalogue.data.units.length === 0 ? (
            <p className="card mt-6 p-6" role="status">
              {t("noUnits")}
            </p>
          ) : (
            <div className="mt-6 grid min-w-0 gap-5">
              {catalogue.data.units.map((unit) => {
                const aims = new Map(unit.aims.map((aim) => [aim.id, aim]));
                const criteria = new Map(
                  unit.aims.flatMap((aim) =>
                    aim.criteria.map(
                      (criterion) => [criterion.id, criterion] as const,
                    ),
                  ),
                );
                return (
                  <article key={unit.id} className="card min-w-0 p-5 sm:p-6">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wide text-muted">
                          {t("unit")} ·{" "}
                          {catalogue.data.version.qualificationCode} /{" "}
                          {catalogue.data.version.versionCode}
                        </p>
                        <h2 className="mt-2 break-words text-xl font-black">
                          <span dir="ltr">{unit.code}</span> ·{" "}
                          {ar ? unit.arabicTitle : unit.englishTitle}
                        </h2>
                      </div>
                      <Badge
                        text={unit.isActive ? t("active") : t("draft")}
                        ready={unit.isActive}
                      />
                    </div>
                    <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-2">
                      <div className="min-w-0 rounded-xl border border-border p-4">
                        <h3 className="font-black">{t("learningAims")}</h3>
                        {unit.aims.length === 0 ? (
                          <p className="mt-2 text-sm text-muted">
                            {t("noAims")}
                          </p>
                        ) : (
                          <div className="mt-3 grid gap-4">
                            {unit.aims.map((aim) => (
                              <div
                                key={aim.id}
                                className="min-w-0 border-t border-border pt-3 first:border-0 first:pt-0"
                              >
                                <h4 className="break-words font-bold">
                                  <span dir="ltr">{aim.code}</span> ·{" "}
                                  {ar ? aim.arabicTitle : aim.englishTitle}
                                </h4>
                                {aim.criteria.length === 0 ? (
                                  <p className="mt-2 text-sm text-muted">
                                    {t("noCriteria")}
                                  </p>
                                ) : (
                                  <ul className="mt-2 space-y-2">
                                    {aim.criteria.map((criterion) => (
                                      <li
                                        key={criterion.id}
                                        className="min-w-0 rounded-lg bg-surface px-3 py-2 text-sm"
                                      >
                                        <div className="flex flex-wrap items-center gap-2 font-semibold">
                                          <span dir="ltr">
                                            {criterion.code}
                                          </span>
                                          <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                                            {t(`band.${criterion.band}`)}
                                          </span>
                                        </div>
                                        <p className="mt-1 break-words text-muted">
                                          {ar
                                            ? criterion.arabicDescription
                                            : criterion.englishDescription}
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
                      <div className="min-w-0 rounded-xl border border-border p-4">
                        <h3 className="font-black">
                          {t("assessmentDefinitions")}
                        </h3>
                        {unit.definitions.length === 0 ? (
                          <p className="mt-2 text-sm text-muted">
                            {t("noDefinitions")}
                          </p>
                        ) : (
                          <div className="mt-3 grid gap-4">
                            {unit.definitions.map((definition) => (
                              <div
                                key={definition.id}
                                className="min-w-0 border-t border-border pt-3 first:border-0 first:pt-0"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <h4 className="break-words font-bold">
                                    <span dir="ltr">{definition.code}</span> ·{" "}
                                    {ar
                                      ? definition.arabicTitle
                                      : definition.englishTitle}{" "}
                                    <span className="text-muted">
                                      {t("versionLabel", { version: definition.version })}
                                    </span>
                                  </h4>
                                  <Badge
                                    text={state(
                                      definition.validation,
                                      definition.isActive,
                                    )}
                                    ready={
                                      definition.validation.length === 0 &&
                                      definition.isActive
                                    }
                                  />
                                </div>
                                <p className="mt-2 break-words text-sm text-muted">
                                  {t("linkedAims")}:{" "}
                                  {definition.aimIds
                                    .map((id) => aims.get(id)?.code)
                                    .filter(Boolean)
                                    .join(", ") || t("none")}
                                </p>
                                <p className="mt-1 break-words text-sm text-muted">
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
                                      className="focus-ring mt-3 rounded-lg border border-primary px-3 py-2 text-sm font-bold text-primary disabled:opacity-50"
                                      disabled={publish.isPending}
                                      onClick={() =>
                                        publish.mutate(definition.id)
                                      }
                                    >
                                      {publish.isPending
                                        ? t("saving")
                                        : t("publish")}
                                    </button>
                                  )}
                                <div className="mt-4 min-w-0">
                                  <h5 className="text-sm font-bold">
                                    {t("assessmentScopes")}
                                  </h5>
                                  {definition.scopes.length === 0 ? (
                                    <p className="mt-2 text-sm text-muted">
                                      {t("noScopes")}
                                    </p>
                                  ) : (
                                    <ul className="mt-2 grid gap-2">
                                      {definition.scopes.map((scope) => (
                                        <li
                                          key={scope.id}
                                          className="min-w-0 rounded-lg border border-border p-3 text-sm"
                                        >
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="break-words font-semibold">
                                              {ar
                                                ? scope.gradeArabicName
                                                : scope.gradeEnglishName}{" "}
                                              ·{" "}
                                              {ar
                                                ? scope.specializationArabicName
                                                : scope.specializationEnglishName}
                                            </span>
                                            <Badge
                                              text={state(
                                                scope.validation,
                                                scope.isActive,
                                              )}
                                              ready={
                                                scope.validation.length === 0 &&
                                                scope.isActive
                                              }
                                            />
                                          </div>
                                          <p className="mt-1 break-words text-muted">
                                            {t("rubric")}:{" "}
                                            {ar
                                              ? scope.rubricArabicTitle
                                              : scope.rubricEnglishTitle}{" "}
                                            · {t("versionLabel", { version: scope.version })}
                                          </p>
                                          {scope.validation.length === 0 &&
                                            !scope.isActive && (
                                              <button
                                                type="button"
                                                className="focus-ring mt-2 rounded-lg border border-primary px-3 py-2 font-bold text-primary disabled:opacity-50"
                                                disabled={activate.isPending}
                                                onClick={() =>
                                                  activate.mutate(scope.id)
                                                }
                                              >
                                                {activate.isPending
                                                  ? t("saving")
                                                  : t("activate")}
                                              </button>
                                            )}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
      {(publish.isError || activate.isError) && (
        <p className="card mt-5 p-4 text-red-700" role="alert">
          {t("saveError")}
        </p>
      )}
      {(publish.isSuccess || activate.isSuccess) && (
        <p className="mt-5 text-sm text-green-700" role="status">
          {t("saved")}
        </p>
      )}
    </section>
  );
}

function Badge({ text, ready }: { text: string; ready: boolean }) {
  return (
    <span
      className={`max-w-full break-words rounded-full px-3 py-1 text-xs font-bold ${ready ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}
    >
      {text}
    </span>
  );
}
