"use client";

import { api } from "@/lib/api";
import { academicText } from "@/lib/academic-localization";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import styles from "./academic-catalog-management.module.css";

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

function QueryState({
  query,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    isFetching: boolean;
    data: unknown;
    refetch: () => unknown;
  };
}) {
  const t = useTranslations("adminWorkspace.academicCatalogManagement");
  if (query.isPending)
    return (
      <p className={styles.notice} role="status" aria-busy="true">
        {t("loading")}
      </p>
    );
  if (!query.isError) return null;
  return (
    <div
      className={styles.notice}
      data-tone={query.data === undefined ? "danger" : "warning"}
      role="alert"
    >
      <span>
        {t(
          query.data === undefined
            ? "couldNotLoadTheCatalogue"
            : "refreshWarning",
        )}
      </span>
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

export function AcademicCatalogManagement() {
  const locale = useLocale();
  const t = useTranslations("adminWorkspace");
  const ar = locale === "ar";
  const client = useQueryClient();
  const [message, setMessage] = useState("");
  const [operation, setOperation] = useState("specializations");
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
    if (write.isPending) return;
    setMessage("");
    setOperation(
      path.startsWith("/admin/academic-taxonomy/specializations")
        ? "specializations"
        : path.startsWith("/admin/academic-taxonomy/grades")
          ? "grades"
          : path === "/qualification-registry/qualifications"
            ? "customQualification"
            : path === "/qualification-registry/versions"
              ? "customVersion"
              : path === "/admin/academic-catalogue/units"
                ? "customUnit"
                : "qualificationsAndVersions",
    );
    write.mutate({ path, method, body });
  };
  const inputClass = styles.control;
  const track = taxonomy.data?.tracks.find((item) => item.isBtecFocused);
  return (
    <section
      className={styles.workspace}
      aria-label={t("academicCatalogManagement.manageAcademicCatalogue")}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>
          {t("academicCatalogManagement.manageTaxonomyAndCatalogue")}
        </h2>
        <p className={styles.description}>
          {t("academicCatalogManagement.workspaceHelp")}
        </p>
        <QueryState query={taxonomy} />
        {taxonomy.data !== undefined && (
          <p className={styles.context}>
            <strong>{t("academicCatalogManagement.trackContext")}</strong>
            <span dir="auto">
              {trackId
                ? track?.name
                : t("academicCatalogManagement.noBtecTrack")}
            </span>
          </p>
        )}
        <ol
          className={styles.chain}
          aria-label={t("academicCatalogManagement.authoringSequence")}
        >
          {[
            "trackContext",
            "taxonomyRegistry",
            "customQualification",
            "customVersion",
            "customUnit",
          ].map((key) => (
            <li key={key}>{t(`academicCatalogManagement.${key}`)}</li>
          ))}
        </ol>
        {(message || write.isPending) && (
          <div
            className={styles.notice}
            role={write.isError ? "alert" : "status"}
            data-tone={write.isError ? "danger" : "info"}
            aria-busy={write.isPending}
          >
            <strong>{t(`academicCatalogManagement.${operation}`)}</strong>
            <span>
              {write.isPending
                ? t("academicCatalogManagement.saving")
                : message}
            </span>
          </div>
        )}
      </header>
      <section
        aria-label={t("academicCatalogManagement.taxonomyRegistry")}
        className={styles.taxonomy}
      >
        <section
          className={styles.panel}
          aria-label={t("academicCatalogManagement.specializations")}
        >
          <h3 className={styles.sectionTitle}>
            {t("academicCatalogManagement.specializations")}
          </h3>
          <QueryState query={specializations} />
          {taxonomy.data !== undefined &&
            trackId &&
            specializations.data !== undefined && (
              <>
                {specializations.data.filter(
                  (item) => item.learningTrackId === trackId,
                ).length === 0 && (
                  <p className={styles.empty}>
                    {t("academicCatalogManagement.noSpecializations")}
                  </p>
                )}
                <ul className={styles.rows}>
                  {specializations.data
                    .filter((item) => item.learningTrackId === trackId)
                    .map((item) => (
                      <li key={item.id} className={styles.row}>
                        <div className={styles.identity}>
                          <strong>
                            {academicText(
                              locale,
                              item.arabicName,
                              item.englishName,
                            )}
                          </strong>
                          <span lang={ar ? "en" : "ar"} dir="auto">
                            {ar ? item.englishName : item.arabicName}
                          </span>
                          <span className={styles.meta} dir="auto">
                            {item.slug}
                          </span>
                        </div>
                        <span
                          className={styles.status}
                          data-active={item.isVisible}
                        >
                          {t(
                            item.isVisible
                              ? "academicCatalogManagement.visible"
                              : "academicCatalogManagement.archived",
                          )}
                        </span>
                        <button
                          type="button"
                          disabled={write.isPending}
                          className={styles.secondary}
                          onClick={() =>
                            save(
                              `/admin/academic-taxonomy/specializations/${item.id}`,
                              "PUT",
                              { ...item, isVisible: !item.isVisible },
                            )
                          }
                        >
                          {t(
                            item.isVisible
                              ? "academicCatalogManagement.archive"
                              : "academicCatalogManagement.activate",
                          )}
                        </button>
                      </li>
                    ))}
                </ul>
              </>
            )}
          <div className={styles.editor}>
            <form
              className={styles.form}
              aria-label={t(
                "academicCatalogManagement.newCustomSpecialization",
              )}
              onSubmit={(event) => {
                event.preventDefault();
                if (!trackId) return;
                save("/admin/academic-taxonomy/specializations", "POST", {
                  ...specialization,
                  learningTrackId: trackId,
                  sortOrder: 100,
                });
              }}
            >
              <h3 className={styles.sectionTitle}>
                {t("academicCatalogManagement.newCustomSpecialization")}
              </h3>
              <p className={styles.hint}>
                {t("academicCatalogManagement.specializationHelp")}
              </p>
              <div className={styles.fields}>
                <label className={styles.field}>
                  <span>
                    {t("academicCatalogManagement.specializationSlug")}
                  </span>
                  <input
                    className={inputClass}
                    required
                    placeholder="slug"
                    aria-label={t(
                      "academicCatalogManagement.specializationSlug",
                    )}
                    value={specialization.slug}
                    onChange={(event) =>
                      setSpecialization({
                        ...specialization,
                        slug: event.target.value,
                      })
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>
                    {t("academicCatalogManagement.specializationArabicName")}
                  </span>
                  <input
                    className={inputClass}
                    required
                    placeholder={t("academicCatalogManagement.arabicName")}
                    aria-label={t(
                      "academicCatalogManagement.specializationArabicName",
                    )}
                    value={specialization.arabicName}
                    onChange={(event) =>
                      setSpecialization({
                        ...specialization,
                        arabicName: event.target.value,
                      })
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>
                    {t("academicCatalogManagement.specializationEnglishName")}
                  </span>
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
                </label>
              </div>
              <button
                className={styles.primary}
                disabled={write.isPending || !trackId}
              >
                {t("academicCatalogManagement.addSpecialization")}
              </button>
            </form>
          </div>
        </section>
        <section
          className={styles.panel}
          aria-label={t("academicCatalogManagement.grades")}
        >
          <h3 className={styles.sectionTitle}>
            {t("academicCatalogManagement.grades")}
          </h3>
          <QueryState query={grades} />
          {taxonomy.data !== undefined &&
            trackId &&
            grades.data !== undefined && (
              <>
                {grades.data.filter((item) => item.learningTrackId === trackId)
                  .length === 0 && (
                  <p className={styles.empty}>
                    {t("academicCatalogManagement.noGrades")}
                  </p>
                )}
                <ul className={styles.rows}>
                  {grades.data
                    .filter((item) => item.learningTrackId === trackId)
                    .map((item) => (
                      <li key={item.id} className={styles.row}>
                        <div className={styles.identity}>
                          <strong>
                            {academicText(
                              locale,
                              item.arabicName,
                              item.englishName,
                            )}
                          </strong>
                          <span lang={ar ? "en" : "ar"} dir="auto">
                            {ar ? item.englishName : item.arabicName}
                          </span>
                          <span className={styles.meta} dir="auto">
                            {item.slug}
                          </span>
                        </div>
                        <span
                          className={styles.status}
                          data-active={item.isVisible}
                        >
                          {t(
                            item.isVisible
                              ? "academicCatalogManagement.visible"
                              : "academicCatalogManagement.archived",
                          )}
                        </span>
                        <button
                          type="button"
                          disabled={write.isPending}
                          className={styles.secondary}
                          onClick={() =>
                            save(
                              `/admin/academic-taxonomy/grades/${item.id}`,
                              "PUT",
                              { ...item, isVisible: !item.isVisible },
                            )
                          }
                        >
                          {t(
                            item.isVisible
                              ? "academicCatalogManagement.archive"
                              : "academicCatalogManagement.activate",
                          )}
                        </button>
                      </li>
                    ))}
                </ul>
              </>
            )}
          <div className={styles.editor}>
            <form
              className={styles.form}
              aria-label={t("academicCatalogManagement.newGrade")}
              onSubmit={(event) => {
                event.preventDefault();
                if (!trackId) return;
                save("/admin/academic-taxonomy/grades", "POST", {
                  ...grade,
                  learningTrackId: trackId,
                  sortOrder: 100,
                });
              }}
            >
              <h3 className={styles.sectionTitle}>
                {t("academicCatalogManagement.newGrade")}
              </h3>
              <p className={styles.hint}>
                {t("academicCatalogManagement.gradeHelp")}
              </p>
              <div className={styles.fields}>
                <label className={styles.field}>
                  <span>{t("academicCatalogManagement.gradeSlug")}</span>
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
                </label>
                <label className={styles.field}>
                  <span>{t("academicCatalogManagement.gradeArabicName")}</span>
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
                </label>
                <label className={styles.field}>
                  <span>{t("academicCatalogManagement.gradeEnglishName")}</span>
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
                </label>
              </div>
              <button
                className={styles.primary}
                disabled={write.isPending || !trackId}
              >
                {t("academicCatalogManagement.addGrade")}
              </button>
            </form>
          </div>
        </section>
      </section>
      <section
        className={styles.authoring}
        aria-label={t("academicCatalogManagement.customAuthoring")}
      >
        <form
          className={styles.form}
          aria-label={t("academicCatalogManagement.customQualification")}
          onSubmit={(event) => {
            event.preventDefault();
            save(
              "/qualification-registry/qualifications",
              "POST",
              qualification,
            );
          }}
        >
          <h3 className={styles.sectionTitle}>
            {t("academicCatalogManagement.customQualification")}
          </h3>
          <p className={styles.hint}>
            {t("academicCatalogManagement.qualificationHelp")}
          </p>
          <div className={styles.fields}>
            <label className={styles.field}>
              <span>
                {t("academicCatalogManagement.qualificationSpecialization")}
              </span>
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
                    (item) =>
                      item.isVisible && item.learningTrackId === trackId,
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {ar ? item.arabicName : item.englishName}
                    </option>
                  ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>{t("academicCatalogManagement.qualificationCode")}</span>
              <input
                className={inputClass}
                required
                placeholder={t("academicCatalogManagement.qualificationCode")}
                aria-label={t("academicCatalogManagement.qualificationCode")}
                value={qualification.code}
                onChange={(event) =>
                  setQualification({
                    ...qualification,
                    code: event.target.value,
                  })
                }
              />
            </label>
            <label className={styles.field}>
              <span>
                {t("academicCatalogManagement.qualificationArabicName")}
              </span>
              <input
                className={inputClass}
                required
                placeholder={t("academicCatalogManagement.localArabicName")}
                aria-label={t(
                  "academicCatalogManagement.qualificationArabicName",
                )}
                value={qualification.arabicName}
                onChange={(event) =>
                  setQualification({
                    ...qualification,
                    arabicName: event.target.value,
                  })
                }
              />
            </label>
            <label className={styles.field}>
              <span>
                {t("academicCatalogManagement.qualificationEnglishName")}
              </span>
              <input
                className={inputClass}
                required
                placeholder={t("academicCatalogManagement.englishName")}
                aria-label={t(
                  "academicCatalogManagement.qualificationEnglishName",
                )}
                value={qualification.englishName}
                onChange={(event) =>
                  setQualification({
                    ...qualification,
                    englishName: event.target.value,
                  })
                }
              />
            </label>
          </div>
          <button className={styles.primary} disabled={write.isPending}>
            {t("academicCatalogManagement.addQualification")}
          </button>
        </form>
        <form
          className={styles.form}
          aria-label={t("academicCatalogManagement.customVersion")}
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
          <h3 className={styles.sectionTitle}>
            {t("academicCatalogManagement.customVersion")}
          </h3>
          <p className={styles.hint}>
            {t("academicCatalogManagement.versionHelp")}
          </p>
          <div className={styles.fields}>
            <label className={styles.field}>
              <span>{t("academicCatalogManagement.qualification")}</span>
              <select
                className={inputClass}
                required
                aria-label={t("academicCatalogManagement.qualification")}
                value={version.qualificationId}
                onChange={(event) =>
                  setVersion({
                    ...version,
                    qualificationId: event.target.value,
                  })
                }
              >
                <option value="">
                  {t("academicCatalogManagement.chooseQualification")}
                </option>
                {qualifications.data
                  ?.filter(
                    (item) => item.isActive && item.source === "AdminCustom",
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} ·{" "}
                      {academicText(locale, item.arabicName, item.englishName)}
                    </option>
                  ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>{t("academicCatalogManagement.versionCode")}</span>
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
            </label>
            <label className={styles.field}>
              <span>
                {t("academicCatalogManagement.versionSourceReference")}
              </span>
              <input
                className={inputClass}
                required
                minLength={10}
                placeholder={t("academicCatalogManagement.sourceReference")}
                aria-label={t(
                  "academicCatalogManagement.versionSourceReference",
                )}
                value={version.sourceReference}
                onChange={(event) =>
                  setVersion({
                    ...version,
                    sourceReference: event.target.value,
                  })
                }
              />
            </label>
            <label className={styles.field}>
              <span>{t("academicCatalogManagement.effectiveDate")}</span>
              <input
                className={inputClass}
                required
                type="date"
                aria-label={t("academicCatalogManagement.effectiveDate")}
                value={version.effectiveFromUtc}
                onChange={(event) =>
                  setVersion({
                    ...version,
                    effectiveFromUtc: event.target.value,
                  })
                }
              />
            </label>
          </div>
          <button className={styles.primary} disabled={write.isPending}>
            {t("academicCatalogManagement.addVersion")}
          </button>
        </form>
        <form
          className={styles.form}
          aria-label={t("academicCatalogManagement.customUnit")}
          onSubmit={(event) => {
            event.preventDefault();
            save("/admin/academic-catalogue/units", "POST", {
              ...unit,
              arabicTitle: unit.arabicTitle || unit.englishTitle,
            });
          }}
        >
          <h3 className={styles.sectionTitle}>
            {t("academicCatalogManagement.customUnit")}
          </h3>
          <p className={styles.hint}>
            {t("academicCatalogManagement.unitHelp")}
          </p>
          <p className={styles.hint}>
            {t(
              "academicCatalogManagement.createdAsADraftActivationPublishesAndLocksItsAcademicIdentity",
            )}
          </p>
          <div className={styles.fields}>
            <label className={styles.field}>
              <span>{t("academicCatalogManagement.customUnitVersion")}</span>
              <select
                className={inputClass}
                required
                aria-label={t("academicCatalogManagement.customUnitVersion")}
                value={unit.qualificationVersionId}
                onChange={(event) =>
                  setUnit({
                    ...unit,
                    qualificationVersionId: event.target.value,
                  })
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
            </label>
            <label className={styles.field}>
              <span>{t("academicCatalogManagement.unitCode")}</span>
              <input
                className={inputClass}
                required
                placeholder={t("academicCatalogManagement.unitNumber")}
                aria-label={t("academicCatalogManagement.unitCode")}
                value={unit.code}
                onChange={(event) =>
                  setUnit({ ...unit, code: event.target.value })
                }
              />
            </label>
            <label className={styles.field}>
              <span>{t("academicCatalogManagement.unitEnglishTitle")}</span>
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
            </label>
            <label className={styles.field}>
              <span>
                {t("academicCatalogManagement.unitLocalArabicDisplay")}
              </span>
              <input
                className={inputClass}
                placeholder={t(
                  "academicCatalogManagement.localArabicDisplayOptional",
                )}
                aria-label={t(
                  "academicCatalogManagement.unitLocalArabicDisplay",
                )}
                value={unit.arabicTitle}
                onChange={(event) =>
                  setUnit({ ...unit, arabicTitle: event.target.value })
                }
              />
            </label>
            <label className={styles.field}>
              <span>{t("academicCatalogManagement.unitSourceReference")}</span>
              <input
                className={inputClass}
                placeholder={t("academicCatalogManagement.sourceReference")}
                aria-label={t("academicCatalogManagement.unitSourceReference")}
                value={unit.sourceReference}
                onChange={(event) =>
                  setUnit({ ...unit, sourceReference: event.target.value })
                }
              />
            </label>
          </div>
          <button className={styles.primary} disabled={write.isPending}>
            {t("academicCatalogManagement.addUnit")}
          </button>
        </form>
      </section>{" "}
      <section
        className={styles.panel}
        aria-label={t("academicCatalogManagement.qualificationsAndVersions")}
      >
        <h3 className={styles.sectionTitle}>
          {t("academicCatalogManagement.qualificationsAndVersions")}
        </h3>
        <p className={styles.hint}>
          {t("academicCatalogManagement.registryHelp")}
        </p>
        <QueryState query={qualifications} />
        {qualifications.data !== undefined &&
          qualifications.data.length === 0 && (
            <p className={styles.empty}>
              {t("academicCatalogManagement.noQualifications")}
            </p>
          )}
        <ul className={styles.rows}>
          {qualifications.data?.map((item) => (
            <li key={item.id} className={styles.qualificationRow}>
              <div className={styles.row}>
                <span className={styles.identity}>
                  {item.code} ·{" "}
                  {academicText(locale, item.arabicName, item.englishName)} ·{" "}
                  {item.source}
                  <span className={styles.meta} lang={ar ? "en" : "ar"}>
                    {ar ? item.englishName : item.arabicName}
                  </span>
                </span>
                <span className={styles.status} data-active={item.isActive}>
                  {t(
                    item.isActive
                      ? "academicCatalogManagement.active"
                      : "academicCatalogManagement.archived",
                  )}
                </span>
                <button
                  type="button"
                  disabled={write.isPending}
                  className={styles.secondary}
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
              <p className={styles.hint}>
                {t("academicCatalogManagement.versionStatusHelp")}
              </p>
              {item.versions.length === 0 && (
                <p className={styles.empty}>
                  {t("academicCatalogManagement.noVersions")}
                </p>
              )}
              <ul
                className={styles.versions}
                aria-label={t("academicCatalogManagement.versions")}
              >
                {item.versions.map((v) => (
                  <li key={v.id} className={styles.versionRow}>
                    <span>
                      {t("academicCatalogManagement.version")} · {v.versionCode}{" "}
                      · {v.source}
                      <span className={styles.meta} dir="auto">
                        {v.sourceReference}
                      </span>
                    </span>
                    <span className={styles.status} data-active={v.isActive}>
                      {t(
                        v.isActive
                          ? "academicCatalogManagement.active"
                          : "academicCatalogManagement.archived",
                      )}
                    </span>
                    <button
                      type="button"
                      disabled={write.isPending}
                      className={styles.secondary}
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
      </section>
    </section>
  );
}
