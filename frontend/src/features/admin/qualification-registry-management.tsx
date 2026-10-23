"use client";

import { formatLocalizedDate } from "@/i18n/date-time";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { QueryState, MutationOutcome } from "@/components/ui/query-state";
import styles from "./qualification-registry-management.module.css";

type QualificationVersion = {
  id: string;
  versionCode: string;
  sourceReference: string;
  effectiveFromUtc: string;
  effectiveUntilUtc: string | null;
  isActive: boolean;
};

type Qualification = {
  id: string;
  code: string;
  arabicName: string;
  englishName: string;
  isActive: boolean;
  versions: QualificationVersion[];
};

type Rubric = {
  rubricTemplateId: string;
  arabicTitle: string;
  englishTitle: string;
  qualificationVersionId: string | null;
  qualificationCode: string | null;
  qualificationVersionCode: string | null;
};

export function QualificationRegistryManagement() {
  const locale = useLocale();
  const t = useTranslations("adminWorkspace");
  const ar = locale === "ar";
  const client = useQueryClient();
  const [qualificationForm, setQualificationForm] = useState({
    code: "",
    arabicName: "",
    englishName: "",
  });
  const [versionForm, setVersionForm] = useState({
    qualificationId: "",
    versionCode: "",
    sourceReference: "",
    effectiveFromUtc: "",
    effectiveUntilUtc: "",
  });
  const [rubricVersions, setRubricVersions] = useState<Record<string, string>>(
    {},
  );
  const qualifications = useQuery({
    queryKey: ["qualification-registry"],
    queryFn: () => api<Qualification[]>("/qualification-registry"),
    retry: false,
  });
  const rubrics = useQuery({
    queryKey: ["qualification-registry", "rubrics"],
    queryFn: () => api<Rubric[]>("/qualification-registry/rubrics"),
    retry: false,
  });
  const versions = useMemo(
    () =>
      (qualifications.data ?? []).flatMap((qualification) =>
        qualification.versions.map((version) => ({
          ...version,
          qualificationCode: qualification.code,
        })),
      ),
    [qualifications.data],
  );
  const createQualification = useMutation({
    mutationFn: () =>
      api<Qualification>("/qualification-registry/qualifications", {
        method: "POST",
        body: JSON.stringify(qualificationForm),
      }),
    onSuccess: () => {
      setQualificationForm({ code: "", arabicName: "", englishName: "" });
      void client.invalidateQueries({ queryKey: ["qualification-registry"] });
    },
  });
  const createVersion = useMutation({
    mutationFn: () =>
      api<QualificationVersion>("/qualification-registry/versions", {
        method: "POST",
        body: JSON.stringify({
          qualificationId: versionForm.qualificationId,
          versionCode: versionForm.versionCode,
          sourceReference: versionForm.sourceReference,
          effectiveFromUtc: new Date(
            `${versionForm.effectiveFromUtc}T00:00:00.000Z`,
          ).toISOString(),
          effectiveUntilUtc: versionForm.effectiveUntilUtc
            ? new Date(
                `${versionForm.effectiveUntilUtc}T00:00:00.000Z`,
              ).toISOString()
            : null,
        }),
      }),
    onSuccess: () => {
      setVersionForm({
        qualificationId: "",
        versionCode: "",
        sourceReference: "",
        effectiveFromUtc: "",
        effectiveUntilUtc: "",
      });
      void client.invalidateQueries({ queryKey: ["qualification-registry"] });
    },
  });
  const assign = useMutation({
    mutationFn: ({
      rubricTemplateId,
      qualificationVersionId,
    }: {
      rubricTemplateId: string;
      qualificationVersionId: string;
    }) =>
      api<void>(
        `/qualification-registry/rubrics/${rubricTemplateId}/qualification-version/${qualificationVersionId}`,
        { method: "POST" },
      ),
    onSuccess: () => {
      setRubricVersions({});
      void client.invalidateQueries({
        queryKey: ["qualification-registry", "rubrics"],
      });
    },
  });
  const canCreateQualification =
    qualificationForm.code.trim().length >= 2 &&
    qualificationForm.arabicName.trim().length >= 2 &&
    qualificationForm.englishName.trim().length >= 2;
  const canCreateVersion =
    Boolean(versionForm.qualificationId) &&
    versionForm.versionCode.trim().length >= 2 &&
    versionForm.sourceReference.trim().length >= 10 &&
    Boolean(versionForm.effectiveFromUtc);
  const date = (value: string) =>
    formatLocalizedDate(value, locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    });
  const error =
    createQualification.error ?? createVersion.error ?? assign.error ?? null;

  return (
    <section className={`shell py-8 ${styles.workspace}`}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          BETCCO · {t("qualificationRegistry.eyebrow")}
        </p>
        <h1 className={styles.title}>{t("qualificationRegistry.title")}</h1>
        <p className={styles.description}>
          {t("qualificationRegistry.description")}
        </p>
      </header>

      <div className={styles.forms}>
        <form
          className={styles.qualificationForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (canCreateQualification) createQualification.mutate();
          }}
        >
          <h2 className={styles.sectionTitle}>
            {t("qualificationRegistry.addQualification")}
          </h2>
          <RegistryInput
            label={t("qualificationRegistry.code")}
            value={qualificationForm.code}
            onChange={(value) =>
              setQualificationForm((current) => ({ ...current, code: value }))
            }
            placeholder="BTEC-L3-IT"
          />
          <RegistryInput
            label={t("qualificationRegistry.arabicName")}
            value={qualificationForm.arabicName}
            onChange={(value) =>
              setQualificationForm((current) => ({
                ...current,
                arabicName: value,
              }))
            }
          />
          <RegistryInput
            label={t("qualificationRegistry.englishName")}
            value={qualificationForm.englishName}
            onChange={(value) =>
              setQualificationForm((current) => ({
                ...current,
                englishName: value,
              }))
            }
          />
          <SubmitButton
            pending={createQualification.isPending}
            disabled={!canCreateQualification}
            label={t("qualificationRegistry.saveQualification")}
            pendingLabel={t("qualificationRegistry.saving")}
          />
        </form>

        <form
          className={styles.versionForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (canCreateVersion) createVersion.mutate();
          }}
        >
          <h2 className={styles.sectionTitle}>
            {t("qualificationRegistry.addVersion")}
          </h2>
          <label className={styles.field}>
            {t("qualificationRegistry.qualification")}
            <select
              value={versionForm.qualificationId}
              onChange={(event) =>
                setVersionForm((current) => ({
                  ...current,
                  qualificationId: event.target.value,
                }))
              }
              required
            >
              <option value="">
                {t("qualificationRegistry.chooseQualification")}
              </option>
              {qualifications.data?.map((qualification) => (
                <option key={qualification.id} value={qualification.id}>
                  {qualification.code} ·{" "}
                  {ar ? qualification.arabicName : qualification.englishName}
                </option>
              ))}
            </select>
          </label>
          <RegistryInput
            label={t("qualificationRegistry.versionCode")}
            value={versionForm.versionCode}
            onChange={(value) =>
              setVersionForm((current) => ({ ...current, versionCode: value }))
            }
            placeholder="2026"
          />
          <RegistryInput
            label={t("qualificationRegistry.sourceReference")}
            value={versionForm.sourceReference}
            onChange={(value) =>
              setVersionForm((current) => ({
                ...current,
                sourceReference: value,
              }))
            }
            placeholder={t("qualificationRegistry.sourcePlaceholder")}
          />
          <div className={styles.dates}>
            <DateInput
              label={t("qualificationRegistry.effectiveFrom")}
              value={versionForm.effectiveFromUtc}
              onChange={(value) =>
                setVersionForm((current) => ({
                  ...current,
                  effectiveFromUtc: value,
                }))
              }
              required
            />
            <DateInput
              label={t("qualificationRegistry.effectiveUntil")}
              value={versionForm.effectiveUntilUtc}
              onChange={(value) =>
                setVersionForm((current) => ({
                  ...current,
                  effectiveUntilUtc: value,
                }))
              }
            />
          </div>
          <SubmitButton
            pending={createVersion.isPending}
            disabled={!canCreateVersion}
            label={t("qualificationRegistry.saveVersion")}
            pendingLabel={t("qualificationRegistry.saving")}
          />
        </form>
      </div>

      {error ? (
        <MutationOutcome kind="error">
          {error instanceof Error
            ? error.message
            : t("qualificationRegistry.saveError")}
        </MutationOutcome>
      ) : null}

      <div className={styles.regions}>
        <section aria-labelledby="qualification-registry-heading">
          <h2
            id="qualification-registry-heading"
            className={styles.sectionTitle}
          >
            {t("qualificationRegistry.registered")}
          </h2>
          <div className={styles.ledger}>
            {qualifications.isPending ? (
              <QueryState
                kind="loading"
                title={t("qualificationRegistry.loadingQualifications")}
              />
            ) : null}
            {qualifications.isError ? (
              <QueryState
                kind="error"
                title={t("qualificationRegistry.qualificationError")}
              />
            ) : null}
            {qualifications.data?.map((qualification) => (
              <article key={qualification.id} className={styles.qualification}>
                <h3 className={styles.entityTitle}>
                  <bdi>{qualification.code}</bdi> ·{" "}
                  {ar ? qualification.arabicName : qualification.englishName}
                </h3>
                {qualification.versions.length === 0 ? (
                  <p className={styles.noVersion}>
                    {t("qualificationRegistry.noVersion")}
                  </p>
                ) : (
                  <ul className={styles.versions}>
                    {qualification.versions.map((version) => (
                      <li key={version.id} className={styles.version}>
                        <strong dir="auto">{version.versionCode}</strong>
                        <time dateTime={version.effectiveFromUtc}>
                          {date(version.effectiveFromUtc)}
                        </time>
                        <span className={styles.reference}>
                          {version.sourceReference}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
            {qualifications.isSuccess && qualifications.data.length === 0 ? (
              <QueryState
                kind="empty"
                title={t("qualificationRegistry.empty")}
              />
            ) : null}
          </div>
        </section>

        <section aria-labelledby="rubric-binding-heading">
          <h2 id="rubric-binding-heading" className={styles.sectionTitle}>
            {t("qualificationRegistry.bindTitle")}
          </h2>
          <p className={styles.policy}>
            {t("qualificationRegistry.bindingPolicy")}
          </p>
          <div className={styles.ledger}>
            {rubrics.isPending ? (
              <QueryState
                kind="loading"
                title={t("qualificationRegistry.loadingRubrics")}
              />
            ) : null}
            {rubrics.isError ? (
              <QueryState
                kind="error"
                title={t("qualificationRegistry.rubricsError")}
              />
            ) : null}
            {rubrics.isSuccess && rubrics.data.length === 0 ? (
              <QueryState
                kind="empty"
                title={t("qualificationRegistry.emptyRubrics")}
              />
            ) : null}
            {rubrics.data?.map((rubric) => {
              const selected =
                rubricVersions[rubric.rubricTemplateId] ??
                rubric.qualificationVersionId ??
                "";
              return (
                <article
                  key={rubric.rubricTemplateId}
                  className={styles.rubric}
                >
                  <div>
                    <h3 className={styles.entityTitle}>
                      {ar ? rubric.arabicTitle : rubric.englishTitle}
                    </h3>
                    <p className={styles.binding}>
                      {rubric.qualificationCode &&
                      rubric.qualificationVersionCode
                        ? `${rubric.qualificationCode} · ${rubric.qualificationVersionCode}`
                        : t("qualificationRegistry.unbound")}
                    </p>
                  </div>
                  <div className={styles.bindingControls}>
                    <select
                      aria-label={t("qualificationRegistry.chooseVersion")}
                      value={selected}
                      onChange={(event) =>
                        setRubricVersions((current) => ({
                          ...current,
                          [rubric.rubricTemplateId]: event.target.value,
                        }))
                      }
                    >
                      <option value="">
                        {t("qualificationRegistry.chooseVersion")}
                      </option>
                      {versions.map((version) => (
                        <option key={version.id} value={version.id}>
                          {version.qualificationCode} · {version.versionCode}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={
                        !selected ||
                        assign.isPending ||
                        selected === rubric.qualificationVersionId
                      }
                      onClick={() =>
                        assign.mutate({
                          rubricTemplateId: rubric.rubricTemplateId,
                          qualificationVersionId: selected,
                        })
                      }
                      aria-busy={assign.isPending}
                    >
                      {t("qualificationRegistry.bind")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}

function RegistryInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className={styles.field}>
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required
      />
    </label>
  );
}

function DateInput({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className={styles.field}>
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </label>
  );
}

function SubmitButton({
  pending,
  disabled,
  label,
  pendingLabel,
}: {
  pending: boolean;
  disabled: boolean;
  label: string;
  pendingLabel: string;
}) {
  return (
    <button type="submit" disabled={pending || disabled} aria-busy={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}
