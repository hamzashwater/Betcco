"use client";

import { formatLocalizedDateTime } from "@/i18n/date-time";
import { formatLocalizedCurrency } from "@/i18n/number-format";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  ClipboardList,
  FileText,
  PackageCheck,
  UsersRound,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import styles from "./content-studio.module.css";

type TeacherOption = {
  id: string;
  displayName: string;
  email: string;
  isFrozen: boolean;
  profile?: {
    arabicBio?: string;
    englishBio?: string;
    arabicSpecializations?: string;
    englishSpecializations?: string;
    isPublic: boolean;
  };
};
type CourseOption = {
  id: string;
  arabicTitle: string;
  englishTitle: string;
  price: number;
  currency: string;
};
type BlogItem = {
  id: string;
  slug: string;
  arabicTitle: string;
  englishTitle: string;
  isPublished: boolean;
  publishedAtUtc?: string;
};
type PackageItem = {
  id: string;
  slug: string;
  arabicTitle: string;
  englishTitle: string;
  arabicDescription: string;
  englishDescription: string;
  price: number;
  currency: string;
  isPublished: boolean;
  availableFromUtc?: string;
  availableUntilUtc?: string;
  courseIds: string[];
};
type SessionItem = {
  id: string;
  courseId?: string;
  arabicTitle: string;
  englishTitle: string;
  provider: string;
  recordingUrl?: string;
  startsAtUtc: string;
  isPublished: boolean;
};
type LiveSessionProviderItem = {
  id: string;
  arabicName: string;
  englishName: string;
  supportsManagedMeetings: boolean;
  arabicDescription: string;
  englishDescription: string;
};
type StudentOption = { id: string; displayName: string; email: string };
type AttendanceItem = {
  id: string;
  studentUserId: string;
  studentName: string;
  status: "Present" | "Late" | "Absent" | "Excused";
  joinedAtUtc: string;
  markedAtUtc?: string;
};

const initialArticle = {
  slug: "",
  arabicTitle: "",
  englishTitle: "",
  arabicExcerpt: "",
  englishExcerpt: "",
  arabicBody: "",
  englishBody: "",
  isPublished: false,
};
const initialPackage = {
  slug: "",
  arabicTitle: "",
  englishTitle: "",
  arabicDescription: "",
  englishDescription: "",
  price: "",
  availableFromUtc: "",
  availableUntilUtc: "",
  isPublished: false,
  courseIds: [] as string[],
};
const initialSession = {
  courseId: "",
  hostUserId: "",
  arabicTitle: "",
  englishTitle: "",
  arabicDescription: "",
  englishDescription: "",
  provider: "Manual",
  joinUrl: "",
  recordingUrl: "",
  startsAtUtc: "",
  endsAtUtc: "",
  capacity: "",
  isPublished: false,
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

const inputClass = styles.input;

export function ContentStudio() {
  const locale = useLocale();
  const t = useTranslations("adminContent");
  const client = useQueryClient();
  const [workspace, setWorkspace] = useState("articles");
  const [article, setArticle] = useState(initialArticle);
  const [profile, setProfile] = useState({
    teacherId: "",
    arabicBio: "",
    englishBio: "",
    arabicSpecializations: "",
    englishSpecializations: "",
    isPublic: false,
  });
  const [packageValue, setPackageValue] = useState(initialPackage);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [session, setSession] = useState(initialSession);
  const [attendanceSessionId, setAttendanceSessionId] = useState("");
  const [attendanceStudentId, setAttendanceStudentId] = useState("");
  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceItem["status"]>("Present");
  const teachers = useQuery({
    queryKey: ["admin-content-teachers"],
    queryFn: () => api<TeacherOption[]>("/admin/content/teachers"),
  });
  const courses = useQuery({
    queryKey: ["admin-content-courses"],
    queryFn: () => api<CourseOption[]>("/admin/content/courses"),
  });
  const blog = useQuery({
    queryKey: ["admin-content-blog"],
    queryFn: () => api<BlogItem[]>("/admin/content/blog"),
  });
  const packages = useQuery({
    queryKey: ["admin-content-packages"],
    queryFn: () => api<PackageItem[]>("/admin/content/packages"),
  });
  const sessions = useQuery({
    queryKey: ["admin-content-sessions"],
    queryFn: () => api<SessionItem[]>("/admin/content/live-sessions"),
  });
  const liveSessionProviders = useQuery({
    queryKey: ["admin-live-session-providers"],
    queryFn: () =>
      api<LiveSessionProviderItem[]>("/admin/content/live-session-providers"),
  });
  const students = useQuery({
    queryKey: ["admin-content-students"],
    queryFn: () =>
      api<{ items: StudentOption[] }>("/admin/users?role=Student&pageSize=100"),
  });
  const attendance = useQuery({
    queryKey: ["admin-live-attendance", attendanceSessionId],
    queryFn: () =>
      api<AttendanceItem[]>(
        `/admin/content/live-sessions/${attendanceSessionId}/attendance`,
      ),
    enabled: Boolean(attendanceSessionId),
  });
  const refresh = (key: string) =>
    client.invalidateQueries({ queryKey: [key] });
  const createArticle = useMutation({
    mutationFn: () =>
      api("/admin/content/blog", {
        method: "POST",
        body: JSON.stringify(article),
      }),
    onSuccess: () => {
      setArticle(initialArticle);
      refresh("admin-content-blog");
    },
  });
  const saveProfile = useMutation({
    mutationFn: () =>
      api(`/admin/content/teachers/${profile.teacherId}/profile`, {
        method: "PUT",
        body: JSON.stringify({
          arabicBio: profile.arabicBio || null,
          englishBio: profile.englishBio || null,
          arabicSpecializations: profile.arabicSpecializations || null,
          englishSpecializations: profile.englishSpecializations || null,
          isPublic: profile.isPublic,
        }),
      }),
    onSuccess: () => {
      refresh("admin-content-teachers");
    },
  });
  const savePackage = useMutation({
    mutationFn: () =>
      api(
        selectedPackageId
          ? `/admin/content/packages/${selectedPackageId}`
          : "/admin/content/packages",
        {
          method: selectedPackageId ? "PUT" : "POST",
          body: JSON.stringify({
            ...packageValue,
            price: Number(packageValue.price),
            availableFromUtc: packageValue.availableFromUtc
              ? new Date(packageValue.availableFromUtc).toISOString()
              : null,
            availableUntilUtc: packageValue.availableUntilUtc
              ? new Date(packageValue.availableUntilUtc).toISOString()
              : null,
          }),
        },
      ),
    onSuccess: () => {
      setPackageValue(initialPackage);
      setSelectedPackageId("");
      refresh("admin-content-packages");
    },
  });
  const createSession = useMutation({
    mutationFn: () =>
      api("/admin/content/live-sessions", {
        method: "POST",
        body: JSON.stringify({
          ...session,
          courseId: session.courseId || null,
          joinUrl: session.joinUrl || null,
          recordingUrl: session.recordingUrl || null,
          arabicDescription: session.arabicDescription || null,
          englishDescription: session.englishDescription || null,
          startsAtUtc: new Date(session.startsAtUtc).toISOString(),
          endsAtUtc: new Date(session.endsAtUtc).toISOString(),
          capacity: session.capacity ? Number(session.capacity) : null,
        }),
      }),
    onSuccess: () => {
      setSession(initialSession);
      refresh("admin-content-sessions");
    },
  });
  const markAttendance = useMutation({
    mutationFn: ({
      studentUserId,
      status,
    }: {
      studentUserId: string;
      status: AttendanceItem["status"];
    }) =>
      api(`/admin/content/live-sessions/${attendanceSessionId}/attendance`, {
        method: "PUT",
        body: JSON.stringify({ studentUserId, status }),
      }),
    onSuccess: () => {
      setAttendanceStudentId("");
      client.invalidateQueries({
        queryKey: ["admin-live-attendance", attendanceSessionId],
      });
    },
  });
  function selectTeacher(teacherId: string) {
    saveProfile.reset();
    const selected = teachers.data?.find((teacher) => teacher.id === teacherId);
    setProfile({
      teacherId,
      arabicBio: selected?.profile?.arabicBio ?? "",
      englishBio: selected?.profile?.englishBio ?? "",
      arabicSpecializations: selected?.profile?.arabicSpecializations ?? "",
      englishSpecializations: selected?.profile?.englishSpecializations ?? "",
      isPublic: selected?.profile?.isPublic ?? false,
    });
  }
  function toggleCourse(courseId: string) {
    setPackageValue((value) => ({
      ...value,
      courseIds: value.courseIds.includes(courseId)
        ? value.courseIds.filter((id) => id !== courseId)
        : [...value.courseIds, courseId],
    }));
  }
  function selectPackage(packageId: string) {
    savePackage.reset();
    setSelectedPackageId(packageId);
    const selected = packages.data?.find((item) => item.id === packageId);
    if (!selected) {
      setPackageValue(initialPackage);
      return;
    }
    setPackageValue({
      slug: selected.slug,
      arabicTitle: selected.arabicTitle,
      englishTitle: selected.englishTitle,
      arabicDescription: selected.arabicDescription,
      englishDescription: selected.englishDescription,
      price: selected.price.toString(),
      availableFromUtc: toLocalDateTime(selected.availableFromUtc),
      availableUntilUtc: toLocalDateTime(selected.availableUntilUtc),
      isPublished: selected.isPublished,
      courseIds: selected.courseIds,
    });
  }
  const selectedLiveProvider = liveSessionProviders.data?.find(
    (provider) => provider.id === session.provider,
  );
  const sections = [
    { id: "articles", label: t("articlesNav"), icon: FileText },
    { id: "teachers", label: t("teachersNav"), icon: UsersRound },
    { id: "packages", label: t("packagesNav"), icon: PackageCheck },
    { id: "sessions", label: t("sessionsNav"), icon: CalendarClock },
    { id: "attendance", label: t("attendance"), icon: ClipboardList },
  ];
  return (
    <section className={`shell ${styles.workspace}`}>
      <header className={styles.header}>
        <h1>{t("title")}</h1>
        <p>{t("description")}</p>
      </header>
      <nav aria-label={t("workspaceNavigation")} className={styles.navigation}>
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={workspace === id}
            aria-controls={`content-${id}`}
            onClick={() => setWorkspace(id)}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>
      <p className={styles.draftHint}>{t("draftHint")}</p>
      <section
        id="content-articles"
        aria-label={t("articlesNav")}
        hidden={workspace !== "articles"}
        className={styles.panel}
      >
        <div className={styles.panelLayout}>
          {" "}
          <form
            className={styles.editor}
            aria-label={t("article")}
            onSubmit={(event) => {
              event.preventDefault();
              if (!createArticle.isPending) createArticle.mutate();
            }}
          >
            <SectionHeading icon={FileText} title={t("article")} />
            <Field label={t("slug")}>
              <input
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={article.slug}
                onChange={(event) =>
                  setArticle({ ...article, slug: event.target.value })
                }
                className={inputClass}
                dir="ltr"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("arabicTitle")}>
                <input
                  required
                  value={article.arabicTitle}
                  onChange={(event) =>
                    setArticle({ ...article, arabicTitle: event.target.value })
                  }
                  className={inputClass}
                />
              </Field>
              <Field label={t("englishTitle")}>
                <input
                  required
                  value={article.englishTitle}
                  onChange={(event) =>
                    setArticle({ ...article, englishTitle: event.target.value })
                  }
                  className={inputClass}
                  dir="ltr"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("arabicExcerpt")}>
                <textarea
                  required
                  value={article.arabicExcerpt}
                  onChange={(event) =>
                    setArticle({
                      ...article,
                      arabicExcerpt: event.target.value,
                    })
                  }
                  className={`${inputClass} min-h-20`}
                />
              </Field>
              <Field label={t("englishExcerpt")}>
                <textarea
                  required
                  value={article.englishExcerpt}
                  onChange={(event) =>
                    setArticle({
                      ...article,
                      englishExcerpt: event.target.value,
                    })
                  }
                  className={`${inputClass} min-h-20`}
                  dir="ltr"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("arabicBody")}>
                <textarea
                  required
                  value={article.arabicBody}
                  onChange={(event) =>
                    setArticle({ ...article, arabicBody: event.target.value })
                  }
                  className={`${inputClass} min-h-36`}
                />
              </Field>
              <Field label={t("englishBody")}>
                <textarea
                  required
                  value={article.englishBody}
                  onChange={(event) =>
                    setArticle({ ...article, englishBody: event.target.value })
                  }
                  className={`${inputClass} min-h-36`}
                  dir="ltr"
                />
              </Field>
            </div>
            <PublishToggle
              checked={article.isPublished}
              onChange={(isPublished) =>
                setArticle({ ...article, isPublished })
              }
              label={t("publish")}
            />
            <OperationFeedback
              mutation={createArticle}
              t={t}
              success={t("articleSaved")}
            />
            <SaveButton
              busy={createArticle.isPending}
              label={t("save")}
              busyLabel={t("saving")}
            />
          </form>
          <aside className={styles.records}>
            <h3>{t("recent")}</h3>
            <ReadState
              query={blog}
              t={t}
              empty={!blog.data?.length}
              emptyText={t("noArticles")}
            />
            {blog.data?.length ? (
              <ul>
                {blog.data.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <p className={styles.recordTitle}>
                      {locale === "ar" ? item.arabicTitle : item.englishTitle}
                    </p>
                    <p className={styles.hint}>{item.slug}</p>
                    <span className={styles.badge}>
                      {item.isPublished ? t("publishedState") : t("draftState")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </aside>
        </div>
      </section>
      <section
        id="content-teachers"
        aria-label={t("teachersNav")}
        hidden={workspace !== "teachers"}
        className={styles.panel}
      >
        <div className={styles.panelLayout}>
          {" "}
          <form
            className={styles.editor}
            aria-label={t("teacher")}
            onSubmit={(event) => {
              event.preventDefault();
              if (profile.teacherId && !saveProfile.isPending)
                saveProfile.mutate();
            }}
          >
            <SectionHeading icon={UsersRound} title={t("teacher")} />
            <ReadState
              query={teachers}
              t={t}
              empty={!teachers.data?.filter((x) => !x.isFrozen).length}
              emptyText={t("noTeachers")}
            />
            <Field label={t("chooseTeacher")}>
              <select
                required
                disabled={saveProfile.isPending}
                value={profile.teacherId}
                onChange={(event) => selectTeacher(event.target.value)}
                className={inputClass}
              >
                <option value="">—</option>
                {teachers.data
                  ?.filter((teacher) => !teacher.isFrozen)
                  .map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.displayName} · {teacher.email}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("arabicBio")}>
                <textarea
                  value={profile.arabicBio}
                  onChange={(event) =>
                    setProfile({ ...profile, arabicBio: event.target.value })
                  }
                  className={`${inputClass} min-h-28`}
                />
              </Field>
              <Field label={t("englishBio")}>
                <textarea
                  value={profile.englishBio}
                  onChange={(event) =>
                    setProfile({ ...profile, englishBio: event.target.value })
                  }
                  className={`${inputClass} min-h-28`}
                  dir="ltr"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("arabicSpecializations")}>
                <input
                  value={profile.arabicSpecializations}
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      arabicSpecializations: event.target.value,
                    })
                  }
                  className={inputClass}
                />
              </Field>
              <Field label={t("englishSpecializations")}>
                <input
                  value={profile.englishSpecializations}
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      englishSpecializations: event.target.value,
                    })
                  }
                  className={inputClass}
                  dir="ltr"
                />
              </Field>
            </div>
            <PublishToggle
              checked={profile.isPublic}
              onChange={(isPublic) => setProfile({ ...profile, isPublic })}
              label={t("showProfile")}
            />
            <OperationFeedback
              mutation={saveProfile}
              t={t}
              success={t("profileSaved")}
            />
            <SaveButton
              busy={saveProfile.isPending}
              disabled={!profile.teacherId}
              label={t("save")}
              busyLabel={t("saving")}
            />
          </form>
          <aside className={styles.records}>
            <h3>{t("profileContext")}</h3>
            <p className={styles.hint}>{t("profileHint")}</p>
            {profile.teacherId ? (
              <>
                <p className={styles.recordTitle}>
                  {
                    teachers.data?.find((x) => x.id === profile.teacherId)
                      ?.displayName
                  }
                </p>
                <span className={styles.badge}>
                  {profile.isPublic ? t("publicProfile") : t("privateProfile")}
                </span>
              </>
            ) : (
              <p className={styles.empty}>{t("chooseTeacher")}</p>
            )}
          </aside>
        </div>
      </section>
      <section
        id="content-packages"
        aria-label={t("packagesNav")}
        hidden={workspace !== "packages"}
        className={styles.panel}
      >
        <div className={styles.panelLayout}>
          {" "}
          <form
            className={styles.editor}
            aria-label={t("packagesNav")}
            onSubmit={(event) => {
              event.preventDefault();
              if (!savePackage.isPending) savePackage.mutate();
            }}
          >
            <SectionHeading
              icon={PackageCheck}
              title={selectedPackageId ? t("editPackage") : t("package")}
            />
            <Field label={t("managePackage")}>
              <select
                disabled={savePackage.isPending}
                value={selectedPackageId}
                onChange={(event) => selectPackage(event.target.value)}
                className={inputClass}
              >
                <option value="">{t("newPackage")}</option>
                {packages.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.arabicTitle} · {item.englishTitle}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("slug")}>
              <input
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={packageValue.slug}
                onChange={(event) =>
                  setPackageValue({ ...packageValue, slug: event.target.value })
                }
                className={inputClass}
                dir="ltr"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("arabicTitle")}>
                <input
                  required
                  value={packageValue.arabicTitle}
                  onChange={(event) =>
                    setPackageValue({
                      ...packageValue,
                      arabicTitle: event.target.value,
                    })
                  }
                  className={inputClass}
                />
              </Field>
              <Field label={t("englishTitle")}>
                <input
                  required
                  value={packageValue.englishTitle}
                  onChange={(event) =>
                    setPackageValue({
                      ...packageValue,
                      englishTitle: event.target.value,
                    })
                  }
                  className={inputClass}
                  dir="ltr"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("arabicDescription")}>
                <textarea
                  required
                  value={packageValue.arabicDescription}
                  onChange={(event) =>
                    setPackageValue({
                      ...packageValue,
                      arabicDescription: event.target.value,
                    })
                  }
                  className={`${inputClass} min-h-24`}
                />
              </Field>
              <Field label={t("englishDescription")}>
                <textarea
                  required
                  value={packageValue.englishDescription}
                  onChange={(event) =>
                    setPackageValue({
                      ...packageValue,
                      englishDescription: event.target.value,
                    })
                  }
                  className={`${inputClass} min-h-24`}
                  dir="ltr"
                />
              </Field>
            </div>
            <Field label={t("price")}>
              <input
                required
                min="0"
                step="0.001"
                type="number"
                value={packageValue.price}
                onChange={(event) =>
                  setPackageValue({
                    ...packageValue,
                    price: event.target.value,
                  })
                }
                className={inputClass}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("availableFrom")}>
                <input
                  type="datetime-local"
                  value={packageValue.availableFromUtc}
                  onChange={(event) =>
                    setPackageValue({
                      ...packageValue,
                      availableFromUtc: event.target.value,
                    })
                  }
                  className={inputClass}
                />
              </Field>
              <Field label={t("availableUntil")}>
                <input
                  type="datetime-local"
                  value={packageValue.availableUntilUtc}
                  onChange={(event) =>
                    setPackageValue({
                      ...packageValue,
                      availableUntilUtc: event.target.value,
                    })
                  }
                  className={inputClass}
                />
              </Field>
            </div>
            <fieldset className={styles.composition}>
              <legend className={styles.legend}>{t("chooseCourses")}</legend>
              <ReadState
                query={courses}
                t={t}
                empty={!courses.data?.length}
                emptyText={t("noCourses")}
              />
              <div className={styles.courseList}>
                {courses.data?.map((course) => (
                  <label key={course.id} className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={packageValue.courseIds.includes(course.id)}
                      onChange={() => toggleCourse(course.id)}
                    />
                    {course.arabicTitle} · {course.englishTitle} (
                    {formatLocalizedCurrency(
                      course.price,
                      course.currency,
                      locale,
                    )}
                    )
                  </label>
                ))}
              </div>
            </fieldset>
            <PublishToggle
              checked={packageValue.isPublished}
              onChange={(isPublished) =>
                setPackageValue({ ...packageValue, isPublished })
              }
              label={t("publish")}
            />
            <OperationFeedback
              mutation={savePackage}
              t={t}
              success={t("packageSaved")}
            />
            <SaveButton
              busy={savePackage.isPending}
              label={selectedPackageId ? t("update") : t("save")}
              busyLabel={t("saving")}
            />
          </form>
          <aside className={styles.records}>
            <h3>{t("recent")}</h3>
            <ReadState
              query={packages}
              t={t}
              empty={!packages.data?.length}
              emptyText={t("noPackages")}
            />
            {packages.data?.length ? (
              <ul>
                {packages.data.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <p className={styles.recordTitle}>
                      {locale === "ar" ? item.arabicTitle : item.englishTitle}
                    </p>
                    <p className={styles.hint}>
                      {formatLocalizedCurrency(
                        item.price,
                        item.currency,
                        locale,
                      )}
                    </p>
                    <span className={styles.badge}>
                      {item.isPublished ? t("publishedState") : t("draftState")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </aside>
        </div>
      </section>
      <section
        id="content-sessions"
        aria-label={t("sessionsNav")}
        hidden={workspace !== "sessions"}
        className={styles.panel}
      >
        <div className={styles.panelLayout}>
          {" "}
          <form
            className={styles.editor}
            aria-label={t("sessionsNav")}
            onSubmit={(event) => {
              event.preventDefault();
              if (!createSession.isPending) createSession.mutate();
            }}
          >
            <SectionHeading icon={CalendarClock} title={t("session")} />
            <ReadState
              query={teachers}
              t={t}
              empty={!teachers.data?.filter((x) => !x.isFrozen).length}
              emptyText={t("noTeachers")}
            />
            <ReadState
              query={courses}
              t={t}
              empty={!courses.data?.length}
              emptyText={t("noCourses")}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("courseOptional")}>
                <select
                  value={session.courseId}
                  onChange={(event) =>
                    setSession({ ...session, courseId: event.target.value })
                  }
                  className={inputClass}
                >
                  <option value="">{t("noCourse")}</option>
                  {courses.data?.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.arabicTitle} · {course.englishTitle}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("host")}>
                <select
                  required
                  value={session.hostUserId}
                  onChange={(event) =>
                    setSession({ ...session, hostUserId: event.target.value })
                  }
                  className={inputClass}
                >
                  <option value="">—</option>
                  {teachers.data
                    ?.filter((teacher) => !teacher.isFrozen)
                    .map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.displayName}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("arabicTitle")}>
                <input
                  required
                  value={session.arabicTitle}
                  onChange={(event) =>
                    setSession({ ...session, arabicTitle: event.target.value })
                  }
                  className={inputClass}
                />
              </Field>
              <Field label={t("englishTitle")}>
                <input
                  required
                  value={session.englishTitle}
                  onChange={(event) =>
                    setSession({ ...session, englishTitle: event.target.value })
                  }
                  className={inputClass}
                  dir="ltr"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("arabicDescription")}>
                <textarea
                  value={session.arabicDescription}
                  onChange={(event) =>
                    setSession({
                      ...session,
                      arabicDescription: event.target.value,
                    })
                  }
                  className={`${inputClass} min-h-20`}
                />
              </Field>
              <Field label={t("englishDescription")}>
                <textarea
                  value={session.englishDescription}
                  onChange={(event) =>
                    setSession({
                      ...session,
                      englishDescription: event.target.value,
                    })
                  }
                  className={`${inputClass} min-h-20`}
                  dir="ltr"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("provider")}>
                <select
                  required
                  value={session.provider}
                  onChange={(event) =>
                    setSession({ ...session, provider: event.target.value })
                  }
                  className={inputClass}
                  disabled={liveSessionProviders.isPending}
                >
                  <option value="">—</option>
                  {liveSessionProviders.data?.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {locale === "ar"
                        ? provider.arabicName
                        : provider.englishName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("joinUrl")}>
                <input
                  type="url"
                  value={session.joinUrl}
                  onChange={(event) =>
                    setSession({ ...session, joinUrl: event.target.value })
                  }
                  className={inputClass}
                  dir="ltr"
                />
              </Field>
              <Field label={t("recordingUrl")}>
                <input
                  type="url"
                  value={session.recordingUrl}
                  onChange={(event) =>
                    setSession({ ...session, recordingUrl: event.target.value })
                  }
                  className={inputClass}
                  dir="ltr"
                />
              </Field>
            </div>
            <ReadState
              query={liveSessionProviders}
              t={t}
              empty={!liveSessionProviders.data?.length}
              emptyText={t("noProviders")}
            />
            {selectedLiveProvider ? (
              <p className={styles.hint}>
                {locale === "ar"
                  ? selectedLiveProvider.arabicDescription
                  : selectedLiveProvider.englishDescription}
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("starts")}>
                <input
                  required
                  type="datetime-local"
                  value={session.startsAtUtc}
                  onChange={(event) =>
                    setSession({ ...session, startsAtUtc: event.target.value })
                  }
                  className={inputClass}
                />
              </Field>
              <Field label={t("ends")}>
                <input
                  required
                  type="datetime-local"
                  value={session.endsAtUtc}
                  onChange={(event) =>
                    setSession({ ...session, endsAtUtc: event.target.value })
                  }
                  className={inputClass}
                />
              </Field>
              <Field label={t("capacity")}>
                <input
                  min="1"
                  max="5000"
                  type="number"
                  value={session.capacity}
                  onChange={(event) =>
                    setSession({ ...session, capacity: event.target.value })
                  }
                  className={inputClass}
                />
              </Field>
            </div>
            <PublishToggle
              checked={session.isPublished}
              onChange={(isPublished) =>
                setSession({ ...session, isPublished })
              }
              label={t("publish")}
            />
            <OperationFeedback
              mutation={createSession}
              t={t}
              success={t("sessionSaved")}
            />
            <SaveButton
              busy={createSession.isPending || liveSessionProviders.isPending}
              label={t("save")}
              busyLabel={t("saving")}
            />
          </form>
          <aside className={styles.records}>
            <h3>{t("recent")}</h3>
            <ReadState
              query={sessions}
              t={t}
              empty={!sessions.data?.length}
              emptyText={t("noSessions")}
            />
            {sessions.data?.length ? (
              <ul>
                {sessions.data.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <p className={styles.recordTitle}>
                      {locale === "ar" ? item.arabicTitle : item.englishTitle}
                    </p>
                    <p className={styles.hint}>
                      {item.provider +
                        " · " +
                        formatLocalizedDateTime(item.startsAtUtc, locale)}
                    </p>
                    <span className={styles.badge}>
                      {item.isPublished ? t("publishedState") : t("draftState")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </aside>
        </div>
      </section>
      <section
        id="content-attendance"
        aria-label={t("attendance")}
        hidden={workspace !== "attendance"}
        className={styles.panel}
      >
        <SectionHeading icon={CalendarClock} title={t("attendance")} />
        <p className="mt-2 text-sm text-muted">{t("attendanceDescription")}</p>
        <ReadState
          query={sessions}
          t={t}
          empty={!sessions.data?.length}
          emptyText={t("noSessions")}
        />
        <ReadState
          query={students}
          t={t}
          empty={!students.data?.items.length}
          emptyText={t("noStudents")}
        />
        <div className={styles.attendanceControls}>
          <Field label={t("attendanceSession")}>
            <select
              disabled={markAttendance.isPending}
              value={attendanceSessionId}
              onChange={(event) => {
                setAttendanceSessionId(event.target.value);
                setAttendanceStudentId("");
                markAttendance.reset();
              }}
              className={inputClass}
            >
              <option value="">—</option>
              {sessions.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {locale === "ar" ? item.arabicTitle : item.englishTitle}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("attendanceStudent")}>
            <select
              value={attendanceStudentId}
              onChange={(event) => {
                setAttendanceStudentId(event.target.value);
                markAttendance.reset();
              }}
              className={inputClass}
              disabled={!attendanceSessionId || markAttendance.isPending}
            >
              <option value="">—</option>
              {students.data?.items.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.displayName}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-wrap items-end gap-2">
            <select
              value={attendanceStatus}
              onChange={(event) =>
                setAttendanceStatus(
                  event.target.value as AttendanceItem["status"],
                )
              }
              className={inputClass}
              aria-label={t("attendanceStatus")}
            >
              <AttendanceStatusOptions t={t} />
            </select>
            <button
              type="button"
              disabled={
                !attendanceSessionId ||
                !attendanceStudentId ||
                markAttendance.isPending
              }
              onClick={() =>
                markAttendance.mutate({
                  studentUserId: attendanceStudentId,
                  status: attendanceStatus,
                })
              }
              className={styles.primaryButton}
            >
              {t("markAttendance")}
            </button>
          </div>
        </div>
        <OperationFeedback
          mutation={markAttendance}
          t={t}
          success={t("attendanceSaved")}
        />
        {attendanceSessionId ? (
          <>
            <ReadState
              query={attendance}
              t={t}
              empty={!attendance.data?.length}
              emptyText={t("attendanceEmpty")}
              errorText={t("attendanceLoadError")}
            />
            {attendance.data?.length ? (
              <div className={styles.ledger}>
                {attendance.data.map((item) => (
                  <AttendanceRow
                    key={`${attendanceSessionId}:${item.id}:${item.status}`}
                    item={item}
                    locale={locale}
                    t={t}
                    saving={markAttendance.isPending}
                    onSave={(status) =>
                      markAttendance.mutate({
                        studentUserId: item.studentUserId,
                        status,
                      })
                    }
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className={styles.empty}>{t("selectSessionHint")}</p>
        )}
      </section>
    </section>
  );
}

function toLocalDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function SectionHeading({
  icon: Icon,
  title,
}: {
  icon: typeof FileText;
  title: string;
}) {
  return (
    <h2 className={styles.sectionHeading}>
      <Icon size={20} aria-hidden="true" />
      {title}
    </h2>
  );
}
function PublishToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className={styles.toggle}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
function SaveButton({
  busy,
  disabled = false,
  label,
  busyLabel,
}: {
  busy: boolean;
  disabled?: boolean;
  label: string;
  busyLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className={styles.primaryButton}
    >
      {busy ? busyLabel : label}
    </button>
  );
}
type Operation = {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: unknown;
};
function OperationFeedback({
  mutation,
  t,
  success,
}: {
  mutation: Operation;
  t: ReturnType<typeof useTranslations>;
  success: string;
}) {
  if (!mutation.isPending && !mutation.isError && !mutation.isSuccess)
    return null;
  return (
    <p
      role="status"
      aria-live={mutation.isError ? "assertive" : "polite"}
      className={mutation.isError ? styles.error : styles.feedback}
    >
      {mutation.isPending
        ? t("saving")
        : mutation.isError
          ? mutation.error instanceof Error
            ? mutation.error.message
            : t("requestFailed")
          : success}
    </p>
  );
}
type ReadQuery = {
  isPending: boolean;
  isError: boolean;
  data: unknown;
  refetch: () => unknown;
};
function ReadState({
  query,
  t,
  empty,
  emptyText,
  errorText,
}: {
  query: ReadQuery;
  t: ReturnType<typeof useTranslations>;
  empty: boolean;
  emptyText: string;
  errorText?: string;
}) {
  if (query.isPending)
    return (
      <p role="status" className={styles.loading}>
        {t("loading")}
      </p>
    );
  if (query.isError)
    return (
      <div role="alert" className={styles.error}>
        <p>
          {query.data !== undefined
            ? t("refreshFailed")
            : (errorText ?? t("loadFailed"))}
        </p>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => void query.refetch()}
        >
          {t("retry")}
        </button>
      </div>
    );
  return empty ? <p className={styles.empty}>{emptyText}</p> : null;
}
function AttendanceStatusOptions({
  t,
}: {
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <>
      <option value="Present">{t("present")}</option>
      <option value="Late">{t("late")}</option>
      <option value="Absent">{t("absent")}</option>
      <option value="Excused">{t("excused")}</option>
    </>
  );
}
export function AttendanceRow({
  item,
  locale,
  t,
  saving,
  onSave,
}: {
  item: AttendanceItem;
  locale: string;
  t: ReturnType<typeof useTranslations>;
  saving: boolean;
  onSave: (status: AttendanceItem["status"]) => void;
}) {
  const [status, setStatus] = useState(item.status);
  const labels = {
    Present: t("present"),
    Late: t("late"),
    Absent: t("absent"),
    Excused: t("excused"),
  };
  return (
    <div className={styles.attendanceRow}>
      <div>
        <p className={styles.recordTitle}>{item.studentName}</p>
        <p className={styles.hint}>
          {formatLocalizedDateTime(item.joinedAtUtc, locale)}
        </p>
        <span className={styles.badge}>{labels[item.status]}</span>
      </div>
      <div className={styles.rowActions}>
        <select
          disabled={saving}
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as AttendanceItem["status"])
          }
          className={inputClass}
          aria-label={`${t("attendanceStatus")} · ${item.studentName}`}
        >
          <AttendanceStatusOptions t={t} />
        </select>
        <button
          type="button"
          disabled={saving || status === item.status}
          onClick={() => onSave(status)}
          className={styles.secondaryButton}
        >
          {t("updateAttendance")}
        </button>
      </div>
    </div>
  );
}
