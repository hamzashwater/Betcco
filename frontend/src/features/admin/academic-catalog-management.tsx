"use client";

import { api } from "@/lib/api";
import { academicText } from "@/lib/academic-localization";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type Track = { id: string; name: string; isBtecFocused: boolean };
type Taxonomy = { tracks: Track[] };
type Item = {
  id: string;
  learningTrackId: string;
  slug: string;
  arabicName: string;
  englishName: string;
  isVisible: boolean;
  sortOrder: number;
};
type Version = {
  id: string;
  versionCode: string;
  sourceReference: string;
  isActive: boolean;
  source: string;
};
type Qualification = {
  id: string;
  code: string;
  arabicName: string;
  englishName: string;
  isActive: boolean;
  specializationId?: string;
  source: string;
  versions: Version[];
};

export function AcademicCatalogManagement() {
  const locale = useLocale();
  const t = useTranslations("adminWorkspace");
  const ar = locale === "ar";
  const client = useQueryClient();
  const [message, setMessage] = useState("");
  const [specialization, setSpecialization] = useState({
    slug: "",
    arabicName: "",
    englishName: "",
  });
  const [grade, setGrade] = useState({
    slug: "",
    arabicName: "",
    englishName: "",
  });
  const [qualification, setQualification] = useState({
    code: "",
    arabicName: "",
    englishName: "",
    specializationId: "",
  });
  const [version, setVersion] = useState({
    qualificationId: "",
    versionCode: "",
    sourceReference: "",
    effectiveFromUtc: "",
  });
  const [unit, setUnit] = useState({
    qualificationVersionId: "",
    code: "",
    arabicTitle: "",
    englishTitle: "",
    sourceReference: "",
  });
  const taxonomy = useQuery({
    queryKey: ["admin-catalog-tracks"],
    queryFn: async () => {
      const value = await api<Taxonomy>("/taxonomy?locale=en");
      return { tracks: Array.isArray(value.tracks) ? value.tracks : [] };
    },
  });
  const trackId =
    taxonomy.data?.tracks.find((item) => item.isBtecFocused)?.id ?? "";
  const specializations = useQuery({
    queryKey: ["admin-catalog-specializations"],
    queryFn: async () => {
      const value = await api<Item[]>(
        "/admin/academic-taxonomy/specializations",
      );
      return Array.isArray(value) ? value : [];
    },
  });
  const grades = useQuery({
    queryKey: ["admin-catalog-grades"],
    queryFn: async () => {
      const value = await api<Item[]>("/admin/academic-taxonomy/grades");
      return Array.isArray(value) ? value : [];
    },
  });
  const qualifications = useQuery({
    queryKey: ["admin-catalog-qualifications"],
    queryFn: async () => {
      const value = await api<Qualification[]>("/qualification-registry");
      return Array.isArray(value) ? value : [];
    },
  });
  const versionChoices =
    qualifications.data?.flatMap((item) =>
      item.versions
        .filter((v) => v.source === "AdminCustom")
        .map((v) => ({
          id: v.id,
          name: `${academicText(locale, item.arabicName, item.englishName)} · ${v.versionCode}`,
        })),
    ) ?? [];
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["admin-catalog-specializations"] }),
      client.invalidateQueries({ queryKey: ["admin-catalog-grades"] }),
      client.invalidateQueries({ queryKey: ["admin-catalog-qualifications"] }),
      client.invalidateQueries({ queryKey: ["academic-catalogue"] }),
      client.invalidateQueries({ queryKey: ["delivery-planning-versions"] }),
    ]);
  };
  const write = useMutation({
    mutationFn: async ({
      path,
      method,
      body,
    }: {
      path: string;
      method: "POST" | "PUT";
      body: object;
    }) => api(path, { method, body: JSON.stringify(body) }),
    onSuccess: async () => {
      setMessage(t("academicCatalogManagement.changesSaved"));
      await refresh();
    },
    onError: () =>
      setMessage(t("academicCatalogManagement.couldNotSaveChanges")),
  });
  const save = (path: string, method: "POST" | "PUT", body: object) => {
    setMessage("");
    if (!write.isPending) write.mutate({ path, method, body });
  };
  const inputClass =
    "min-w-0 rounded-lg border border-border bg-background px-3 py-2";

  return (
    <section
      className="card mt-7 min-w-0 p-5"
      aria-label={t("academicCatalogManagement.manageAcademicCatalogue")}
    >
      <h2 className="text-xl font-bold">
        {t("academicCatalogManagement.manageTaxonomyAndCatalogue")}
      </h2>
      {(taxonomy.isPending ||
        specializations.isPending ||
        grades.isPending ||
        qualifications.isPending) && (
        <p aria-busy="true" role="status">
          {t("academicCatalogManagement.loading")}
        </p>
      )}
      {(taxonomy.isError ||
        specializations.isError ||
        grades.isError ||
        qualifications.isError) && (
        <p role="alert" className="text-red-500">
          {t("academicCatalogManagement.couldNotLoadTheCatalogue")}
        </p>
      )}
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save("/admin/academic-taxonomy/specializations", "POST", {
              ...specialization,
              learningTrackId: trackId,
              sortOrder: 100,
            });
          }}
        >
          <h3 className="font-bold">
            {t("academicCatalogManagement.newCustomSpecialization")}
          </h3>
          <input
            className={inputClass}
            required
            placeholder="slug"
            aria-label={t("academicCatalogManagement.specializationSlug")}
            value={specialization.slug}
            onChange={(event) =>
              setSpecialization({ ...specialization, slug: event.target.value })
            }
          />
          <input
            className={inputClass}
            required
            placeholder={t("academicCatalogManagement.arabicName")}
            aria-label={t("academicCatalogManagement.specializationArabicName")}
            value={specialization.arabicName}
            onChange={(event) =>
              setSpecialization({
                ...specialization,
                arabicName: event.target.value,
              })
            }
          />
          <input
            className={inputClass}
            required
            placeholder={t("academicCatalogManagement.englishName")}
            aria-label={t(
              "academicCatalogManagement.specializationEnglishName",
            )}
            value={specialization.englishName}
            onChange={(event) =>
              setSpecialization({
                ...specialization,
                englishName: event.target.value,
              })
            }
          />
          <button
            className="rounded-lg bg-primary px-3 py-2 font-bold disabled:opacity-50"
            disabled={write.isPending || !trackId}
          >
            {t("academicCatalogManagement.addSpecialization")}
          </button>
        </form>
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save("/admin/academic-taxonomy/grades", "POST", {
              ...grade,
              learningTrackId: trackId,
              sortOrder: 100,
            });
          }}
        >
          <h3 className="font-bold">
            {t("academicCatalogManagement.newGrade")}
          </h3>
          <input
            className={inputClass}
            required
            placeholder="slug"
            aria-label={t("academicCatalogManagement.gradeSlug")}
            value={grade.slug}
            onChange={(event) =>
              setGrade({ ...grade, slug: event.target.value })
            }
          />
          <input
            className={inputClass}
            required
            placeholder={t("academicCatalogManagement.arabicName")}
            aria-label={t("academicCatalogManagement.gradeArabicName")}
            value={grade.arabicName}
            onChange={(event) =>
              setGrade({ ...grade, arabicName: event.target.value })
            }
          />
          <input
            className={inputClass}
            required
            placeholder={t("academicCatalogManagement.englishName")}
            aria-label={t("academicCatalogManagement.gradeEnglishName")}
            value={grade.englishName}
            onChange={(event) =>
              setGrade({ ...grade, englishName: event.target.value })
            }
          />
          <button
            className="rounded-lg bg-primary px-3 py-2 font-bold disabled:opacity-50"
            disabled={write.isPending || !trackId}
          >
            {t("academicCatalogManagement.addGrade")}
          </button>
        </form>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="font-bold">
            {t("academicCatalogManagement.specializations")}
          </h3>
          <ul className="mt-2 grid gap-2 text-sm">
            {specializations.data
              ?.filter((item) => item.learningTrackId === trackId)
              .map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2"
                >
                  <span>
                    {ar ? item.arabicName : item.englishName} · {item.slug}
                  </span>
                  <button
                    type="button"
                    disabled={write.isPending}
                    className="underline disabled:opacity-50"
                    onClick={() =>
                      save(
                        `/admin/academic-taxonomy/specializations/${item.id}`,
                        "PUT",
                        { ...item, isVisible: !item.isVisible },
                      )
                    }
                  >
                    {item.isVisible
                      ? t("academicCatalogManagement.archive")
                      : t("academicCatalogManagement.activate")}
                  </button>
                </li>
              ))}
          </ul>
        </div>
        <div>
          <h3 className="font-bold">{t("academicCatalogManagement.grades")}</h3>
          <ul className="mt-2 grid gap-2 text-sm">
            {grades.data
              ?.filter((item) => item.learningTrackId === trackId)
              .map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2"
                >
                  <span>
                    {ar ? item.arabicName : item.englishName} · {item.slug}
                  </span>
                  <button
                    type="button"
                    disabled={write.isPending}
                    className="underline disabled:opacity-50"
                    onClick={() =>
                      save(
                        `/admin/academic-taxonomy/grades/${item.id}`,
                        "PUT",
                        { ...item, isVisible: !item.isVisible },
                      )
                    }
                  >
                    {item.isVisible
                      ? t("academicCatalogManagement.archive")
                      : t("academicCatalogManagement.activate")}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save(
              "/qualification-registry/qualifications",
              "POST",
              qualification,
            );
          }}
        >
          <h3 className="font-bold">
            {t("academicCatalogManagement.customQualification")}
          </h3>
          <select
            className={inputClass}
            required
            aria-label={t(
              "academicCatalogManagement.qualificationSpecialization",
            )}
            value={qualification.specializationId}
            onChange={(event) =>
              setQualification({
                ...qualification,
                specializationId: event.target.value,
              })
            }
          >
            <option value="">
              {t("academicCatalogManagement.chooseSpecialization")}
            </option>
            {specializations.data
              ?.filter(
                (item) => item.isVisible && item.learningTrackId === trackId,
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {ar ? item.arabicName : item.englishName}
                </option>
              ))}
          </select>
          <input
            className={inputClass}
            required
            placeholder={t("academicCatalogManagement.qualificationCode")}
            aria-label={t("academicCatalogManagement.qualificationCode")}
            value={qualification.code}
            onChange={(event) =>
              setQualification({ ...qualification, code: event.target.value })
            }
          />
          <input
            className={inputClass}
            required
            placeholder={t("academicCatalogManagement.localArabicName")}
            aria-label={t("academicCatalogManagement.qualificationArabicName")}
            value={qualification.arabicName}
            onChange={(event) =>
              setQualification({
                ...qualification,
                arabicName: event.target.value,
              })
            }
          />
          <input
            className={inputClass}
            required
            placeholder={t("academicCatalogManagement.englishName")}
            aria-label={t("academicCatalogManagement.qualificationEnglishName")}
            value={qualification.englishName}
            onChange={(event) =>
              setQualification({
                ...qualification,
                englishName: event.target.value,
              })
            }
          />
          <button
            className="rounded-lg bg-primary px-3 py-2 font-bold disabled:opacity-50"
            disabled={write.isPending}
          >
            {t("academicCatalogManagement.addQualification")}
          </button>
        </form>
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save("/qualification-registry/versions", "POST", {
              ...version,
              effectiveFromUtc: new Date(
                version.effectiveFromUtc,
              ).toISOString(),
              effectiveUntilUtc: null,
            });
          }}
        >
          <h3 className="font-bold">
            {t("academicCatalogManagement.customVersion")}
          </h3>
          <select
            className={inputClass}
            required
            aria-label={t("academicCatalogManagement.qualification")}
            value={version.qualificationId}
            onChange={(event) =>
              setVersion({ ...version, qualificationId: event.target.value })
            }
          >
            <option value="">
              {t("academicCatalogManagement.chooseQualification")}
            </option>
            {qualifications.data
              ?.filter((item) => item.isActive && item.source === "AdminCustom")
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} ·{" "}
                  {academicText(locale, item.arabicName, item.englishName)}
                </option>
              ))}
          </select>
          <input
            className={inputClass}
            required
            placeholder={t("academicCatalogManagement.versionCode")}
            aria-label={t("academicCatalogManagement.versionCode")}
            value={version.versionCode}
            onChange={(event) =>
              setVersion({ ...version, versionCode: event.target.value })
            }
          />
          <input
            className={inputClass}
            required
            minLength={10}
            placeholder={t("academicCatalogManagement.sourceReference")}
            aria-label={t("academicCatalogManagement.versionSourceReference")}
            value={version.sourceReference}
            onChange={(event) =>
              setVersion({ ...version, sourceReference: event.target.value })
            }
          />
          <input
            className={inputClass}
            required
            type="date"
            aria-label={t("academicCatalogManagement.effectiveDate")}
            value={version.effectiveFromUtc}
            onChange={(event) =>
              setVersion({ ...version, effectiveFromUtc: event.target.value })
            }
          />
          <button
            className="rounded-lg bg-primary px-3 py-2 font-bold disabled:opacity-50"
            disabled={write.isPending}
          >
            {t("academicCatalogManagement.addVersion")}
          </button>
        </form>
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save("/admin/academic-catalogue/units", "POST", {
              ...unit,
              arabicTitle: unit.arabicTitle || unit.englishTitle,
            });
          }}
        >
          <h3 className="font-bold">
            {t("academicCatalogManagement.customUnit")}
          </h3>
          <p className="text-xs text-muted">
            {t(
              "academicCatalogManagement.createdAsADraftActivationPublishesAndLocksItsAcademicIdentity",
            )}
          </p>
          <select
            className={inputClass}
            required
            aria-label={t("academicCatalogManagement.customUnitVersion")}
            value={unit.qualificationVersionId}
            onChange={(event) =>
              setUnit({ ...unit, qualificationVersionId: event.target.value })
            }
          >
            <option value="">
              {t("academicCatalogManagement.chooseVersion")}
            </option>
            {versionChoices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <input
            className={inputClass}
            required
            placeholder={t("academicCatalogManagement.unitNumber")}
            aria-label={t("academicCatalogManagement.unitCode")}
            value={unit.code}
            onChange={(event) => setUnit({ ...unit, code: event.target.value })}
          />
          <input
            className={inputClass}
            required
            placeholder={t("academicCatalogManagement.englishTitle")}
            aria-label={t("academicCatalogManagement.unitEnglishTitle")}
            value={unit.englishTitle}
            onChange={(event) =>
              setUnit({ ...unit, englishTitle: event.target.value })
            }
          />
          <input
            className={inputClass}
            placeholder={t(
              "academicCatalogManagement.localArabicDisplayOptional",
            )}
            aria-label={t("academicCatalogManagement.unitLocalArabicDisplay")}
            value={unit.arabicTitle}
            onChange={(event) =>
              setUnit({ ...unit, arabicTitle: event.target.value })
            }
          />
          <input
            className={inputClass}
            placeholder={t("academicCatalogManagement.sourceReference")}
            aria-label={t("academicCatalogManagement.unitSourceReference")}
            value={unit.sourceReference}
            onChange={(event) =>
              setUnit({ ...unit, sourceReference: event.target.value })
            }
          />
          <button
            className="rounded-lg bg-primary px-3 py-2 font-bold disabled:opacity-50"
            disabled={write.isPending}
          >
            {t("academicCatalogManagement.addUnit")}
          </button>
        </form>
      </div>
      <div className="mt-6">
        <h3 className="font-bold">
          {t("academicCatalogManagement.qualificationsAndVersions")}
        </h3>
        <ul className="mt-2 grid gap-2 text-sm">
          {qualifications.data?.map((item) => (
            <li
              key={item.id}
              className="min-w-0 rounded-lg border border-border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="break-words font-bold">
                  {item.code} ·{" "}
                  {academicText(locale, item.arabicName, item.englishName)} ·{" "}
                  {item.source}
                  <span
                    className="mt-1 block text-xs font-normal text-muted"
                    lang={ar ? "en" : "ar"}
                  >
                    {ar ? item.englishName : item.arabicName}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={write.isPending}
                  className="underline disabled:opacity-50"
                  onClick={() =>
                    save(
                      `/admin/academic-records/qualifications/${item.id}/status`,
                      "PUT",
                      { isActive: !item.isActive },
                    )
                  }
                >
                  {item.isActive
                    ? t("academicCatalogManagement.archive")
                    : t("academicCatalogManagement.activate")}
                </button>
              </div>
              <ul className="mt-2 grid gap-1">
                {item.versions.map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-2 ps-3"
                  >
                    <span>
                      {v.versionCode} · {v.source}
                    </span>
                    <button
                      type="button"
                      disabled={write.isPending}
                      className="underline disabled:opacity-50"
                      onClick={() =>
                        save(
                          `/admin/academic-records/versions/${v.id}/status`,
                          "PUT",
                          { isActive: !v.isActive },
                        )
                      }
                    >
                      {v.isActive
                        ? t("academicCatalogManagement.archive")
                        : t("academicCatalogManagement.activate")}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
      {message && (
        <p className="mt-3 text-sm" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
