"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  FileText,
  PackageCheck,
  UsersRound,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

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
    <label className="grid gap-1.5 text-sm font-bold text-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "focus-ring w-full rounded-xl border border-border bg-transparent px-3 py-2.5 text-sm text-foreground";

export function ContentStudio() {
  const locale = useLocale();
  const t = useTranslations("adminContent");
  const client = useQueryClient();
  const [notice, setNotice] = useState<string>();
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
      setNotice(t("saved"));
      refresh("admin-content-blog");
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : "Request failed."),
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
      setNotice(t("saved"));
      refresh("admin-content-teachers");
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : "Request failed."),
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
      setNotice(t("saved"));
      refresh("admin-content-packages");
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : "Request failed."),
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
      setNotice(t("saved"));
      refresh("admin-content-sessions");
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : "Request failed."),
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
      setNotice(t("saved"));
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : "Request failed."),
  });
  function selectTeacher(teacherId: string) {
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
  const busy =
    createArticle.isPending ||
    saveProfile.isPending ||
    savePackage.isPending ||
    createSession.isPending;
  return (
    <section className="shell py-10">
      <header className="relative overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_85%_15%,color-mix(in_srgb,var(--primary)_24%,transparent),transparent_38%),linear-gradient(125deg,color-mix(in_srgb,var(--surface)_92%,transparent),color-mix(in_srgb,var(--surface-solid)_72%,transparent))] p-6 shadow-[var(--shadow)] sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
          {t("eyebrow")}
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
          {t("description")}
        </p>
      </header>
      {notice ? (
        <p
          role="status"
          className="mt-5 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-primary"
        >
          {notice}
        </p>
      ) : null}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <form
          className="card grid gap-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            createArticle.mutate();
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
                  setArticle({ ...article, arabicExcerpt: event.target.value })
                }
                className={`${inputClass} min-h-20`}
              />
            </Field>
            <Field label={t("englishExcerpt")}>
              <textarea
                required
                value={article.englishExcerpt}
                onChange={(event) =>
                  setArticle({ ...article, englishExcerpt: event.target.value })
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
            onChange={(isPublished) => setArticle({ ...article, isPublished })}
            label={t("publish")}
          />
          <SaveButton
            busy={createArticle.isPending}
            label={t("save")}
            busyLabel={t("saving")}
          />
        </form>

        <form
          className="card grid gap-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (profile.teacherId) saveProfile.mutate();
          }}
        >
          <SectionHeading icon={UsersRound} title={t("teacher")} />
          <Field label={t("chooseTeacher")}>
            <select
              required
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
          <SaveButton
            busy={saveProfile.isPending}
            label={t("save")}
            busyLabel={t("saving")}
          />
        </form>

        <form
          className="card grid gap-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            savePackage.mutate();
          }}
        >
          <SectionHeading icon={PackageCheck} title={t("package")} />
          <Field label={t("managePackage")}>
            <select
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
                setPackageValue({ ...packageValue, price: event.target.value })
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
          <fieldset className="grid gap-2">
            <legend className="text-sm font-bold">{t("chooseCourses")}</legend>
            <div className="grid max-h-48 gap-2 overflow-y-auto rounded-xl border border-border p-3">
              {courses.data?.map((course) => (
                <label
                  key={course.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={packageValue.courseIds.includes(course.id)}
                    onChange={() => toggleCourse(course.id)}
                  />
                  {course.arabicTitle} · {course.englishTitle} (
                  {course.price.toFixed(3)} {course.currency})
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
          <SaveButton
            busy={savePackage.isPending}
            label={selectedPackageId ? t("update") : t("save")}
            busyLabel={t("saving")}
          />
        </form>

        <form
          className="card grid gap-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            createSession.mutate();
          }}
        >
          <SectionHeading icon={CalendarClock} title={t("session")} />
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
          {liveSessionProviders.isPending ? (
            <p className="text-sm text-muted">{t("loading")}</p>
          ) : liveSessionProviders.isError ? (
            <p role="alert" className="text-sm text-red-500">
              {t("providerLoadError")}
            </p>
          ) : selectedLiveProvider ? (
            <p className="text-sm leading-6 text-muted">
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
            onChange={(isPublished) => setSession({ ...session, isPublished })}
            label={t("publish")}
          />
          <SaveButton
            busy={createSession.isPending || liveSessionProviders.isPending}
            label={t("save")}
            busyLabel={t("saving")}
          />
        </form>
      </div>
      <section className="mt-8 card p-6">
        <h2 className="text-xl font-black">{t("recent")}</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <RecentList
            icon={FileText}
            values={
              blog.data?.map(
                (item) => `${item.arabicTitle} · ${item.englishTitle}`,
              ) ?? []
            }
            empty={t("empty")}
          />
          <RecentList
            icon={PackageCheck}
            values={
              packages.data?.map(
                (item) =>
                  `${item.arabicTitle} · ${item.price.toFixed(3)} ${item.currency}`,
              ) ?? []
            }
            empty={t("empty")}
          />
          <RecentList
            icon={CalendarClock}
            values={
              sessions.data?.map(
                (item) => `${item.arabicTitle} · ${item.provider}`,
              ) ?? []
            }
            empty={t("empty")}
          />
        </div>
      </section>
      <section className="mt-6 card p-6">
        <SectionHeading icon={CalendarClock} title={t("attendance")} />
        <p className="mt-2 text-sm text-muted">{t("attendanceDescription")}</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <Field label={t("attendanceSession")}>
            <select
              value={attendanceSessionId}
              onChange={(event) => setAttendanceSessionId(event.target.value)}
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
              onChange={(event) => setAttendanceStudentId(event.target.value)}
              className={inputClass}
              disabled={!attendanceSessionId}
            >
              <option value="">—</option>
              {students.data?.items.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.displayName} · {student.email}
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
              className="focus-ring rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
            >
              {t("markAttendance")}
            </button>
          </div>
        </div>
        {attendanceSessionId ? (
          attendance.isPending ? (
            <p className="mt-5 text-sm text-muted">{t("loading")}</p>
          ) : attendance.isError ? (
            <p className="mt-5 text-sm text-red-500">
              {t("attendanceLoadError")}
            </p>
          ) : attendance.data?.length ? (
            <div className="mt-5 grid gap-2">
              {attendance.data.map((item) => (
                <AttendanceRow
                  key={`${item.id}:${item.status}`}
                  item={item}
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
          ) : (
            <p className="mt-5 text-sm text-muted">{t("attendanceEmpty")}</p>
          )
        ) : null}
      </section>
      {busy ? (
        <p className="sr-only" aria-live="polite">
          {t("saving")}
        </p>
      ) : null}
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
    <h2 className="flex items-center gap-2 text-xl font-black">
      <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
        <Icon size={18} aria-hidden="true" />
      </span>
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
    <label className="flex items-center gap-2 text-sm font-bold">
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
  label,
  busyLabel,
}: {
  busy: boolean;
  label: string;
  busyLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="focus-ring justify-self-start rounded-xl bg-primary px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-60"
    >
      {busy ? busyLabel : label}
    </button>
  );
}
function RecentList({
  icon: Icon,
  values,
  empty,
}: {
  icon: typeof FileText;
  values: string[];
  empty: string;
}) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <Icon size={18} className="text-primary" aria-hidden="true" />
      {values.length ? (
        <ul className="mt-3 grid gap-2 text-sm">
          {values.slice(0, 4).map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      )}
    </div>
  );
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

function AttendanceRow({
  item,
  t,
  saving,
  onSave,
}: {
  item: AttendanceItem;
  t: ReturnType<typeof useTranslations>;
  saving: boolean;
  onSave: (status: AttendanceItem["status"]) => void;
}) {
  const [status, setStatus] = useState(item.status);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
      <div>
        <p className="font-bold">{item.studentName}</p>
        <p className="mt-1 text-xs text-muted">
          {new Date(item.joinedAtUtc).toLocaleString()}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as AttendanceItem["status"])
          }
          className="focus-ring rounded-lg border border-border bg-transparent px-2.5 py-2 text-sm"
          aria-label={t("attendanceStatus")}
        >
          <AttendanceStatusOptions t={t} />
        </select>
        <button
          type="button"
          disabled={saving || status === item.status}
          onClick={() => onSave(status)}
          className="focus-ring rounded-lg border border-primary/40 px-3 py-2 text-xs font-black text-primary disabled:opacity-50"
        >
          {t("updateAttendance")}
        </button>
      </div>
    </div>
  );
}
