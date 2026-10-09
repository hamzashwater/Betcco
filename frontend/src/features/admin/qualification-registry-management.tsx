"use client";

import { formatLocalizedDate } from "@/i18n/date-time";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

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
    <section className="shell py-8 sm:py-10">
      <div className="max-w-4xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
          BETCCO · {t("qualificationRegistry.eyebrow")}
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
          {t("qualificationRegistry.title")}
        </h1>
        <p className="mt-3 leading-7 text-muted">
          {t("qualificationRegistry.description")}
        </p>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <form
          className="card grid gap-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (canCreateQualification) createQualification.mutate();
          }}
        >
          <h2 className="text-lg font-black">
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
          className="card grid gap-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (canCreateVersion) createVersion.mutate();
          }}
        >
          <h2 className="text-lg font-black">
            {t("qualificationRegistry.addVersion")}
          </h2>
          <label className="grid gap-2 text-sm font-black">
            {t("qualificationRegistry.qualification")}
            <select
              className="focus-ring rounded-xl border border-border bg-background px-3 py-3 text-foreground"
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
          <div className="grid gap-3 sm:grid-cols-2">
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
        <p role="alert" className="mt-4 text-sm text-red-500">
          {error instanceof Error
            ? error.message
            : t("qualificationRegistry.saveError")}
        </p>
      ) : null}

      <div className="mt-8 grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        <div>
          <h2 className="text-xl font-black">
            {t("qualificationRegistry.registered")}
          </h2>
          <div className="mt-4 grid gap-3">
            {qualifications.data?.map((qualification) => (
              <article key={qualification.id} className="card p-4">
                <h3 className="font-black">
                  {qualification.code} ·{" "}
                  {ar ? qualification.arabicName : qualification.englishName}
                </h3>
                {qualification.versions.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">
                    {t("qualificationRegistry.noVersion")}
                  </p>
                ) : (
                  <ul className="mt-3 grid gap-2 text-sm">
                    {qualification.versions.map((version) => (
                      <li
                        key={version.id}
                        className="rounded-lg border border-border bg-page/40 p-3"
                      >
                        <strong>{version.versionCode}</strong> ·{" "}
                        {date(version.effectiveFromUtc)}
                        <span className="mt-1 block break-words text-muted">
                          {version.sourceReference}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
            {qualifications.isSuccess && qualifications.data.length === 0 ? (
              <p className="card p-4 text-muted">
                {t("qualificationRegistry.empty")}
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-black">
            {t("qualificationRegistry.bindTitle")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {t("qualificationRegistry.bindingPolicy")}
          </p>
          <div className="mt-4 grid gap-3">
            {rubrics.data?.map((rubric) => {
              const selected =
                rubricVersions[rubric.rubricTemplateId] ??
                rubric.qualificationVersionId ??
                "";
              return (
                <article
                  key={rubric.rubricTemplateId}
                  className="card grid gap-3 p-4"
                >
                  <div>
                    <h3 className="font-black">
                      {ar ? rubric.arabicTitle : rubric.englishTitle}
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      {rubric.qualificationCode &&
                      rubric.qualificationVersionCode
                        ? `${rubric.qualificationCode} · ${rubric.qualificationVersionCode}`
                        : t("qualificationRegistry.unbound")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="focus-ring min-w-56 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-foreground"
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
                      className="focus-ring rounded-xl bg-primary px-4 py-2 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {t("qualificationRegistry.bind")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
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
    <label className="grid gap-2 text-sm font-black">
      {label}
      <input
        className="focus-ring rounded-xl border border-border bg-background px-3 py-3 text-foreground"
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
    <label className="grid gap-2 text-sm font-black">
      {label}
      <input
        type="date"
        className="focus-ring rounded-xl border border-border bg-background px-3 py-3 text-foreground"
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
    <button
      type="submit"
      disabled={pending || disabled}
      className="focus-ring justify-self-start rounded-xl bg-primary px-5 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
