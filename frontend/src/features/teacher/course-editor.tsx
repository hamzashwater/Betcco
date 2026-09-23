"use client";

/* The cover endpoint is authenticated, so Next's image optimizer cannot request it. */
/* eslint-disable @next/next/no-img-element */

import { FilePicker } from "@/components/forms/file-picker";
import {
  CourseWorkspaceNavigation,
  CourseWorkspaceSection,
} from "@/features/teacher/course-workspace-navigation";
import { api } from "@/lib/api";
import { defaultBrand } from "@/lib/brand";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Copy,
  FileText,
  FolderPlus,
  Image as ImageIcon,
  PencilLine,
  Plus,
  Target,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Taxonomy = {
  tracks: { id: string; name: string; isBtecFocused?: boolean }[];
  grades: { id: string; learningTrackId: string; name: string }[];
  specializations: { id: string; learningTrackId: string; name: string }[];
  subjects: {
    id: string;
    specializationId?: string;
    name: string;
    isPendingReview?: boolean;
  }[];
};

type CourseEditorData = {
  id: string;
  isBtecFocused: boolean;
  qualificationVersionId?: string;
  arabicTitle: string;
  englishTitle: string;
  arabicDescription: string;
  englishDescription: string;
  status: string;
  price: number;
  isFree: boolean;
  hasCover: boolean;
  seoTitle?: string;
  seoDescription?: string;
  outcomes: {
    id: string;
    arabicText: string;
    englishText: string;
    sortOrder: number;
  }[];
  modules: {
    id: string;
    unitDefinitionId?: string;
    arabicTitle: string;
    englishTitle: string;
    unitCode?: string;
    arabicDescription?: string;
    englishDescription?: string;
    guidedLearningHours?: number;
    credits?: number;
    qualificationLevel?: string;
    publicationStatus: string;
    availableFromUtc?: string;
    sortOrder: number;
    learningAims: LearningAimData[];
    criteria: CriterionData[];
    lessons: LessonData[];
  }[];
};

type AcademicUnitOption = {
  id: string;
  code: string;
  arabicTitle: string;
  englishTitle: string;
  qualificationVersionId: string;
  qualificationCode: string;
  versionCode: string;
};

type LearningAimData = {
  id: string;
  code: string;
  arabicTitle: string;
  englishTitle: string;
  arabicDescription?: string;
  englishDescription?: string;
  publicationStatus: string;
  availableFromUtc?: string;
  sortOrder: number;
  topics: TopicData[];
};

type TopicData = {
  id: string;
  arabicTitle: string;
  englishTitle: string;
  arabicDescription?: string;
  englishDescription?: string;
  publicationStatus: string;
  availableFromUtc?: string;
  sortOrder: number;
};

type CriterionData = {
  id: string;
  btecLearningAimId?: string;
  code: string;
  band: "Pass" | "Merit" | "Distinction";
  arabicDescription: string;
  englishDescription: string;
  arabicEvidenceGuidance?: string;
  englishEvidenceGuidance?: string;
  publicationStatus: string;
  sortOrder: number;
};

type LessonData = {
  id: string;
  btecLearningAimId?: string;
  btecTopicId?: string;
  arabicTitle: string;
  englishTitle: string;
  arabicBody?: string;
  englishBody?: string;
  type: string;
  durationSeconds: number;
  isPreview: boolean;
  publicationStatus: string;
  availableFromUtc?: string;
  sortOrder: number;
  video?: {
    id: string;
    displayName: string;
    contentType: string;
  };
  resources: {
    id: string;
    displayName: string;
    contentType: string;
    externalUrl?: string;
    scanStatus: string;
    isDownloadable: boolean;
  }[];
};

type CourseAssignmentData = {
  id: string;
  courseId: string;
  courseModuleId?: string;
  lessonId?: string;
  btecLearningAimId?: string;
  arabicTitle: string;
  englishTitle: string;
  arabicInstructions: string;
  englishInstructions: string;
  availableFromUtc?: string;
  dueAtUtc?: string;
  maxSubmissionAttempts: number;
  allowResubmission: boolean;
  maxFileSizeBytes: number;
  allowedFileExtensions: string[];
  maxScore?: number;
  isPublished: boolean;
  publicationStatus: "Draft" | "Published" | "Archived" | "Scheduled";
  resources: {
    id: string;
    displayName: string;
    contentType: string;
    scanStatus: string;
  }[];
  criteria: {
    id: string;
    btecCriterionId?: string;
    code: string;
    band: "Pass" | "Merit" | "Distinction";
    arabicDescription: string;
    englishDescription: string;
    sortOrder: number;
  }[];
};

type CourseworkDeadlineExtension = {
  id: string;
  studentUserId: string;
  baseDueAtUtcSnapshot: string;
  extendedDueAtUtc: string;
  grantedAtUtc: string;
  reason: string;
  revokedAtUtc?: string | null;
  revocationReason?: string | null;
};

type LearningAccessItem = {
  type: "Course" | "Unit" | "Lesson" | "Quiz" | "Assignment";
  id: string;
  arabicTitle: string;
  englishTitle: string;
};

type LearningAccessData = {
  items: LearningAccessItem[];
  prerequisiteCourses: LearningAccessItem[];
  rules: {
    targetType: LearningAccessItem["type"];
    targetId: string;
    releaseMode:
      "SpecificDate" | "DaysAfterEnrollment" | "AfterPreviousContentCompletion";
    specificDateUtc?: string;
    daysAfterEnrollment?: number;
    previousContentType?: LearningAccessItem["type"];
    previousContentId?: string;
  }[];
  prerequisites: {
    id: string;
    targetType: LearningAccessItem["type"];
    targetId: string;
    requiredContentType: LearningAccessItem["type"];
    requiredContentId: string;
  }[];
};

const assignmentFileTypes = [
  [".pdf", "PDF"],
  [".docx", "DOCX"],
  [".xlsx", "XLSX"],
  [".pptx", "PPTX"],
  [".png", "PNG"],
  [".jpg", "JPG"],
  [".jpeg", "JPEG"],
  [".zip", "ZIP"],
  [".txt", "TXT"],
] as const;

function AssignmentFileTypeSelector({
  selected,
  onChange,
  locale,
}: {
  selected: string[];
  onChange: (values: string[]) => void;
  locale: string;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-xs font-bold text-muted">
        {locale === "ar" ? "أنواع الملفات المسموحة" : "Allowed file types"}
      </legend>
      <div className="flex flex-wrap gap-2">
        {assignmentFileTypes.map(([extension, label]) => {
          const checked = selected.includes(extension);
          return (
            <label
              key={extension}
              className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-bold ${checked ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-muted"}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? selected.filter((item) => item !== extension)
                      : [...selected, extension],
                  )
                }
                className="sr-only"
              />
              {label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

type TeacherAssignmentSubmission = {
  id: string;
  assignmentId: string;
  courseId: string;
  arabicTitle: string;
  englishTitle: string;
  studentUserId: string;
  status: string;
  calculatedGrade?: string;
  currentVersionNumber: number;
  submittedAtUtc?: string;
  files: {
    id: string;
    originalFileName: string;
    contentType: string;
    lengthBytes: number;
    scanStatus: string;
  }[];
  feedback: {
    body: string;
    requestsResubmission: boolean;
    isPrivate: boolean;
    createdAtUtc: string;
  }[];
};

type TeacherQuizData = {
  id: string;
  courseId: string;
  lessonId?: string;
  arabicTitle: string;
  englishTitle: string;
  passMark: number;
  attemptLimit?: number;
  timeLimitMinutes?: number;
  randomizeQuestions: boolean;
  randomizeAnswers: boolean;
  showAnswers: boolean;
  showScore: boolean;
  availableFromUtc?: string;
  availableUntilUtc?: string;
  allowLateAttempts: boolean;
  isPublished: boolean;
  publicationStatus: "Draft" | "Published" | "Archived" | "Scheduled";
  questions: {
    id: string;
    type:
      | "SingleChoice"
      | "MultipleChoice"
      | "TrueFalse"
      | "ShortAnswer"
      | "FillInBlank"
      | "Matching"
      | "Ordering"
      | "Essay"
      | "ImageQuestion"
      | "CodeQuestion";
    arabicText: string;
    englishText: string;
    options: string[];
    correctAnswers: string[];
    imageResourceId?: string;
    sortOrder: number;
  }[];
};

type ManualQuizReviewData = {
  total: number;
  page: number;
  pageSize: number;
  items: {
    id: string;
    studentUserId: string;
    studentName: string;
    submittedAtUtc?: string;
    wasLate: boolean;
    questions: {
      id: string;
      type: "Essay" | "CodeQuestion";
      text: string;
      answer: string;
    }[];
  }[];
};

type CourseAnnouncementData = {
  id: string;
  courseModuleId?: string;
  unitTitle?: string;
  arabicTitle: string;
  englishTitle: string;
  arabicBody: string;
  englishBody: string;
  audience: "Course" | "Unit" | "SelectedStudents";
  selectedStudentIds: string[];
  isPublished: boolean;
  publishedAtUtc?: string;
};

type QuestionBankItem = {
  id: string;
  courseId: string;
  subjectId?: string;
  courseModuleId?: string;
  btecLearningAimId?: string;
  type: TeacherQuizData["questions"][number]["type"];
  arabicText: string;
  englishText: string;
  options: string[];
  correctAnswers: string[];
  imageResourceId?: string;
  tag?: string;
  difficulty: number;
};

export function CourseEditor({ courseId }: { courseId?: string }) {
  return courseId ? (
    <ExistingCourseEditor courseId={courseId} />
  ) : (
    <CreateCourse />
  );
}

function CreateCourse() {
  const locale = useLocale();
  const router = useRouter();
  const taxonomy = useQuery({
    queryKey: ["taxonomy", locale],
    queryFn: () => api<Taxonomy>(`/taxonomy?locale=${locale}`),
  });
  const [form, setForm] = useState({
    arabicTitle: "",
    englishTitle: "",
    arabicDescription: "",
    englishDescription: "",
    learningTrackId: "",
    gradeId: "",
    specializationId: "",
    subjectId: "",
    price: "12",
    isFree: false,
  });
  const defaultTrackId =
    taxonomy.data?.tracks.find((track) => track.isBtecFocused)?.id ??
    taxonomy.data?.tracks[0]?.id ??
    "";
  const selectedTrackId = form.learningTrackId || defaultTrackId;
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/teacher/courses", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          englishTitle: form.englishTitle.trim() || form.arabicTitle.trim(),
          englishDescription:
            form.englishDescription.trim() || form.arabicDescription.trim(),
          learningTrackId: selectedTrackId || undefined,
          gradeId: form.gradeId || null,
          specializationId: form.specializationId || null,
          subjectId: form.subjectId || null,
          price: form.isFree ? 0 : Number(form.price),
        }),
      }),
    onSuccess: (course) =>
      router.replace(`/${locale}/teacher/courses/${course.id}`),
  });
  const update = (key: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <section className="shell py-10">
      <Link
        href={`/${locale}/teacher/courses`}
        className="focus-ring inline-flex items-center gap-2 text-sm font-bold text-primary"
      >
        <ArrowLeft size={17} className="rtl:rotate-180" aria-hidden="true" />
        {locale === "ar" ? "العودة إلى دوراتي" : "Back to my courses"}
      </Link>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
        className="card mx-auto mt-5 grid max-w-4xl gap-5 p-6"
      >
        <div>
          <p className="font-bold text-primary">
            {defaultBrand.BrandName} Teacher Studio
          </p>
          <h1 className="mt-1 text-3xl font-black">
            {locale === "ar" ? "إنشاء مسودة دورة" : "Create a course draft"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {locale === "ar"
              ? "أنشئ معلومات الدورة أولًا، ثم أضف الغلاف والوحدات والدروس والملفات من صفحة التحرير التالية."
              : "Create the course information first, then add its cover, modules, lessons, and files from the editor."}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label={locale === "ar" ? "العنوان بالعربية" : "Arabic title"}
            value={form.arabicTitle}
            onChange={(value) => update("arabicTitle", value)}
          />
          <TextField
            label={
              locale === "ar"
                ? "العنوان بالإنجليزية (اختياري)"
                : "English title (optional)"
            }
            value={form.englishTitle}
            onChange={(value) => update("englishTitle", value)}
            required={false}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            multiline
            label={locale === "ar" ? "الوصف بالعربية" : "Arabic description"}
            value={form.arabicDescription}
            onChange={(value) => update("arabicDescription", value)}
          />
          <TextField
            multiline
            label={
              locale === "ar"
                ? "الوصف بالإنجليزية (اختياري)"
                : "English description (optional)"
            }
            value={form.englishDescription}
            onChange={(value) => update("englishDescription", value)}
            required={false}
          />
        </div>
        <label className="grid max-w-md gap-1 text-sm font-bold text-muted">
          {locale === "ar" ? "السعر (دينار أردني)" : "Price (JOD)"}
          <input
            type="number"
            min="0"
            step="0.001"
            disabled={form.isFree}
            required={!form.isFree}
            value={form.price}
            onChange={(event) => update("price", event.target.value)}
            className="rounded-xl border border-border bg-transparent p-3 text-foreground disabled:opacity-50"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-foreground">
          <input
            type="checkbox"
            checked={form.isFree}
            onChange={(event) => update("isFree", event.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          {locale === "ar" ? "هذه دورة مجانية" : "This is a free course"}
        </label>
        <details className="rounded-2xl border border-border bg-black/5 p-4">
          <summary className="cursor-pointer font-bold text-foreground">
            {locale === "ar"
              ? "تصنيف الدورة وإعدادات BTEC (اختياري)"
              : "Course classification and BTEC settings (optional)"}
          </summary>
          <p className="mt-2 text-sm text-muted">
            {locale === "ar"
              ? "سيُستخدم مسار BTEC الافتراضي إن لم تختر مسارًا آخر. يمكنك إضافة الصف والتخصص والمادة الآن أو لاحقًا."
              : "The default BTEC track is used unless you choose another one. Grade, specialization, and subject can be added now or later."}
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <SelectField
              label={locale === "ar" ? "المسار التعليمي" : "Learning track"}
              value={selectedTrackId}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  learningTrackId: value,
                  gradeId: "",
                  specializationId: "",
                  subjectId: "",
                }))
              }
              options={taxonomy.data?.tracks ?? []}
            />
            <SelectField
              label={locale === "ar" ? "الصف" : "Grade"}
              value={form.gradeId}
              onChange={(value) => update("gradeId", value)}
              options={(taxonomy.data?.grades ?? []).filter(
                (item) => item.learningTrackId === selectedTrackId,
              )}
            />
            <SelectField
              label={locale === "ar" ? "التخصص" : "Specialization"}
              value={form.specializationId}
              onChange={(value) => update("specializationId", value)}
              options={(taxonomy.data?.specializations ?? []).filter(
                (item) => item.learningTrackId === selectedTrackId,
              )}
            />
          </div>
          <div className="mt-4 grid gap-2 md:max-w-[calc(66.666%-0.5rem)]">
            <SelectField
              label={locale === "ar" ? "المادة" : "Subject"}
              value={form.subjectId}
              onChange={(value) => update("subjectId", value)}
              options={(taxonomy.data?.subjects ?? [])
                .filter(
                  (item) =>
                    !item.specializationId ||
                    item.specializationId === form.specializationId,
                )
                .map((item) => ({
                  ...item,
                  name: item.isPendingReview
                    ? `${item.name} ${locale === "ar" ? "(بانتظار المراجعة)" : "(pending review)"}`
                    : item.name,
                }))}
            />
            <TeacherSubjectCreator
              locale={locale}
              specializationId={form.specializationId}
              onCreated={(subjectId) => update("subjectId", subjectId)}
            />
          </div>
        </details>
        <button
          disabled={create.isPending || taxonomy.isPending}
          className="focus-ring inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-5 py-3 font-black text-slate-950 disabled:opacity-50"
        >
          <Plus size={18} aria-hidden="true" />
          {locale === "ar"
            ? "إنشاء المسودة وفتح المحرر"
            : "Create draft and open editor"}
        </button>
        <RequestError error={create.error} />
      </form>
    </section>
  );
}

function TeacherSubjectCreator({
  locale,
  specializationId,
  onCreated,
}: {
  locale: string;
  specializationId: string;
  onCreated: (subjectId: string) => void;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [arabicName, setArabicName] = useState("");
  const [englishName, setEnglishName] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/teacher/taxonomy/subjects", {
        method: "POST",
        body: JSON.stringify({
          specializationId,
          arabicName,
          englishName,
        }),
      }),
    onSuccess: (subject) => {
      onCreated(subject.id);
      setArabicName("");
      setEnglishName("");
      setOpen(false);
      void client.invalidateQueries({ queryKey: ["taxonomy"] });
    },
  });
  const canCreate =
    Boolean(specializationId) &&
    Boolean(arabicName.trim()) &&
    Boolean(englishName.trim()) &&
    !create.isPending;

  return (
    <div className="rounded-xl border border-dashed border-primary/35 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs leading-5 text-muted">
          {locale === "ar"
            ? "لا تجد المادة؟ أضفها لتظهر في مسودتك، ثم يعتمدها الأدمن مع الدورة."
            : "Can't find the subject? Add it to your draft; an admin approves it with the course."}
        </p>
        <button
          type="button"
          disabled={!specializationId}
          onClick={() => setOpen((current) => !current)}
          className="focus-ring inline-flex items-center gap-1 rounded-lg border border-primary/45 px-3 py-2 text-xs font-black text-primary disabled:cursor-not-allowed disabled:opacity-50"
          aria-expanded={open}
        >
          <Plus size={15} aria-hidden="true" />
          {open
            ? locale === "ar"
              ? "إلغاء"
              : "Cancel"
            : locale === "ar"
              ? "إضافة مادة"
              : "Add subject"}
        </button>
      </div>
      {!specializationId ? (
        <p className="mt-2 text-xs text-amber-500">
          {locale === "ar"
            ? "اختر التخصص أولًا لإضافة مادة مرتبطة به."
            : "Choose a specialization before adding a linked subject."}
        </p>
      ) : null}
      {open ? (
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <label className="grid gap-1 text-xs font-bold text-muted">
            {locale === "ar" ? "اسم المادة بالعربية" : "Arabic subject name"}
            <input
              value={arabicName}
              onChange={(event) => setArabicName(event.target.value)}
              maxLength={120}
              className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            {locale === "ar"
              ? "اسم المادة بالإنجليزية"
              : "English subject name"}
            <input
              value={englishName}
              onChange={(event) => setEnglishName(event.target.value)}
              maxLength={120}
              className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground"
            />
          </label>
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => create.mutate()}
            className="focus-ring mt-auto inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50"
          >
            <Plus size={15} aria-hidden="true" />
            {locale === "ar" ? "إضافة" : "Add"}
          </button>
        </div>
      ) : null}
      <RequestError error={create.error} />
    </div>
  );
}

function ExistingCourseEditor({ courseId }: { courseId: string }) {
  const locale = useLocale();
  const course = useQuery({
    queryKey: ["teacher-course", courseId],
    queryFn: () => api<CourseEditorData>(`/teacher/courses/${courseId}`),
  });
  if (course.isPending)
    return (
      <section className="shell py-10">
        <div className="card p-6" aria-busy>
          …
        </div>
      </section>
    );
  if (course.isError || !course.data)
    return (
      <section className="shell py-10">
        <p className="card p-6" role="alert">
          {locale === "ar"
            ? "تعذر العثور على هذه الدورة أو لا تملك صلاحية تحريرها."
            : "This course could not be found or edited."}
        </p>
      </section>
    );
  const editable =
    course.data.status === "Draft" || course.data.status === "Rejected";
  const assignmentsEditable = [
    "Draft",
    "Rejected",
    "Approved",
    "Published",
  ].includes(course.data.status);
  return (
    <section className="shell py-10">
      <Link
        href={`/${locale}/teacher/courses`}
        className="focus-ring inline-flex items-center gap-2 text-sm font-bold text-primary"
      >
        <ArrowLeft size={17} className="rtl:rotate-180" aria-hidden="true" />
        {locale === "ar" ? "العودة إلى دوراتي" : "Back to my courses"}
      </Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-bold text-primary">
            {defaultBrand.BrandName} Course Editor
          </p>
          <h1 className="mt-1 text-3xl font-black">
            {locale === "ar"
              ? course.data.arabicTitle
              : course.data.englishTitle}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {editable
              ? locale === "ar"
                ? "المسودة قابلة للتحرير. ارفع المحتوى ثم أرسلها للمراجعة."
                : "This draft can be edited. Upload content, then submit it for review."
              : locale === "ar"
                ? "هذه الدورة مقفلة أثناء المراجعة أو بعد النشر."
                : "This course is locked while under review or after publication."}
          </p>
        </div>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm font-black text-primary">
          {statusLabel(course.data.status, locale)}
        </span>
      </div>
      <CourseWorkspaceNavigation />
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 gap-6">
          <CourseWorkspaceSection id="details">
            <CourseDetailsForm course={course.data} disabled={!editable} />
          </CourseWorkspaceSection>
          <CourseWorkspaceSection id="access">
            <LearningAccessEditor
              course={course.data}
              disabled={!assignmentsEditable}
            />
          </CourseWorkspaceSection>
          <CourseWorkspaceSection id="announcements">
            <CourseAnnouncementsEditor
              course={course.data}
              disabled={!assignmentsEditable}
            />
          </CourseWorkspaceSection>
          <CourseWorkspaceSection id="curriculum">
            <CurriculumEditor course={course.data} disabled={!editable} />
          </CourseWorkspaceSection>
          <CourseWorkspaceSection id="assignments">
            <div className="grid gap-6">
              <CourseAssignmentsEditor
                course={course.data}
                disabled={!assignmentsEditable}
              />
              <TeacherCourseGradebook course={course.data} />
            </div>
          </CourseWorkspaceSection>
          <CourseWorkspaceSection id="quizzes">
            <CourseQuizzesEditor
              course={course.data}
              disabled={!assignmentsEditable}
            />
          </CourseWorkspaceSection>
        </div>
        <aside className="grid h-fit min-w-0 gap-5 xl:sticky xl:top-[11rem] xl:max-h-[calc(100vh-12rem)] xl:overflow-y-auto xl:pe-1">
          <CoverManager course={course.data} disabled={!editable} />
          <OutcomesEditor course={course.data} disabled={!editable} />
          <CourseWorkspaceSection id="review">
            <ReviewSubmission course={course.data} disabled={!editable} />
          </CourseWorkspaceSection>
        </aside>
      </div>
    </section>
  );
}

function CourseAnnouncementsEditor({
  course,
  disabled,
}: {
  course: CourseEditorData;
  disabled: boolean;
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [form, setForm] = useState({
    arabicTitle: "",
    englishTitle: "",
    arabicBody: "",
    englishBody: "",
    audience: "Course" as CourseAnnouncementData["audience"],
    courseModuleId: "",
    selectedStudentIds: [] as string[],
    publish: true,
  });
  const announcements = useQuery({
    queryKey: ["teacher-course-announcements", course.id],
    queryFn: () =>
      api<CourseAnnouncementData[]>(
        `/teacher/courses/${course.id}/announcements`,
      ),
  });
  const students = useQuery({
    queryKey: ["teacher-course-students", course.id],
    queryFn: () =>
      api<{ id: string; displayName: string }[]>(
        `/teacher/courses/${course.id}/announcements/students`,
      ),
    enabled: form.audience === "SelectedStudents",
  });
  const refresh = () =>
    client.invalidateQueries({
      queryKey: ["teacher-course-announcements", course.id],
    });
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/teacher/courses/${course.id}/announcements`, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          courseModuleId:
            form.audience === "Unit" ? form.courseModuleId || null : null,
        }),
      }),
    onSuccess: () => {
      setForm({
        arabicTitle: "",
        englishTitle: "",
        arabicBody: "",
        englishBody: "",
        audience: "Course",
        courseModuleId: "",
        selectedStudentIds: [],
        publish: true,
      });
      refresh();
    },
  });
  const publish = useMutation({
    mutationFn: (id: string) =>
      api(`/teacher/courses/${course.id}/announcements/${id}/publish`, {
        method: "POST",
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/teacher/courses/${course.id}/announcements/${id}`, {
        method: "DELETE",
      }),
    onSuccess: refresh,
  });
  const toggleStudent = (id: string) =>
    setForm((current) => ({
      ...current,
      selectedStudentIds: current.selectedStudentIds.includes(id)
        ? current.selectedStudentIds.filter((studentId) => studentId !== id)
        : [...current.selectedStudentIds, id],
    }));
  return (
    <section className="card grid gap-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-black">
          <FileText size={20} className="text-primary" aria-hidden="true" />
          {locale === "ar" ? "إعلانات الدورة" : "Course announcements"}
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          {locale === "ar"
            ? "أرسل إعلانًا لكل طلاب الدورة أو لوحدة أو لطلاب تحددهم. تُنشأ الإشعارات من الخادم بعد النشر."
            : "Notify everyone in a course, a unit context, or selected learners. Server-side notifications are created only after publishing."}
        </p>
      </div>
      {announcements.data?.length ? (
        <div className="grid gap-2">
          {announcements.data.map((announcement) => (
            <article
              key={announcement.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div>
                <p className="font-black">
                  {locale === "ar"
                    ? announcement.arabicTitle
                    : announcement.englishTitle}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {announcement.audience === "SelectedStudents"
                    ? locale === "ar"
                      ? `طلاب محددون: ${announcement.selectedStudentIds.length}`
                      : `Selected learners: ${announcement.selectedStudentIds.length}`
                    : announcement.audience === "Unit"
                      ? `${locale === "ar" ? "وحدة" : "Unit"}: ${announcement.unitTitle ?? "—"}`
                      : locale === "ar"
                        ? "كل طلاب الدورة"
                        : "All course learners"}
                </p>
              </div>
              {announcement.isPublished ? (
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                  {locale === "ar" ? "منشور" : "Published"}
                </span>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={disabled || publish.isPending}
                    onClick={() => publish.mutate(announcement.id)}
                    className="focus-ring rounded-lg border border-primary/45 px-3 py-1.5 text-xs font-black text-primary disabled:opacity-50"
                  >
                    {locale === "ar" ? "نشر" : "Publish"}
                  </button>
                  <button
                    type="button"
                    disabled={disabled || remove.isPending}
                    onClick={() => remove.mutate(announcement.id)}
                    className="focus-ring rounded-lg border border-red-500/45 px-3 py-1.5 text-xs font-black text-red-400 disabled:opacity-50"
                  >
                    {locale === "ar" ? "حذف" : "Delete"}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : null}
      {!disabled ? (
        <form
          className="grid gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <h3 className="font-black">
            {locale === "ar" ? "إعلان جديد" : "New announcement"}
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              required
              maxLength={180}
              value={form.arabicTitle}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  arabicTitle: event.target.value,
                }))
              }
              placeholder={
                locale === "ar" ? "العنوان بالعربية" : "Arabic title"
              }
              className="rounded-xl border border-border bg-transparent p-3 text-sm"
            />
            <input
              required
              maxLength={180}
              value={form.englishTitle}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  englishTitle: event.target.value,
                }))
              }
              placeholder={
                locale === "ar" ? "العنوان بالإنجليزية" : "English title"
              }
              className="rounded-xl border border-border bg-transparent p-3 text-sm"
            />
            <textarea
              required
              maxLength={6000}
              value={form.arabicBody}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  arabicBody: event.target.value,
                }))
              }
              placeholder={
                locale === "ar" ? "نص الإعلان بالعربية" : "Arabic announcement"
              }
              className="min-h-24 rounded-xl border border-border bg-transparent p-3 text-sm"
            />
            <textarea
              required
              maxLength={6000}
              value={form.englishBody}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  englishBody: event.target.value,
                }))
              }
              placeholder={
                locale === "ar"
                  ? "نص الإعلان بالإنجليزية"
                  : "English announcement"
              }
              className="min-h-24 rounded-xl border border-border bg-transparent p-3 text-sm"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "الجمهور" : "Audience"}
              <select
                value={form.audience}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    audience: event.target
                      .value as CourseAnnouncementData["audience"],
                    selectedStudentIds: [],
                  }))
                }
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
              >
                <option value="Course">
                  {locale === "ar" ? "كل طلاب الدورة" : "All course learners"}
                </option>
                <option value="Unit">
                  {locale === "ar" ? "وحدة" : "Unit"}
                </option>
                <option value="SelectedStudents">
                  {locale === "ar" ? "طلاب محددون" : "Selected learners"}
                </option>
              </select>
            </label>
            {form.audience === "Unit" ? (
              <label className="grid gap-1 text-xs font-bold text-muted">
                {locale === "ar" ? "الوحدة" : "Unit"}
                <select
                  required
                  value={form.courseModuleId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      courseModuleId: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
                >
                  <option value="">
                    {locale === "ar" ? "اختر وحدة" : "Choose unit"}
                  </option>
                  {course.modules.map((module) => (
                    <option key={module.id} value={module.id}>
                      {locale === "ar"
                        ? module.arabicTitle
                        : module.englishTitle}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {form.audience === "SelectedStudents" ? (
            <fieldset className="grid gap-2 rounded-xl border border-border p-3">
              <legend className="px-1 text-xs font-bold text-muted">
                {locale === "ar" ? "اختر الطلاب" : "Choose learners"}
              </legend>
              {students.isPending ? (
                <span className="text-sm text-muted">…</span>
              ) : null}
              {students.data?.map((student) => (
                <label
                  key={student.id}
                  className="flex items-center gap-2 text-sm font-bold"
                >
                  <input
                    type="checkbox"
                    checked={form.selectedStudentIds.includes(student.id)}
                    onChange={() => toggleStudent(student.id)}
                    className="size-4 accent-[var(--primary)]"
                  />
                  {student.displayName}
                </label>
              ))}
            </fieldset>
          ) : null}
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={form.publish}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  publish: event.target.checked,
                }))
              }
              className="size-4 accent-[var(--primary)]"
            />
            {locale === "ar"
              ? "نشر وإرسال إشعار الآن"
              : "Publish and notify now"}
          </label>
          <button
            disabled={create.isPending}
            className="focus-ring w-fit rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
          >
            {form.publish
              ? locale === "ar"
                ? "نشر الإعلان"
                : "Publish announcement"
              : locale === "ar"
                ? "حفظ كمسودة"
                : "Save draft"}
          </button>
          <RequestError error={create.error} />
        </form>
      ) : null}
      <RequestError error={announcements.error} />
    </section>
  );
}

function CourseDetailsForm({
  course,
  disabled,
}: {
  course: CourseEditorData;
  disabled: boolean;
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [form, setForm] = useState({
    arabicTitle: course.arabicTitle,
    englishTitle: course.englishTitle,
    arabicDescription: course.arabicDescription,
    englishDescription: course.englishDescription,
    price: String(course.price),
    isFree: course.isFree,
  });
  const save = useMutation({
    mutationFn: () =>
      api(`/teacher/courses/${course.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          price: form.isFree ? 0 : Number(form.price),
        }),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["teacher-course", course.id] }),
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
      className="card grid gap-4 p-5"
    >
      <h2 className="flex items-center gap-2 text-xl font-black">
        <PencilLine size={20} className="text-primary" aria-hidden="true" />
        {locale === "ar" ? "معلومات الدورة" : "Course information"}
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label={locale === "ar" ? "العنوان بالعربية" : "Arabic title"}
          value={form.arabicTitle}
          disabled={disabled}
          onChange={(value) =>
            setForm((current) => ({ ...current, arabicTitle: value }))
          }
        />
        <TextField
          label={locale === "ar" ? "العنوان بالإنجليزية" : "English title"}
          value={form.englishTitle}
          disabled={disabled}
          onChange={(value) =>
            setForm((current) => ({ ...current, englishTitle: value }))
          }
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          multiline
          label={locale === "ar" ? "الوصف بالعربية" : "Arabic description"}
          value={form.arabicDescription}
          disabled={disabled}
          onChange={(value) =>
            setForm((current) => ({ ...current, arabicDescription: value }))
          }
        />
        <TextField
          multiline
          label={locale === "ar" ? "الوصف بالإنجليزية" : "English description"}
          value={form.englishDescription}
          disabled={disabled}
          onChange={(value) =>
            setForm((current) => ({ ...current, englishDescription: value }))
          }
        />
      </div>
      <label className="grid max-w-xs gap-1 text-sm font-bold text-muted">
        {locale === "ar" ? "السعر (JOD)" : "Price (JOD)"}
        <input
          type="number"
          min="0"
          step="0.001"
          disabled={disabled || form.isFree}
          value={form.price}
          onChange={(event) =>
            setForm((current) => ({ ...current, price: event.target.value }))
          }
          className="rounded-xl border border-border bg-transparent p-3 text-foreground disabled:opacity-50"
        />
      </label>
      <label className="flex items-center gap-2 text-sm font-bold">
        <input
          type="checkbox"
          checked={form.isFree}
          disabled={disabled}
          onChange={(event) =>
            setForm((current) => ({ ...current, isFree: event.target.checked }))
          }
          className="size-4 accent-[var(--primary)]"
        />
        {locale === "ar" ? "دورة مجانية" : "Free course"}
      </label>
      <button
        disabled={disabled || save.isPending}
        className="focus-ring w-fit rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
      >
        {locale === "ar" ? "حفظ التعديلات" : "Save changes"}
      </button>
      {save.isSuccess ? (
        <p role="status" className="text-sm font-bold text-primary">
          {locale === "ar" ? "تم حفظ التعديلات." : "Changes saved."}
        </p>
      ) : null}
      <RequestError error={save.error} />
    </form>
  );
}

function LearningAccessEditor({
  course,
  disabled,
}: {
  course: CourseEditorData;
  disabled: boolean;
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const access = useQuery({
    queryKey: ["course-learning-access", course.id],
    queryFn: () =>
      api<LearningAccessData>(`/teacher/courses/${course.id}/learning-access`),
  });
  const [targetKey, setTargetKey] = useState("");
  const [releaseMode, setReleaseMode] = useState<
    "Immediately" | LearningAccessData["rules"][number]["releaseMode"]
  >("Immediately");
  const [specificDate, setSpecificDate] = useState("");
  const [daysAfterEnrollment, setDaysAfterEnrollment] = useState("1");
  const [previousKey, setPreviousKey] = useState("");
  const [requiredKey, setRequiredKey] = useState("");
  const items = access.data?.items ?? [];
  const selected = items.find((item) => accessKey(item) === targetKey);
  const prerequisiteOptions = [
    ...items,
    ...(access.data?.prerequisiteCourses ?? []),
  ];
  const selectedRule = selected
    ? access.data?.rules.find(
        (rule) =>
          rule.targetType === selected.type && rule.targetId === selected.id,
      )
    : undefined;
  const refresh = () =>
    client.invalidateQueries({
      queryKey: ["course-learning-access", course.id],
    });
  const saveRelease = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Choose content first.");
      const previous = prerequisiteOptions.find(
        (item) => accessKey(item) === previousKey,
      );
      return api(`/teacher/courses/${course.id}/learning-access/release`, {
        method: "PUT",
        body: JSON.stringify({
          targetType: selected.type,
          targetId: selected.id,
          releaseMode,
          specificDateUtc:
            releaseMode === "SpecificDate" && specificDate
              ? new Date(specificDate).toISOString()
              : null,
          daysAfterEnrollment:
            releaseMode === "DaysAfterEnrollment"
              ? Number(daysAfterEnrollment)
              : null,
          previousContentType:
            releaseMode === "AfterPreviousContentCompletion"
              ? (previous?.type ?? null)
              : null,
          previousContentId:
            releaseMode === "AfterPreviousContentCompletion"
              ? (previous?.id ?? null)
              : null,
        }),
      });
    },
    onSuccess: refresh,
  });
  const addPrerequisite = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Choose content first.");
      const required = prerequisiteOptions.find(
        (item) => accessKey(item) === requiredKey,
      );
      if (!required) throw new Error("Choose a prerequisite.");
      return api(
        `/teacher/courses/${course.id}/learning-access/prerequisites`,
        {
          method: "POST",
          body: JSON.stringify({
            targetType: selected.type,
            targetId: selected.id,
            requiredContentType: required.type,
            requiredContentId: required.id,
          }),
        },
      );
    },
    onSuccess: () => {
      setRequiredKey("");
      refresh();
    },
  });
  const removePrerequisite = useMutation({
    mutationFn: (id: string) =>
      api(`/teacher/courses/${course.id}/learning-access/prerequisites/${id}`, {
        method: "DELETE",
      }),
    onSuccess: refresh,
  });
  const chooseTarget = (value: string) => {
    setTargetKey(value);
    const target = items.find((item) => accessKey(item) === value);
    const rule = target
      ? access.data?.rules.find(
          (item) =>
            item.targetType === target.type && item.targetId === target.id,
        )
      : undefined;
    setReleaseMode(rule?.releaseMode ?? "Immediately");
    setSpecificDate(toDateTimeLocalValue(rule?.specificDateUtc));
    setDaysAfterEnrollment(String(rule?.daysAfterEnrollment ?? 1));
    setPreviousKey(
      rule?.previousContentType && rule.previousContentId
        ? `${rule.previousContentType}:${rule.previousContentId}`
        : "",
    );
  };
  const itemLabel = (item?: LearningAccessItem) =>
    item
      ? `${contentTypeLabel(item.type, locale)} · ${locale === "ar" ? item.arabicTitle : item.englishTitle}`
      : locale === "ar"
        ? "محتوى غير موجود"
        : "Unavailable content";
  const selectedPrerequisites = selected
    ? (access.data?.prerequisites ?? []).filter(
        (item) =>
          item.targetType === selected.type && item.targetId === selected.id,
      )
    : [];
  return (
    <section className="card grid gap-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-black">
          <Clock3 size={20} className="text-primary" aria-hidden="true" />
          {locale === "ar"
            ? "إتاحة المحتوى والمتطلبات"
            : "Content release & prerequisites"}
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          {locale === "ar"
            ? "تُطبَّق الأقفال من الخادم على المشغّل والملفات والاختبارات والمهام، وليس من الواجهة فقط."
            : "Locks are enforced by the server for the player, files, quizzes, and assignments—not just in the interface."}
        </p>
      </div>
      {access.isPending ? (
        <p className="text-sm text-muted">…</p>
      ) : access.isError ? (
        <RequestError error={access.error} />
      ) : (
        <>
          <label className="grid gap-1 text-sm font-bold text-muted">
            {locale === "ar" ? "المحتوى المستهدف" : "Target content"}
            <select
              value={targetKey}
              onChange={(event) => chooseTarget(event.target.value)}
              disabled={disabled}
              className="min-w-0 rounded-xl border border-border bg-transparent p-3 text-foreground disabled:opacity-50"
            >
              <option value="">
                {locale === "ar"
                  ? "اختر دورة أو وحدة أو درسًا أو اختبارًا أو مهمة"
                  : "Choose a course item"}
              </option>
              {items.map((item) => (
                <option key={accessKey(item)} value={accessKey(item)}>
                  {itemLabel(item)}
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <div className="grid gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-bold text-muted">
                  {locale === "ar" ? "طريقة الإتاحة" : "Release method"}
                  <select
                    value={releaseMode}
                    onChange={(event) =>
                      setReleaseMode(event.target.value as typeof releaseMode)
                    }
                    disabled={disabled}
                    className="rounded-xl border border-border bg-transparent p-3 text-foreground disabled:opacity-50"
                  >
                    <option value="Immediately">
                      {locale === "ar" ? "فورًا" : "Immediately"}
                    </option>
                    <option value="SpecificDate">
                      {locale === "ar" ? "تاريخ ووقت محدد" : "Specific date"}
                    </option>
                    <option value="DaysAfterEnrollment">
                      {locale === "ar"
                        ? "أيام بعد التسجيل"
                        : "Days after enrollment"}
                    </option>
                    <option value="AfterPreviousContentCompletion">
                      {locale === "ar"
                        ? "بعد إكمال محتوى سابق"
                        : "After previous content"}
                    </option>
                  </select>
                </label>
                {releaseMode === "SpecificDate" ? (
                  <label className="grid gap-1 text-sm font-bold text-muted">
                    {locale === "ar" ? "تاريخ الإتاحة" : "Release date"}
                    <input
                      type="datetime-local"
                      value={specificDate}
                      onChange={(event) => setSpecificDate(event.target.value)}
                      disabled={disabled}
                      className="rounded-xl border border-border bg-transparent p-3 text-foreground disabled:opacity-50"
                    />
                  </label>
                ) : null}
                {releaseMode === "DaysAfterEnrollment" ? (
                  <label className="grid gap-1 text-sm font-bold text-muted">
                    {locale === "ar" ? "عدد الأيام" : "Number of days"}
                    <input
                      type="number"
                      min="0"
                      max="3650"
                      value={daysAfterEnrollment}
                      onChange={(event) =>
                        setDaysAfterEnrollment(event.target.value)
                      }
                      disabled={disabled}
                      className="rounded-xl border border-border bg-transparent p-3 text-foreground disabled:opacity-50"
                    />
                  </label>
                ) : null}
                {releaseMode === "AfterPreviousContentCompletion" ? (
                  <label className="grid gap-1 text-sm font-bold text-muted">
                    {locale === "ar" ? "المحتوى السابق" : "Previous content"}
                    <select
                      value={previousKey}
                      onChange={(event) => setPreviousKey(event.target.value)}
                      disabled={disabled}
                      className="rounded-xl border border-border bg-transparent p-3 text-foreground disabled:opacity-50"
                    >
                      <option value="">
                        {locale === "ar"
                          ? "اختر محتوى يجب إكماله"
                          : "Choose required content"}
                      </option>
                      {prerequisiteOptions
                        .filter((item) => accessKey(item) !== targetKey)
                        .map((item) => (
                          <option key={accessKey(item)} value={accessKey(item)}>
                            {itemLabel(item)}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <button
                type="button"
                disabled={
                  disabled ||
                  saveRelease.isPending ||
                  (releaseMode === "SpecificDate" && !specificDate) ||
                  (releaseMode === "AfterPreviousContentCompletion" &&
                    !previousKey)
                }
                onClick={() => saveRelease.mutate()}
                className="focus-ring w-fit rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
              >
                {selectedRule
                  ? locale === "ar"
                    ? "تحديث الإتاحة"
                    : "Update release"
                  : locale === "ar"
                    ? "حفظ الإتاحة"
                    : "Save release"}
              </button>
              <RequestError error={saveRelease.error} />
              <div className="border-t border-border pt-4">
                <h3 className="font-black text-foreground">
                  {locale === "ar"
                    ? "متطلبات إضافية"
                    : "Additional prerequisites"}
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {locale === "ar"
                    ? "يمكن إضافة أكثر من متطلب؛ يجب أن يحقق الطالب جميعها. يمنع النظام الحلقات تلقائيًا."
                    : "You can add more than one requirement; learners must complete all of them. Cycles are blocked automatically."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <select
                    value={requiredKey}
                    onChange={(event) => setRequiredKey(event.target.value)}
                    disabled={disabled}
                    className="min-w-64 flex-1 rounded-xl border border-border bg-transparent p-2.5 text-sm text-foreground disabled:opacity-50"
                  >
                    <option value="">
                      {locale === "ar"
                        ? "اختر متطلبًا"
                        : "Choose a prerequisite"}
                    </option>
                    {prerequisiteOptions
                      .filter((item) => accessKey(item) !== targetKey)
                      .map((item) => (
                        <option key={accessKey(item)} value={accessKey(item)}>
                          {itemLabel(item)}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={
                      disabled || !requiredKey || addPrerequisite.isPending
                    }
                    onClick={() => addPrerequisite.mutate()}
                    className="focus-ring rounded-xl border border-primary/40 px-4 py-2 text-sm font-black text-primary disabled:opacity-50"
                  >
                    {locale === "ar" ? "إضافة متطلب" : "Add prerequisite"}
                  </button>
                </div>
                <div className="mt-3 grid gap-2">
                  {selectedPrerequisites.length ? (
                    selectedPrerequisites.map((item) => {
                      const required = prerequisiteOptions.find(
                        (candidate) =>
                          candidate.type === item.requiredContentType &&
                          candidate.id === item.requiredContentId,
                      );
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-solid/30 px-3 py-2 text-sm"
                        >
                          <span>{itemLabel(required)}</span>
                          <button
                            type="button"
                            disabled={disabled || removePrerequisite.isPending}
                            onClick={() => removePrerequisite.mutate(item.id)}
                            className="focus-ring rounded-lg p-1.5 text-red-500 disabled:opacity-50"
                            aria-label={
                              locale === "ar"
                                ? "حذف المتطلب"
                                : "Remove prerequisite"
                            }
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted">
                      {locale === "ar"
                        ? "لا توجد متطلبات إضافية."
                        : "No additional prerequisites."}
                    </p>
                  )}
                </div>
              </div>
              <RequestError error={addPrerequisite.error} />
              <RequestError error={removePrerequisite.error} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function accessKey(item: Pick<LearningAccessItem, "type" | "id">) {
  return `${item.type}:${item.id}`;
}

function contentTypeLabel(type: LearningAccessItem["type"], locale: string) {
  const labels: Record<LearningAccessItem["type"], [string, string]> = {
    Course: ["دورة", "Course"],
    Unit: ["وحدة", "Unit"],
    Lesson: ["درس", "Lesson"],
    Quiz: ["اختبار", "Quiz"],
    Assignment: ["مهمة", "Assignment"],
  };
  return labels[type][locale === "ar" ? 0 : 1];
}

function CoverManager({
  course,
  disabled,
}: {
  course: CourseEditorData;
  disabled: boolean;
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const upload = useMutation({
    mutationFn: () => {
      const body = new FormData();
      body.set("file", files[0]);
      body.set("seoTitle", course.seoTitle || course.englishTitle);
      body.set(
        "seoDescription",
        course.seoDescription || course.englishDescription,
      );
      return api(`/teacher/courses/${course.id}/cover`, {
        method: "POST",
        body,
      });
    },
    onSuccess: () => {
      setFiles([]);
      client.invalidateQueries({ queryKey: ["teacher-course", course.id] });
    },
  });
  return (
    <section className="card grid gap-4 p-5">
      <h2 className="flex items-center gap-2 text-lg font-black">
        <ImageIcon size={19} className="text-primary" aria-hidden="true" />
        {locale === "ar" ? "غلاف الدورة" : "Course cover"}
      </h2>
      {course.hasCover ? (
        <img
          src={`/api/v1/teacher/courses/${course.id}/cover`}
          alt={
            locale === "ar"
              ? `غلاف ${course.arabicTitle}`
              : `${course.englishTitle} cover`
          }
          className="aspect-video w-full rounded-xl border border-border object-cover"
        />
      ) : (
        <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-border text-sm text-muted">
          {locale === "ar"
            ? "لم يتم رفع غلاف بعد."
            : "No cover has been uploaded."}
        </div>
      )}
      <FilePicker
        label={locale === "ar" ? "صورة الغلاف" : "Cover image"}
        files={files}
        onFilesChange={setFiles}
        locale={locale}
        accept="image/jpeg,image/png,image/webp"
        maxFileBytes={5 * 1024 * 1024}
        disabled={disabled}
        chooseLabel={locale === "ar" ? "اختيار غلاف" : "Choose cover"}
        helpText={
          locale === "ar"
            ? "JPG أو PNG أو WEBP، حتى 5MB."
            : "JPG, PNG, or WEBP up to 5MB."
        }
      />
      <button
        type="button"
        disabled={disabled || !files.length || upload.isPending}
        onClick={() => upload.mutate()}
        className="focus-ring inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
      >
        <Upload size={17} aria-hidden="true" />
        {locale === "ar" ? "رفع الغلاف" : "Upload cover"}
      </button>
      <RequestError error={upload.error} />
    </section>
  );
}

function OutcomesEditor({
  course,
  disabled,
}: {
  course: CourseEditorData;
  disabled: boolean;
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [arabicText, setArabicText] = useState("");
  const [englishText, setEnglishText] = useState("");
  const add = useMutation({
    mutationFn: () =>
      api("/teacher/courses/outcomes", {
        method: "POST",
        body: JSON.stringify({
          courseId: course.id,
          arabicText,
          englishText,
          sortOrder: course.outcomes.length + 1,
        }),
      }),
    onSuccess: () => {
      setArabicText("");
      setEnglishText("");
      client.invalidateQueries({ queryKey: ["teacher-course", course.id] });
    },
  });
  return (
    <section className="card p-5">
      <h2 className="text-lg font-black">
        {locale === "ar" ? "نواتج التعلّم" : "Learning outcomes"}
      </h2>
      <ul className="mt-3 grid gap-2 text-sm text-muted">
        {course.outcomes.map((outcome) => (
          <li key={outcome.id} className="rounded-xl border border-border p-3">
            <strong className="block text-foreground">
              {outcome.arabicText}
            </strong>
            <span>{outcome.englishText}</span>
          </li>
        ))}
      </ul>
      {!disabled ? (
        <div className="mt-4 grid gap-2">
          <input
            value={arabicText}
            onChange={(event) => setArabicText(event.target.value)}
            placeholder={locale === "ar" ? "ناتج بالعربية" : "Arabic outcome"}
            className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
          />
          <input
            value={englishText}
            onChange={(event) => setEnglishText(event.target.value)}
            placeholder={
              locale === "ar" ? "ناتج بالإنجليزية" : "English outcome"
            }
            className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
          />
          <button
            type="button"
            disabled={
              !arabicText.trim() || !englishText.trim() || add.isPending
            }
            onClick={() => add.mutate()}
            className="focus-ring w-fit rounded-lg border border-primary/40 px-3 py-2 text-sm font-bold text-primary disabled:opacity-50"
          >
            {locale === "ar" ? "إضافة ناتج" : "Add outcome"}
          </button>
        </div>
      ) : null}
      <RequestError error={add.error} />
    </section>
  );
}

export function CurriculumEditor({
  course,
  disabled,
}: {
  course: CourseEditorData;
  disabled: boolean;
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const academicUnits = useQuery({
    queryKey: ["teacher-course-academic-units", course.id],
    queryFn: () =>
      api<AcademicUnitOption[]>(`/teacher/courses/${course.id}/academic-units`),
    enabled: course.isBtecFocused,
  });
  const [unitDefinitionId, setUnitDefinitionId] = useState("");
  const [arabicTitle, setArabicTitle] = useState("");
  const [englishTitle, setEnglishTitle] = useState("");
  const [unitCode, setUnitCode] = useState("");
  const addModule = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/teacher/courses/modules", {
        method: "POST",
        body: JSON.stringify({
          courseId: course.id,
          unitDefinitionId: course.isBtecFocused ? unitDefinitionId : null,
          arabicTitle,
          englishTitle: englishTitle.trim() || arabicTitle.trim(),
          unitCode: unitCode || null,
          sortOrder: course.modules.length + 1,
        }),
      }),
    onSuccess: () => {
      setArabicTitle("");
      setEnglishTitle("");
      setUnitCode("");
      setUnitDefinitionId("");
      client.invalidateQueries({ queryKey: ["teacher-course", course.id] });
      client.invalidateQueries({
        queryKey: ["teacher-course-academic-units", course.id],
      });
    },
  });
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black">
            <BookOpenCheck
              size={20}
              className="text-primary"
              aria-hidden="true"
            />
            {locale === "ar" ? "محتوى الدورة" : "Course content"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {locale === "ar"
              ? "أضف الوحدات والدروس، واكتب محتوى الدرس وارفع الموارد الخاصة به."
              : "Add modules and lessons, write lesson content, and upload private resources."}
          </p>
        </div>
      </div>
      {course.modules.length ? (
        <div className="mt-5 grid gap-4">
          {course.modules.map((module) => (
            <ModuleEditor
              key={module.id}
              module={module}
              courseId={course.id}
              disabled={disabled}
              isBtecFocused={course.isBtecFocused}
              academicUnits={academicUnits.data ?? []}
            />
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted">
          {locale === "ar" ? "لا توجد وحدات بعد." : "No modules yet."}
        </p>
      )}
      {!disabled ? (
        <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <h3 className="flex items-center gap-2 font-black">
            <FolderPlus size={18} className="text-primary" aria-hidden="true" />
            {locale === "ar" ? "إضافة وحدة" : "Add module"}
          </h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {course.isBtecFocused ? (
              <label className="grid gap-1 text-sm font-bold md:col-span-2">
                {locale === "ar" ? "الوحدة الأكاديمية" : "Academic unit"}
                <select
                  value={unitDefinitionId}
                  onChange={(event) => setUnitDefinitionId(event.target.value)}
                  className="rounded-xl border border-border bg-surface-solid p-3"
                  aria-label={
                    locale === "ar" ? "الوحدة الأكاديمية" : "Academic unit"
                  }
                >
                  <option value="">
                    {locale === "ar"
                      ? "اختر وحدة منشورة"
                      : "Choose a published unit"}
                  </option>
                  {academicUnits.data?.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.qualificationCode} / {unit.versionCode} ·{" "}
                      {unit.code} ·{" "}
                      {locale === "ar" ? unit.arabicTitle : unit.englishTitle}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <input
                  value={arabicTitle}
                  onChange={(event) => setArabicTitle(event.target.value)}
                  placeholder={
                    locale === "ar"
                      ? "اسم الوحدة بالعربية"
                      : "Arabic module title"
                  }
                  className="rounded-xl border border-border bg-transparent p-3"
                />
                <input
                  value={unitCode}
                  onChange={(event) => setUnitCode(event.target.value)}
                  placeholder={
                    locale === "ar"
                      ? "رمز الوحدة (مثال: UNIT-1)"
                      : "Unit code (e.g. UNIT-1)"
                  }
                  className="rounded-xl border border-border bg-transparent p-3"
                />
                <input
                  value={englishTitle}
                  onChange={(event) => setEnglishTitle(event.target.value)}
                  placeholder={
                    locale === "ar"
                      ? "اسم الوحدة بالإنجليزية (اختياري)"
                      : "English module title (optional)"
                  }
                  className="rounded-xl border border-border bg-transparent p-3"
                />
              </>
            )}
          </div>
          {course.isBtecFocused && academicUnits.isError ? (
            <p className="mt-2 text-sm text-red-400">
              {locale === "ar"
                ? "تعذر تحميل الوحدات الأكاديمية."
                : "Could not load academic units."}
            </p>
          ) : null}
          {course.isBtecFocused &&
          academicUnits.isSuccess &&
          academicUnits.data.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              {locale === "ar"
                ? "لا توجد وحدات منشورة لهذا الإصدار. اطلب من المدير نشر وحدة أكاديمية."
                : "No published units are available for this version. Ask an admin to publish an academic unit."}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => addModule.mutate()}
            disabled={
              addModule.isPending ||
              (course.isBtecFocused ? !unitDefinitionId : !arabicTitle.trim())
            }
            className="focus-ring mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
          >
            <Plus size={17} aria-hidden="true" />
            {locale === "ar" ? "إضافة الوحدة" : "Add module"}
          </button>
          <RequestError error={addModule.error} />
        </div>
      ) : null}
    </section>
  );
}

function ModuleEditor({
  module,
  courseId,
  disabled,
  isBtecFocused,
  academicUnits,
}: {
  module: CourseEditorData["modules"][number];
  courseId: string;
  disabled: boolean;
  isBtecFocused: boolean;
  academicUnits: AcademicUnitOption[];
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [legacyUnitDefinitionId, setLegacyUnitDefinitionId] = useState("");
  const [titles, setTitles] = useState({
    arabicTitle: module.arabicTitle,
    englishTitle: module.englishTitle,
  });
  const [unitDetails, setUnitDetails] = useState({
    unitCode: module.unitCode || "",
    arabicDescription: module.arabicDescription || "",
    englishDescription: module.englishDescription || "",
    guidedLearningHours: module.guidedLearningHours?.toString() || "",
    credits: module.credits?.toString() || "",
    qualificationLevel: module.qualificationLevel || "",
    publicationStatus: module.publicationStatus || "Published",
    availableFromUtc: toDateTimeLocalValue(module.availableFromUtc),
    sortOrder: String(module.sortOrder),
  });
  const [lesson, setLesson] = useState({
    arabicTitle: "",
    englishTitle: "",
    arabicBody: "",
    englishBody: "",
    type: "Text",
    durationSeconds: "900",
    isPreview: false,
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["teacher-course", courseId] });
  const save = useMutation({
    mutationFn: () =>
      api(`/teacher/courses/modules/${module.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...titles,
          ...unitDetails,
          guidedLearningHours: unitDetails.guidedLearningHours
            ? Number(unitDetails.guidedLearningHours)
            : null,
          credits: unitDetails.credits ? Number(unitDetails.credits) : null,
          sortOrder: Number(unitDetails.sortOrder),
          availableFromUtc:
            unitDetails.publicationStatus === "Scheduled" &&
            unitDetails.availableFromUtc
              ? new Date(unitDetails.availableFromUtc).toISOString()
              : null,
        }),
      }),
    onSuccess: refresh,
  });
  const deleteModule = useMutation({
    mutationFn: () =>
      api(`/teacher/courses/modules/${module.id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const duplicateModule = useMutation({
    mutationFn: () =>
      api(`/teacher/courses/modules/${module.id}/duplicate`, {
        method: "POST",
      }),
    onSuccess: refresh,
  });
  const linkModule = useMutation({
    mutationFn: () =>
      api(`/teacher/courses/modules/${module.id}/academic-link`, {
        method: "POST",
        body: JSON.stringify({ unitDefinitionId: legacyUnitDefinitionId }),
      }),
    onSuccess: () => {
      setLegacyUnitDefinitionId("");
      refresh();
      client.invalidateQueries({
        queryKey: ["teacher-course-academic-units", courseId],
      });
    },
  });
  const addLesson = useMutation({
    mutationFn: () =>
      api("/teacher/courses/lessons", {
        method: "POST",
        body: JSON.stringify({
          moduleId: module.id,
          ...lesson,
          englishTitle: lesson.englishTitle.trim() || lesson.arabicTitle.trim(),
          englishBody: lesson.englishBody.trim() || lesson.arabicBody.trim(),
          durationSeconds: Number(lesson.durationSeconds),
          sortOrder: module.lessons.length + 1,
        }),
      }),
    onSuccess: () => {
      setLesson({
        arabicTitle: "",
        englishTitle: "",
        arabicBody: "",
        englishBody: "",
        type: "Text",
        durationSeconds: "900",
        isPreview: false,
      });
      refresh();
    },
  });
  return (
    <article className="rounded-2xl border border-border bg-black/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-black">
          {locale === "ar" ? module.arabicTitle : module.englishTitle}
        </h3>
        {!disabled ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="focus-ring rounded-lg border border-primary/40 px-3 py-2 text-xs font-bold text-primary"
            >
              {locale === "ar" ? "حفظ الوحدة" : "Save unit"}
            </button>
            <button
              type="button"
              onClick={() => duplicateModule.mutate()}
              disabled={
                duplicateModule.isPending || Boolean(module.unitDefinitionId)
              }
              className="focus-ring inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold"
            >
              <Copy size={14} aria-hidden="true" />
              {locale === "ar" ? "تكرار" : "Duplicate"}
            </button>
            <button
              type="button"
              onClick={() => deleteModule.mutate()}
              disabled={deleteModule.isPending}
              className="focus-ring inline-flex items-center gap-1 rounded-lg border border-red-400/40 px-3 py-2 text-xs font-bold text-red-400"
            >
              <Trash2 size={14} aria-hidden="true" />
              {locale === "ar" ? "حذف" : "Delete"}
            </button>
          </div>
        ) : null}
      </div>
      {isBtecFocused && !module.unitDefinitionId ? (
        <div className="mt-3 rounded-xl border border-amber-400/40 p-3 text-sm">
          <p>
            {locale === "ar"
              ? "وحدة قديمة بلا ربط أكاديمي. تبقى الدروس والتقدم متاحين. يمكن ربطها فقط إذا لم تتضمن أهدافاً أو معايير قديمة."
              : "Legacy unit without an academic link. Lessons and progress remain available. It can be linked only when it has no legacy aims or criteria."}
          </p>
          {!disabled &&
          module.learningAims.length === 0 &&
          module.criteria.length === 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <select
                value={legacyUnitDefinitionId}
                onChange={(event) =>
                  setLegacyUnitDefinitionId(event.target.value)
                }
                aria-label={
                  locale === "ar" ? "ربط بوحدة أكاديمية" : "Link academic unit"
                }
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface-solid p-2"
              >
                <option value="">
                  {locale === "ar"
                    ? "اختر وحدة منشورة"
                    : "Choose a published unit"}
                </option>
                {academicUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.qualificationCode} / {unit.versionCode} · {unit.code}{" "}
                    · {locale === "ar" ? unit.arabicTitle : unit.englishTitle}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => linkModule.mutate()}
                disabled={!legacyUnitDefinitionId || linkModule.isPending}
                className="focus-ring rounded-lg border border-primary/40 px-3 py-2 font-bold disabled:opacity-50"
              >
                {locale === "ar" ? "ربط الوحدة" : "Link unit"}
              </button>
            </div>
          ) : null}
          <RequestError error={linkModule.error} />
        </div>
      ) : null}
      {!disabled ? (
        <>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {!module.unitDefinitionId ? (
              <>
                <input
                  value={titles.arabicTitle}
                  onChange={(event) =>
                    setTitles((current) => ({
                      ...current,
                      arabicTitle: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
                />
                <input
                  value={titles.englishTitle}
                  onChange={(event) =>
                    setTitles((current) => ({
                      ...current,
                      englishTitle: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
                />
                <input
                  value={unitDetails.unitCode}
                  onChange={(event) =>
                    setUnitDetails((current) => ({
                      ...current,
                      unitCode: event.target.value,
                    }))
                  }
                  placeholder={locale === "ar" ? "رمز الوحدة" : "Unit code"}
                  className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
                />
                <input
                  value={unitDetails.qualificationLevel}
                  onChange={(event) =>
                    setUnitDetails((current) => ({
                      ...current,
                      qualificationLevel: event.target.value,
                    }))
                  }
                  placeholder={
                    locale === "ar" ? "المستوى / المؤهل" : "Qualification level"
                  }
                  className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
                />
              </>
            ) : (
              <p className="text-sm text-muted md:col-span-2">
                {locale === "ar"
                  ? "اسم الوحدة ورمزها وأهدافها ومعاييرها من الدليل الأكاديمي المنشور."
                  : "Unit name, code, aims, and criteria come from the published academic catalogue."}
              </p>
            )}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <textarea
              value={unitDetails.arabicDescription}
              onChange={(event) =>
                setUnitDetails((current) => ({
                  ...current,
                  arabicDescription: event.target.value,
                }))
              }
              placeholder={
                locale === "ar"
                  ? "وصف الوحدة بالعربية"
                  : "Arabic unit description"
              }
              className="min-h-20 rounded-xl border border-border bg-transparent p-2.5 text-sm"
            />
            <textarea
              value={unitDetails.englishDescription}
              onChange={(event) =>
                setUnitDetails((current) => ({
                  ...current,
                  englishDescription: event.target.value,
                }))
              }
              placeholder={
                locale === "ar"
                  ? "وصف الوحدة بالإنجليزية"
                  : "English unit description"
              }
              className="min-h-20 rounded-xl border border-border bg-transparent p-2.5 text-sm"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              type="number"
              min="0"
              value={unitDetails.guidedLearningHours}
              onChange={(event) =>
                setUnitDetails((current) => ({
                  ...current,
                  guidedLearningHours: event.target.value,
                }))
              }
              aria-label={
                locale === "ar"
                  ? "ساعات التعلّم الموجّه"
                  : "Guided learning hours"
              }
              placeholder={locale === "ar" ? "GLH" : "GLH"}
              className="w-28 rounded-xl border border-border bg-transparent p-2.5 text-sm"
            />
            <input
              type="number"
              min="0"
              value={unitDetails.credits}
              onChange={(event) =>
                setUnitDetails((current) => ({
                  ...current,
                  credits: event.target.value,
                }))
              }
              aria-label={locale === "ar" ? "اعتمادات الوحدة" : "Unit credits"}
              placeholder={locale === "ar" ? "الاعتمادات" : "Credits"}
              className="w-32 rounded-xl border border-border bg-transparent p-2.5 text-sm"
            />
            <select
              value={unitDetails.publicationStatus}
              onChange={(event) =>
                setUnitDetails((current) => ({
                  ...current,
                  publicationStatus: event.target.value,
                }))
              }
              className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
            >
              <option value="Published">
                {locale === "ar" ? "منشور داخل الدورة" : "Published in course"}
              </option>
              <option value="Draft">
                {locale === "ar" ? "مسودة" : "Draft"}
              </option>
              <option value="Archived">
                {locale === "ar" ? "مؤرشف" : "Archived"}
              </option>
              <option value="Scheduled">
                {locale === "ar" ? "مجدول" : "Scheduled"}
              </option>
            </select>
            {unitDetails.publicationStatus === "Scheduled" ? (
              <label className="grid gap-1 text-xs font-bold text-muted">
                {locale === "ar" ? "وقت إتاحة الوحدة" : "Unit release time"}
                <input
                  type="datetime-local"
                  required
                  value={unitDetails.availableFromUtc}
                  onChange={(event) =>
                    setUnitDetails((current) => ({
                      ...current,
                      availableFromUtc: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
                />
              </label>
            ) : null}
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "ترتيب الوحدة" : "Unit order"}
              <input
                type="number"
                min="0"
                value={unitDetails.sortOrder}
                onChange={(event) =>
                  setUnitDetails((current) => ({
                    ...current,
                    sortOrder: event.target.value,
                  }))
                }
                className="w-28 rounded-xl border border-border bg-transparent p-2.5 text-sm"
              />
            </label>
          </div>
        </>
      ) : null}
      <BtecStructureEditor
        module={module}
        courseId={courseId}
        disabled={disabled}
        academicLocked={Boolean(module.unitDefinitionId)}
        allowAcademicCreation={!isBtecFocused}
      />
      <div className="mt-4 grid gap-3">
        {module.lessons.map((item) => (
          <LessonEditor
            key={item.id}
            lesson={item}
            module={module}
            courseId={courseId}
            disabled={disabled}
          />
        ))}
      </div>
      {!disabled ? (
        <div className="mt-4 rounded-xl border border-border bg-surface-solid/35 p-4">
          <h4 className="font-black">
            {locale === "ar" ? "إضافة درس" : "Add lesson"}
          </h4>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              value={lesson.arabicTitle}
              onChange={(event) =>
                setLesson((current) => ({
                  ...current,
                  arabicTitle: event.target.value,
                }))
              }
              placeholder={
                locale === "ar" ? "عنوان الدرس بالعربية" : "Arabic lesson title"
              }
              className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
            />
            <input
              value={lesson.englishTitle}
              onChange={(event) =>
                setLesson((current) => ({
                  ...current,
                  englishTitle: event.target.value,
                }))
              }
              placeholder={
                locale === "ar"
                  ? "عنوان الدرس بالإنجليزية (اختياري)"
                  : "English lesson title (optional)"
              }
              className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
            />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <textarea
              value={lesson.arabicBody}
              onChange={(event) =>
                setLesson((current) => ({
                  ...current,
                  arabicBody: event.target.value,
                }))
              }
              placeholder={
                locale === "ar"
                  ? "محتوى الدرس بالعربية"
                  : "Arabic lesson content"
              }
              className="min-h-24 rounded-xl border border-border bg-transparent p-2.5 text-sm"
            />
            <textarea
              value={lesson.englishBody}
              onChange={(event) =>
                setLesson((current) => ({
                  ...current,
                  englishBody: event.target.value,
                }))
              }
              placeholder={
                locale === "ar"
                  ? "محتوى الدرس بالإنجليزية (اختياري)"
                  : "English lesson content (optional)"
              }
              className="min-h-24 rounded-xl border border-border bg-transparent p-2.5 text-sm"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              value={lesson.type}
              onChange={(event) =>
                setLesson((current) => ({
                  ...current,
                  type: event.target.value,
                }))
              }
              className="rounded-xl border border-border bg-transparent p-2 text-sm"
            >
              <option value="Text">Text</option>
              <option value="Video">Video</option>
              <option value="Activity">Activity</option>
              <option value="Quiz">Quiz</option>
              <option value="Assignment">Assignment</option>
              <option value="LiveSession">Live session</option>
            </select>
            <input
              type="number"
              min="0"
              value={lesson.durationSeconds}
              onChange={(event) =>
                setLesson((current) => ({
                  ...current,
                  durationSeconds: event.target.value,
                }))
              }
              className="w-32 rounded-xl border border-border bg-transparent p-2 text-sm"
              aria-label={
                locale === "ar"
                  ? "مدة الدرس بالثواني"
                  : "Lesson duration in seconds"
              }
            />
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={lesson.isPreview}
                onChange={(event) =>
                  setLesson((current) => ({
                    ...current,
                    isPreview: event.target.checked,
                  }))
                }
                className="size-4 accent-[var(--primary)]"
              />
              {locale === "ar" ? "درس تجريبي" : "Preview lesson"}
            </label>
          </div>
          <button
            type="button"
            onClick={() => addLesson.mutate()}
            disabled={!lesson.arabicTitle.trim() || addLesson.isPending}
            className="focus-ring mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
          >
            <Plus size={17} aria-hidden="true" />
            {locale === "ar" ? "إضافة الدرس" : "Add lesson"}
          </button>
          <RequestError error={addLesson.error} />
        </div>
      ) : null}
      <RequestError error={save.error} />
      <RequestError error={deleteModule.error} />
      <RequestError error={duplicateModule.error} />
    </article>
  );
}

function BtecStructureEditor({
  module,
  courseId,
  disabled,
  academicLocked,
  allowAcademicCreation,
}: {
  module: CourseEditorData["modules"][number];
  courseId: string;
  disabled: boolean;
  academicLocked: boolean;
  allowAcademicCreation: boolean;
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [aim, setAim] = useState({
    code: "",
    arabicTitle: "",
    englishTitle: "",
    arabicDescription: "",
    englishDescription: "",
  });
  const [criterion, setCriterion] = useState({
    learningAimId: "",
    code: "",
    band: "Pass",
    arabicDescription: "",
    englishDescription: "",
    arabicEvidenceGuidance: "",
    englishEvidenceGuidance: "",
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["teacher-course", courseId] });
  const addAim = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/teacher/courses/learning-aims", {
        method: "POST",
        body: JSON.stringify({
          moduleId: module.id,
          ...aim,
          sortOrder: module.learningAims.length + 1,
        }),
      }),
    onSuccess: () => {
      setAim({
        code: "",
        arabicTitle: "",
        englishTitle: "",
        arabicDescription: "",
        englishDescription: "",
      });
      refresh();
    },
  });
  const addCriterion = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/teacher/courses/criteria", {
        method: "POST",
        body: JSON.stringify({
          moduleId: module.id,
          ...criterion,
          learningAimId: criterion.learningAimId || null,
          sortOrder: module.criteria.length + 1,
        }),
      }),
    onSuccess: () => {
      setCriterion({
        learningAimId: "",
        code: "",
        band: "Pass",
        arabicDescription: "",
        englishDescription: "",
        arabicEvidenceGuidance: "",
        englishEvidenceGuidance: "",
      });
      refresh();
    },
  });

  return (
    <section className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        <Target size={18} className="text-primary" aria-hidden="true" />
        <div>
          <h4 className="font-black">
            {locale === "ar"
              ? "هيكل BTEC ومعاييره"
              : "BTEC structure & criteria"}
          </h4>
          <p className="mt-1 text-xs leading-5 text-muted">
            {locale === "ar"
              ? "رتّب هدف التعلّم ثم الموضوعات ومعايير P/M/D المرتبطة بهذه الوحدة."
              : "Structure learning aims, topics, and the P/M/D criteria for this unit."}
          </p>
        </div>
      </div>
      {module.learningAims.length ? (
        <div className="mt-4 grid gap-3">
          {module.learningAims.map((item) => (
            <LearningAimEditor
              key={item.id}
              aim={item}
              courseId={courseId}
              disabled={disabled}
              academicLocked={academicLocked}
            />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">
          {locale === "ar"
            ? "لم تضف أهداف تعلّم بعد."
            : "No learning aims yet."}
        </p>
      )}
      {!disabled && allowAcademicCreation ? (
        <div className="mt-4 grid gap-3 rounded-xl border border-border bg-surface-solid/45 p-3 md:grid-cols-2">
          <input
            value={aim.code}
            onChange={(event) =>
              setAim((current) => ({ ...current, code: event.target.value }))
            }
            placeholder={locale === "ar" ? "رمز الهدف (A)" : "Aim code (A)"}
            className="rounded-lg border border-border bg-transparent p-2.5 text-sm"
          />
          <input
            value={aim.arabicTitle}
            onChange={(event) =>
              setAim((current) => ({
                ...current,
                arabicTitle: event.target.value,
              }))
            }
            placeholder={
              locale === "ar" ? "هدف التعلّم بالعربية" : "Arabic learning aim"
            }
            className="rounded-lg border border-border bg-transparent p-2.5 text-sm"
          />
          <input
            value={aim.englishTitle}
            onChange={(event) =>
              setAim((current) => ({
                ...current,
                englishTitle: event.target.value,
              }))
            }
            placeholder={
              locale === "ar"
                ? "هدف التعلّم بالإنجليزية"
                : "English learning aim"
            }
            className="rounded-lg border border-border bg-transparent p-2.5 text-sm"
          />
          <button
            type="button"
            onClick={() => addAim.mutate()}
            disabled={
              !aim.code.trim() ||
              !aim.arabicTitle.trim() ||
              !aim.englishTitle.trim() ||
              addAim.isPending
            }
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
          >
            <Plus size={16} aria-hidden="true" />
            {locale === "ar" ? "إضافة هدف تعلّم" : "Add learning aim"}
          </button>
          <textarea
            value={aim.arabicDescription}
            onChange={(event) =>
              setAim((current) => ({
                ...current,
                arabicDescription: event.target.value,
              }))
            }
            placeholder={
              locale === "ar"
                ? "شرح عربي اختياري"
                : "Optional Arabic description"
            }
            className="min-h-16 rounded-lg border border-border bg-transparent p-2.5 text-sm"
          />
          <textarea
            value={aim.englishDescription}
            onChange={(event) =>
              setAim((current) => ({
                ...current,
                englishDescription: event.target.value,
              }))
            }
            placeholder={
              locale === "ar"
                ? "شرح إنجليزي اختياري"
                : "Optional English description"
            }
            className="min-h-16 rounded-lg border border-border bg-transparent p-2.5 text-sm"
          />
        </div>
      ) : null}
      <div className="mt-4 border-t border-border pt-4">
        <h5 className="font-black">
          {locale === "ar" ? "معايير الوحدة" : "Unit criteria"}
        </h5>
        {module.criteria.length ? (
          <div className="mt-3 grid gap-3">
            {module.criteria.map((item) => (
              <CriterionEditor
                key={item.id}
                criterion={item}
                courseId={courseId}
                disabled={disabled || academicLocked}
              />
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {locale === "ar" ? "لا توجد معايير بعد." : "No criteria yet."}
          </p>
        )}
        {!disabled && allowAcademicCreation ? (
          <div className="mt-3 grid gap-3 rounded-xl border border-border bg-surface-solid/45 p-3 md:grid-cols-2">
            <select
              value={criterion.learningAimId}
              onChange={(event) =>
                setCriterion((current) => ({
                  ...current,
                  learningAimId: event.target.value,
                }))
              }
              className="rounded-lg border border-border bg-transparent p-2.5 text-sm"
            >
              <option value="">
                {locale === "ar"
                  ? "هدف تعلّم اختياري"
                  : "Optional learning aim"}
              </option>
              {module.learningAims.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} —{" "}
                  {locale === "ar" ? item.arabicTitle : item.englishTitle}
                </option>
              ))}
            </select>
            <input
              value={criterion.code}
              onChange={(event) =>
                setCriterion((current) => ({
                  ...current,
                  code: event.target.value,
                }))
              }
              placeholder="A.P1"
              className="rounded-lg border border-border bg-transparent p-2.5 text-sm"
            />
            <select
              value={criterion.band}
              onChange={(event) =>
                setCriterion((current) => ({
                  ...current,
                  band: event.target.value,
                }))
              }
              className="rounded-lg border border-border bg-transparent p-2.5 text-sm"
            >
              <option value="Pass">P — Pass</option>
              <option value="Merit">M — Merit</option>
              <option value="Distinction">D — Distinction</option>
            </select>
            <input
              value={criterion.arabicDescription}
              onChange={(event) =>
                setCriterion((current) => ({
                  ...current,
                  arabicDescription: event.target.value,
                }))
              }
              placeholder={
                locale === "ar"
                  ? "وصف المعيار بالعربية"
                  : "Arabic criterion description"
              }
              className="rounded-lg border border-border bg-transparent p-2.5 text-sm"
            />
            <input
              value={criterion.englishDescription}
              onChange={(event) =>
                setCriterion((current) => ({
                  ...current,
                  englishDescription: event.target.value,
                }))
              }
              placeholder={
                locale === "ar"
                  ? "وصف المعيار بالإنجليزية"
                  : "English criterion description"
              }
              className="rounded-lg border border-border bg-transparent p-2.5 text-sm"
            />
            <button
              type="button"
              onClick={() => addCriterion.mutate()}
              disabled={
                !criterion.code.trim() ||
                !criterion.arabicDescription.trim() ||
                !criterion.englishDescription.trim() ||
                addCriterion.isPending
              }
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
            >
              <Plus size={16} aria-hidden="true" />
              {locale === "ar" ? "إضافة معيار" : "Add criterion"}
            </button>
          </div>
        ) : null}
      </div>
      <RequestError error={addAim.error} />
      <RequestError error={addCriterion.error} />
    </section>
  );
}

function LearningAimEditor({
  aim,
  courseId,
  disabled,
  academicLocked,
}: {
  aim: LearningAimData;
  courseId: string;
  disabled: boolean;
  academicLocked: boolean;
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [form, setForm] = useState({
    code: aim.code,
    arabicTitle: aim.arabicTitle,
    englishTitle: aim.englishTitle,
    arabicDescription: aim.arabicDescription || "",
    englishDescription: aim.englishDescription || "",
    sortOrder: String(aim.sortOrder),
  });
  const [topic, setTopic] = useState({
    arabicTitle: "",
    englishTitle: "",
    arabicDescription: "",
    englishDescription: "",
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["teacher-course", courseId] });
  const save = useMutation({
    mutationFn: () =>
      api(`/teacher/courses/learning-aims/${aim.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...form, sortOrder: Number(form.sortOrder) }),
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () =>
      api(`/teacher/courses/learning-aims/${aim.id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const addTopic = useMutation({
    mutationFn: () =>
      api("/teacher/courses/topics", {
        method: "POST",
        body: JSON.stringify({
          learningAimId: aim.id,
          ...topic,
          sortOrder: aim.topics.length + 1,
        }),
      }),
    onSuccess: () => {
      setTopic({
        arabicTitle: "",
        englishTitle: "",
        arabicDescription: "",
        englishDescription: "",
      });
      refresh();
    },
  });
  return (
    <article className="rounded-xl border border-border bg-surface-solid/45 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-black">
          {aim.code} — {locale === "ar" ? aim.arabicTitle : aim.englishTitle}
        </p>
        {!disabled && !academicLocked ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => save.mutate()}
              className="focus-ring rounded-lg border border-primary/40 px-2.5 py-1.5 text-xs font-bold text-primary"
            >
              {locale === "ar" ? "حفظ" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => remove.mutate()}
              className="focus-ring inline-flex items-center gap-1 rounded-lg border border-red-400/40 px-2.5 py-1.5 text-xs font-bold text-red-400"
            >
              <Trash2 size={13} aria-hidden="true" />
              {locale === "ar" ? "حذف" : "Delete"}
            </button>
          </div>
        ) : null}
      </div>
      {!disabled && !academicLocked ? (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <input
            value={form.code}
            onChange={(event) =>
              setForm((current) => ({ ...current, code: event.target.value }))
            }
            aria-label="Learning aim code"
            className="rounded-lg border border-border bg-transparent p-2 text-sm"
          />
          <input
            value={form.arabicTitle}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                arabicTitle: event.target.value,
              }))
            }
            aria-label="Arabic learning aim"
            className="rounded-lg border border-border bg-transparent p-2 text-sm"
          />
          <input
            value={form.englishTitle}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                englishTitle: event.target.value,
              }))
            }
            aria-label="English learning aim"
            className="rounded-lg border border-border bg-transparent p-2 text-sm"
          />
          <label className="grid gap-1 text-xs font-bold text-muted">
            {locale === "ar" ? "ترتيب الهدف" : "Aim order"}
            <input
              type="number"
              min="0"
              value={form.sortOrder}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sortOrder: event.target.value,
                }))
              }
              className="rounded-lg border border-border bg-transparent p-2 text-sm"
            />
          </label>
        </div>
      ) : null}
      <div className="mt-3 grid gap-2">
        {aim.topics.map((item) => (
          <TopicEditor
            key={item.id}
            topic={item}
            courseId={courseId}
            disabled={disabled}
          />
        ))}
      </div>
      {!disabled ? (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <input
            value={topic.arabicTitle}
            onChange={(event) =>
              setTopic((current) => ({
                ...current,
                arabicTitle: event.target.value,
              }))
            }
            placeholder={locale === "ar" ? "موضوع بالعربية" : "Arabic topic"}
            className="rounded-lg border border-border bg-transparent p-2 text-sm"
          />
          <input
            value={topic.englishTitle}
            onChange={(event) =>
              setTopic((current) => ({
                ...current,
                englishTitle: event.target.value,
              }))
            }
            placeholder={
              locale === "ar" ? "موضوع بالإنجليزية" : "English topic"
            }
            className="rounded-lg border border-border bg-transparent p-2 text-sm"
          />
          <button
            type="button"
            onClick={() => addTopic.mutate()}
            disabled={
              !topic.arabicTitle.trim() ||
              !topic.englishTitle.trim() ||
              addTopic.isPending
            }
            className="focus-ring inline-flex items-center justify-center gap-1 rounded-lg border border-primary/40 px-2 py-2 text-xs font-bold text-primary"
          >
            <Plus size={14} aria-hidden="true" />
            {locale === "ar" ? "موضوع" : "Topic"}
          </button>
        </div>
      ) : null}
      <RequestError error={save.error} />
      <RequestError error={remove.error} />
      <RequestError error={addTopic.error} />
    </article>
  );
}

function TopicEditor({
  topic,
  courseId,
  disabled,
}: {
  topic: TopicData;
  courseId: string;
  disabled: boolean;
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [form, setForm] = useState({
    arabicTitle: topic.arabicTitle,
    englishTitle: topic.englishTitle,
    arabicDescription: topic.arabicDescription || "",
    englishDescription: topic.englishDescription || "",
    sortOrder: String(topic.sortOrder),
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["teacher-course", courseId] });
  const save = useMutation({
    mutationFn: () =>
      api(`/teacher/courses/topics/${topic.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...form, sortOrder: Number(form.sortOrder) }),
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () =>
      api(`/teacher/courses/topics/${topic.id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-sm">
      <span className="font-bold">
        • {locale === "ar" ? topic.arabicTitle : topic.englishTitle}
      </span>
      {!disabled ? (
        <>
          <input
            value={form.arabicTitle}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                arabicTitle: event.target.value,
              }))
            }
            aria-label="Arabic topic"
            className="min-w-28 flex-1 rounded border border-border bg-transparent p-1.5"
          />
          <input
            value={form.englishTitle}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                englishTitle: event.target.value,
              }))
            }
            aria-label="English topic"
            className="min-w-28 flex-1 rounded border border-border bg-transparent p-1.5"
          />
          <input
            type="number"
            min="0"
            value={form.sortOrder}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                sortOrder: event.target.value,
              }))
            }
            aria-label={locale === "ar" ? "ترتيب الموضوع" : "Topic order"}
            className="w-20 rounded border border-border bg-transparent p-1.5"
          />
          <button
            type="button"
            onClick={() => save.mutate()}
            className="focus-ring text-xs font-bold text-primary"
          >
            {locale === "ar" ? "حفظ" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => remove.mutate()}
            className="focus-ring text-xs font-bold text-red-400"
          >
            {locale === "ar" ? "حذف" : "Delete"}
          </button>
        </>
      ) : null}
      <RequestError error={save.error} />
      <RequestError error={remove.error} />
    </div>
  );
}

function CriterionEditor({
  criterion,
  courseId,
  disabled,
}: {
  criterion: CriterionData;
  courseId: string;
  disabled: boolean;
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [form, setForm] = useState({
    code: criterion.code,
    band: criterion.band,
    arabicDescription: criterion.arabicDescription,
    englishDescription: criterion.englishDescription,
    arabicEvidenceGuidance: criterion.arabicEvidenceGuidance || "",
    englishEvidenceGuidance: criterion.englishEvidenceGuidance || "",
    sortOrder: String(criterion.sortOrder),
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["teacher-course", courseId] });
  const save = useMutation({
    mutationFn: () =>
      api(`/teacher/courses/criteria/${criterion.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          sortOrder: Number(form.sortOrder),
        }),
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () =>
      api(`/teacher/courses/criteria/${criterion.id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  return (
    <article className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-black">
          {criterion.code} · {criterion.band}
        </p>
        {!disabled ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => save.mutate()}
              className="focus-ring text-xs font-bold text-primary"
            >
              {locale === "ar" ? "حفظ" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => remove.mutate()}
              className="focus-ring inline-flex items-center gap-1 text-xs font-bold text-red-400"
            >
              <Trash2 size={13} aria-hidden="true" />
              {locale === "ar" ? "حذف" : "Delete"}
            </button>
          </div>
        ) : null}
      </div>
      {!disabled ? (
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <input
            value={form.code}
            onChange={(event) =>
              setForm((current) => ({ ...current, code: event.target.value }))
            }
            aria-label="Criterion code"
            className="rounded border border-border bg-transparent p-2 text-sm"
          />
          <select
            value={form.band}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                band: event.target.value as CriterionData["band"],
              }))
            }
            className="rounded border border-border bg-transparent p-2 text-sm"
          >
            <option value="Pass">P</option>
            <option value="Merit">M</option>
            <option value="Distinction">D</option>
          </select>
          <input
            type="number"
            min="0"
            value={form.sortOrder}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                sortOrder: event.target.value,
              }))
            }
            aria-label={locale === "ar" ? "ترتيب المعيار" : "Criterion order"}
            className="rounded border border-border bg-transparent p-2 text-sm"
          />
          <input
            value={form.arabicDescription}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                arabicDescription: event.target.value,
              }))
            }
            aria-label="Arabic criterion description"
            className="rounded border border-border bg-transparent p-2 text-sm"
          />
          <input
            value={form.englishDescription}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                englishDescription: event.target.value,
              }))
            }
            aria-label="English criterion description"
            className="rounded border border-border bg-transparent p-2 text-sm"
          />
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted">
          {locale === "ar"
            ? criterion.arabicDescription
            : criterion.englishDescription}
        </p>
      )}
      <RequestError error={save.error} />
      <RequestError error={remove.error} />
    </article>
  );
}

function LessonEditor({
  lesson,
  module,
  courseId,
  disabled,
}: {
  lesson: LessonData;
  module: CourseEditorData["modules"][number];
  courseId: string;
  disabled: boolean;
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [form, setForm] = useState({
    arabicTitle: lesson.arabicTitle,
    englishTitle: lesson.englishTitle,
    arabicBody: lesson.arabicBody || "",
    englishBody: lesson.englishBody || "",
    type: lesson.type,
    durationSeconds: String(lesson.durationSeconds),
    isPreview: lesson.isPreview,
    learningAimId: lesson.btecLearningAimId || "",
    topicId: lesson.btecTopicId || "",
    publicationStatus: lesson.publicationStatus || "Published",
    availableFromUtc: toDateTimeLocalValue(lesson.availableFromUtc),
    sortOrder: String(lesson.sortOrder),
  });
  const [files, setFiles] = useState<File[]>([]);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [videoPlaybackState, setVideoPlaybackState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [videoRetryCount, setVideoRetryCount] = useState(0);
  const [resourceLink, setResourceLink] = useState({
    displayName: "",
    externalUrl: "",
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["teacher-course", courseId] });
  const save = useMutation({
    mutationFn: () =>
      api(`/teacher/courses/lessons/${lesson.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          durationSeconds: Number(form.durationSeconds),
          sortOrder: Number(form.sortOrder),
          availableFromUtc:
            form.publicationStatus === "Scheduled" && form.availableFromUtc
              ? new Date(form.availableFromUtc).toISOString()
              : null,
        }),
      }),
    onSuccess: refresh,
  });
  const upload = useMutation({
    mutationFn: async () => {
      for (const file of files) {
        const body = new FormData();
        body.set("file", file);
        body.set("isDownloadable", "true");
        await api(`/teacher/courses/lessons/${lesson.id}/resources`, {
          method: "POST",
          body,
        });
      }
    },
    onSuccess: () => {
      setFiles([]);
      refresh();
    },
  });
  const uploadVideo = useMutation({
    mutationFn: async () => {
      const file = videoFiles[0];
      if (!file) return;
      const body = new FormData();
      body.set("file", file);
      await api(`/teacher/courses/lessons/${lesson.id}/video`, {
        method: "POST",
        body,
      });
    },
    onSuccess: () => {
      setVideoFiles([]);
      setVideoPlaybackState("loading");
      refresh();
    },
  });
  const removeVideo = useMutation({
    mutationFn: () =>
      api(`/teacher/courses/lessons/${lesson.id}/video`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setVideoPlaybackState("loading");
      refresh();
    },
  });
  const addResourceLink = useMutation({
    mutationFn: () =>
      api(`/teacher/courses/lessons/${lesson.id}/resource-links`, {
        method: "POST",
        body: JSON.stringify(resourceLink),
      }),
    onSuccess: () => {
      setResourceLink({ displayName: "", externalUrl: "" });
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      api(`/teacher/courses/lessons/${lesson.id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const duplicate = useMutation({
    mutationFn: () =>
      api(`/teacher/courses/lessons/${lesson.id}/duplicate`, {
        method: "POST",
      }),
    onSuccess: refresh,
  });
  return (
    <article className="rounded-xl border border-border bg-surface-solid/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-black">
            {locale === "ar" ? lesson.arabicTitle : lesson.englishTitle}
          </h4>
          <p className="mt-1 text-xs text-muted">
            {lesson.type} · {Math.round(lesson.durationSeconds / 60)}{" "}
            {locale === "ar" ? "دقيقة" : "min"}
          </p>
        </div>
        {!disabled ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="focus-ring rounded-lg border border-primary/40 px-3 py-2 text-xs font-bold text-primary"
            >
              {locale === "ar" ? "حفظ الدرس" : "Save lesson"}
            </button>
            <button
              type="button"
              onClick={() => duplicate.mutate()}
              disabled={duplicate.isPending}
              className="focus-ring inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold"
            >
              <Copy size={14} aria-hidden="true" />
              {locale === "ar" ? "تكرار" : "Duplicate"}
            </button>
            <button
              type="button"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              className="focus-ring inline-flex items-center gap-1 rounded-lg border border-red-400/40 px-3 py-2 text-xs font-bold text-red-400"
            >
              <Trash2 size={14} aria-hidden="true" />
              {locale === "ar" ? "حذف" : "Delete"}
            </button>
          </div>
        ) : null}
      </div>
      {!disabled ? (
        <div className="mt-3 grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={form.arabicTitle}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  arabicTitle: event.target.value,
                }))
              }
              className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
            />
            <input
              value={form.englishTitle}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  englishTitle: event.target.value,
                }))
              }
              className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <textarea
              value={form.arabicBody}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  arabicBody: event.target.value,
                }))
              }
              className="min-h-28 rounded-xl border border-border bg-transparent p-2.5 text-sm"
            />
            <textarea
              value={form.englishBody}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  englishBody: event.target.value,
                }))
              }
              className="min-h-28 rounded-xl border border-border bg-transparent p-2.5 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={form.type}
              onChange={(event) =>
                setForm((current) => ({ ...current, type: event.target.value }))
              }
              className="rounded-xl border border-border bg-transparent p-2 text-sm"
            >
              <option value="Text">Text</option>
              <option value="Video">Video</option>
              <option value="Activity">Activity</option>
              <option value="Quiz">Quiz</option>
              <option value="Assignment">Assignment</option>
              <option value="LiveSession">Live session</option>
            </select>
            <select
              value={form.publicationStatus}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  publicationStatus: event.target.value,
                  availableFromUtc:
                    event.target.value === "Scheduled"
                      ? current.availableFromUtc
                      : "",
                }))
              }
              className="rounded-xl border border-border bg-transparent p-2 text-sm"
              aria-label={locale === "ar" ? "حالة الدرس" : "Lesson status"}
            >
              <option value="Draft">
                {locale === "ar" ? "مسودة" : "Draft"}
              </option>
              <option value="Published">
                {locale === "ar" ? "منشور" : "Published"}
              </option>
              <option value="Archived">
                {locale === "ar" ? "مؤرشف" : "Archived"}
              </option>
              <option value="Scheduled">
                {locale === "ar" ? "مجدول" : "Scheduled"}
              </option>
            </select>
            <select
              value={form.learningAimId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  learningAimId: event.target.value,
                  topicId: "",
                }))
              }
              className="rounded-xl border border-border bg-transparent p-2 text-sm"
              aria-label={locale === "ar" ? "هدف التعلم" : "Learning aim"}
            >
              <option value="">
                {locale === "ar" ? "بدون هدف محدد" : "No specific aim"}
              </option>
              {module.learningAims.map((aim) => (
                <option key={aim.id} value={aim.id}>
                  {aim.code} —{" "}
                  {locale === "ar" ? aim.arabicTitle : aim.englishTitle}
                </option>
              ))}
            </select>
            <select
              value={form.topicId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  topicId: event.target.value,
                }))
              }
              disabled={!form.learningAimId}
              className="rounded-xl border border-border bg-transparent p-2 text-sm disabled:opacity-50"
              aria-label={locale === "ar" ? "الموضوع" : "Topic"}
            >
              <option value="">
                {locale === "ar" ? "بدون موضوع محدد" : "No specific topic"}
              </option>
              {(
                module.learningAims.find((aim) => aim.id === form.learningAimId)
                  ?.topics ?? []
              ).map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {locale === "ar" ? topic.arabicTitle : topic.englishTitle}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              value={form.durationSeconds}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  durationSeconds: event.target.value,
                }))
              }
              className="w-32 rounded-xl border border-border bg-transparent p-2 text-sm"
            />
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "ترتيب الدرس" : "Lesson order"}
              <input
                type="number"
                min="0"
                value={form.sortOrder}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sortOrder: event.target.value,
                  }))
                }
                className="w-28 rounded-xl border border-border bg-transparent p-2 text-sm"
              />
            </label>
            {form.publicationStatus === "Scheduled" ? (
              <label className="grid gap-1 text-xs font-bold text-muted">
                {locale === "ar" ? "وقت إتاحة الدرس" : "Lesson release time"}
                <input
                  type="datetime-local"
                  required
                  value={form.availableFromUtc}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      availableFromUtc: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-border bg-transparent p-2 text-sm"
                />
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={form.isPreview}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    isPreview: event.target.checked,
                  }))
                }
                className="size-4 accent-[var(--primary)]"
              />
              {locale === "ar" ? "تجريبي" : "Preview"}
            </label>
          </div>
        </div>
      ) : null}
      <div className="mt-4 border-t border-border pt-4">
        {lesson.video ? (
          <div className="mb-4 overflow-hidden rounded-xl border border-primary/35 bg-black">
            <video
              key={`${lesson.video.id}-${videoRetryCount}`}
              controls
              preload="metadata"
              className="aspect-video w-full"
              aria-label={
                locale === "ar"
                  ? `معاينة فيديو ${lesson.arabicTitle}`
                  : `Preview ${lesson.englishTitle} video`
              }
              src={`/api/v1/teacher/courses/lessons/${lesson.id}/video?retry=${videoRetryCount}`}
              onCanPlay={() => setVideoPlaybackState("ready")}
              onWaiting={() => setVideoPlaybackState("loading")}
              onError={() => setVideoPlaybackState("error")}
            >
              {locale === "ar"
                ? "المتصفح لا يدعم تشغيل الفيديو."
                : "Your browser does not support video playback."}
            </video>
            {videoPlaybackState === "loading" ? (
              <p role="status" className="px-3 py-2 text-sm text-white/80">
                {locale === "ar" ? "جارٍ تحميل الفيديو…" : "Loading video…"}
              </p>
            ) : null}
            {videoPlaybackState === "error" ? (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm text-white"
              >
                <span>
                  {locale === "ar"
                    ? "تعذر تشغيل الفيديو."
                    : "Video unavailable."}
                </span>
                <button
                  type="button"
                  className="focus-ring rounded-lg border border-white/40 px-3 py-1.5"
                  onClick={() => {
                    setVideoPlaybackState("loading");
                    setVideoRetryCount((count) => count + 1);
                  }}
                >
                  {locale === "ar" ? "إعادة المحاولة" : "Retry video"}
                </button>
              </div>
            ) : null}
            <p className="border-t border-white/10 px-3 py-2 text-xs font-bold text-white/80">
              {locale === "ar"
                ? "فيديو الدرس الحالي: "
                : "Current lesson video: "}
              {lesson.video.displayName}
            </p>
            {!disabled ? (
              <div className="px-3 pb-3">
                <button
                  type="button"
                  onClick={() => removeVideo.mutate()}
                  disabled={removeVideo.isPending || uploadVideo.isPending}
                  className="focus-ring rounded-lg border border-red-400/50 px-3 py-2 text-xs font-bold text-red-200 disabled:opacity-50"
                >
                  {removeVideo.isPending
                    ? locale === "ar"
                      ? "جارٍ إزالة الفيديو…"
                      : "Removing video…"
                    : locale === "ar"
                      ? "إزالة الفيديو"
                      : "Remove video"}
                </button>
                <RequestError error={removeVideo.error} />
              </div>
            ) : null}
          </div>
        ) : null}
        {!disabled ? (
          <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <FilePicker
              label={
                locale === "ar"
                  ? "فيديو الدرس المسجّل"
                  : "Recorded lesson video"
              }
              files={videoFiles}
              onFilesChange={setVideoFiles}
              locale={locale}
              accept="video/mp4,video/webm,.mp4,.webm"
              maxFileBytes={500 * 1024 * 1024}
              chooseLabel={
                locale === "ar"
                  ? "اختيار فيديو MP4 أو WEBM"
                  : "Choose MP4 or WEBM video"
              }
              helpText={
                locale === "ar"
                  ? "حتى 500MB. رفع فيديو جديد يستبدل الفيديو الحالي. يُعرض للطلاب المصرّح لهم بعد النشر."
                  : "Up to 500MB. Uploading a new video replaces the current one. Authorized learners can stream it after publication."
              }
            />
            <button
              type="button"
              onClick={() => uploadVideo.mutate()}
              disabled={
                !videoFiles.length ||
                uploadVideo.isPending ||
                removeVideo.isPending
              }
              className="focus-ring mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
            >
              <Upload size={17} aria-hidden="true" />
              {uploadVideo.isPending
                ? locale === "ar"
                  ? "جارٍ رفع الفيديو…"
                  : "Uploading video…"
                : locale === "ar"
                  ? lesson.video
                    ? "استبدال فيديو الدرس"
                    : "رفع وربط فيديو الدرس"
                  : lesson.video
                    ? "Replace lesson video"
                    : "Upload and attach lesson video"}
            </button>
            {uploadVideo.isSuccess ? (
              <p role="status" className="mt-2 text-xs text-primary">
                {locale === "ar" ? "تم حفظ الفيديو." : "Video saved."}
              </p>
            ) : null}
            <RequestError error={uploadVideo.error} />
          </div>
        ) : null}
        <p className="flex items-center gap-2 text-sm font-black">
          <FileText size={16} className="text-primary" aria-hidden="true" />
          {locale === "ar" ? "موارد الدرس" : "Lesson resources"}
        </p>
        {lesson.resources.filter((resource) => resource.id !== lesson.video?.id)
          .length ? (
          <ul className="mt-2 grid gap-2">
            {lesson.resources
              .filter((resource) => resource.id !== lesson.video?.id)
              .map((resource) => (
                <li
                  key={resource.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5 text-sm"
                >
                  <a
                    href={
                      resource.externalUrl ||
                      `/api/v1/teacher/courses/resources/${resource.id}`
                    }
                    target={resource.externalUrl ? "_blank" : undefined}
                    rel={resource.externalUrl ? "noreferrer" : undefined}
                    className="min-w-0 truncate font-bold text-primary underline"
                  >
                    {resource.displayName}
                  </a>
                  <span className="shrink-0 text-xs text-muted">
                    {resource.scanStatus}
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {locale === "ar" ? "لا توجد ملفات مرفوعة." : "No uploaded files."}
          </p>
        )}
        {!disabled ? (
          <div className="mt-3">
            <FilePicker
              label={
                locale === "ar" ? "رفع ملفات الدرس" : "Upload lesson files"
              }
              files={files}
              onFilesChange={setFiles}
              locale={locale}
              multiple
              maxFileBytes={100 * 1024 * 1024}
              chooseLabel={locale === "ar" ? "اختيار ملفات" : "Choose files"}
              helpText={
                locale === "ar"
                  ? "حتى 100MB لكل ملف. الملفات تبقى خاصة ولا تصل للطلاب إلا ضمن الدورة المسجلين بها."
                  : "Up to 100MB per file. Files remain private and are available only to enrolled students."
              }
            />
            <button
              type="button"
              onClick={() => upload.mutate()}
              disabled={!files.length || upload.isPending}
              className="focus-ring mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
            >
              <Upload size={17} aria-hidden="true" />
              {locale === "ar" ? "رفع الموارد" : "Upload resources"}
            </button>
            <RequestError error={upload.error} />
            <div className="mt-4 grid gap-2 rounded-xl border border-border bg-white/5 p-3 md:grid-cols-[1fr_1.5fr_auto] md:items-end">
              <label className="grid gap-1 text-xs font-bold text-muted">
                {locale === "ar" ? "اسم الرابط" : "Link name"}
                <input
                  value={resourceLink.displayName}
                  onChange={(event) =>
                    setResourceLink((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                  className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="grid gap-1 text-xs font-bold text-muted">
                {locale === "ar" ? "رابط HTTPS" : "HTTPS link"}
                <input
                  type="url"
                  value={resourceLink.externalUrl}
                  onChange={(event) =>
                    setResourceLink((current) => ({
                      ...current,
                      externalUrl: event.target.value,
                    }))
                  }
                  className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground"
                  dir="ltr"
                />
              </label>
              <button
                type="button"
                onClick={() => addResourceLink.mutate()}
                disabled={
                  !resourceLink.displayName.trim() ||
                  !resourceLink.externalUrl.trim() ||
                  addResourceLink.isPending
                }
                className="focus-ring rounded-xl border border-primary/45 px-4 py-2.5 text-sm font-black text-primary disabled:opacity-50"
              >
                {locale === "ar" ? "إضافة رابط" : "Add link"}
              </button>
            </div>
            <RequestError error={addResourceLink.error} />
          </div>
        ) : null}
      </div>
      <RequestError error={save.error} />
      <RequestError error={remove.error} />
      <RequestError error={duplicate.error} />
    </article>
  );
}

function CourseQuizzesEditor({
  course,
  disabled,
}: {
  course: CourseEditorData;
  disabled: boolean;
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [form, setForm] = useState({
    lessonId: "",
    arabicTitle: "",
    englishTitle: "",
    passMark: "50",
    attemptLimit: "",
    timeLimitMinutes: "",
    randomizeQuestions: false,
    randomizeAnswers: false,
    showAnswers: false,
    showScore: true,
    availableFromUtc: "",
    availableUntilUtc: "",
    allowLateAttempts: false,
  });
  const quizzes = useQuery({
    queryKey: ["teacher-course-quizzes", course.id],
    queryFn: () =>
      api<TeacherQuizData[]>(`/teacher/courses/${course.id}/quizzes`),
  });
  const refresh = () =>
    client.invalidateQueries({
      queryKey: ["teacher-course-quizzes", course.id],
    });
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/teacher/quizzes", {
        method: "POST",
        body: JSON.stringify({
          courseId: course.id,
          lessonId: form.lessonId || null,
          arabicTitle: form.arabicTitle,
          englishTitle: form.englishTitle,
          passMark: Number(form.passMark),
          attemptLimit: form.attemptLimit ? Number(form.attemptLimit) : null,
          timeLimitMinutes: form.timeLimitMinutes
            ? Number(form.timeLimitMinutes)
            : null,
          randomizeQuestions: form.randomizeQuestions,
          randomizeAnswers: form.randomizeAnswers,
          showAnswers: form.showAnswers,
          showScore: form.showScore,
          availableFromUtc: form.availableFromUtc
            ? new Date(form.availableFromUtc).toISOString()
            : null,
          availableUntilUtc: form.availableUntilUtc
            ? new Date(form.availableUntilUtc).toISOString()
            : null,
          allowLateAttempts: form.allowLateAttempts,
        }),
      }),
    onSuccess: () => {
      setForm({
        lessonId: "",
        arabicTitle: "",
        englishTitle: "",
        passMark: "50",
        attemptLimit: "",
        timeLimitMinutes: "",
        randomizeQuestions: false,
        randomizeAnswers: false,
        showAnswers: false,
        showScore: true,
        availableFromUtc: "",
        availableUntilUtc: "",
        allowLateAttempts: false,
      });
      refresh();
    },
  });
  const quizLessons = course.modules.flatMap((module) =>
    module.lessons.filter((lesson) => lesson.type === "Quiz"),
  );
  const imageResources = course.modules.flatMap((module) =>
    module.lessons.flatMap((lesson) =>
      lesson.resources
        .filter((resource) => resource.contentType.startsWith("image/"))
        .map((resource) => ({
          id: resource.id,
          name: `${locale === "ar" ? lesson.arabicTitle : lesson.englishTitle} · ${resource.displayName}`,
        })),
    ),
  );
  return (
    <section className="card grid gap-5 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-black">
          <CheckCircle2 size={20} className="text-primary" aria-hidden="true" />
          {locale === "ar" ? "اختبارات الدورة" : "Course quizzes"}
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          {locale === "ar"
            ? "أنشئ الاختبار وأضف أسئلته وإجاباته الصحيحة داخل مساحة المعلم فقط، ثم انشره للطلاب."
            : "Create a quiz, add questions and correct answers in the teacher-only workspace, then publish it to students."}
        </p>
      </div>
      {quizzes.data?.length ? (
        <div className="grid gap-4">
          {quizzes.data.map((quiz) => (
            <CourseQuizCard
              key={quiz.id}
              quiz={quiz}
              lessons={quizLessons}
              imageResources={imageResources}
              disabled={disabled}
              onChanged={refresh}
            />
          ))}
        </div>
      ) : !quizzes.isPending ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
          {locale === "ar" ? "لا توجد اختبارات بعد." : "No quizzes yet."}
        </p>
      ) : null}
      {!disabled ? (
        <form
          className="grid gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <h3 className="font-black">
            {locale === "ar" ? "إضافة اختبار" : "Add quiz"}
          </h3>
          <div className="grid gap-3 md:grid-cols-3">
            <select
              value={form.lessonId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  lessonId: event.target.value,
                }))
              }
              className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
            >
              <option value="">
                {locale === "ar"
                  ? "اختبار على مستوى الدورة"
                  : "Course-level quiz"}
              </option>
              {quizLessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {locale === "ar" ? lesson.arabicTitle : lesson.englishTitle}
                </option>
              ))}
            </select>
            <input
              required
              value={form.arabicTitle}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  arabicTitle: event.target.value,
                }))
              }
              placeholder={
                locale === "ar" ? "اسم الاختبار بالعربية" : "Arabic quiz title"
              }
              className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
            />
            <input
              required
              value={form.englishTitle}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  englishTitle: event.target.value,
                }))
              }
              placeholder={
                locale === "ar"
                  ? "اسم الاختبار بالإنجليزية"
                  : "English quiz title"
              }
              className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "علامة النجاح %" : "Pass mark %"}
              <input
                type="number"
                min="0"
                max="100"
                required
                value={form.passMark}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    passMark: event.target.value,
                  }))
                }
                className="w-28 rounded-xl border border-border bg-transparent p-2.5 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar"
                ? "حد المحاولات (اختياري)"
                : "Attempt limit (optional)"}
              <input
                type="number"
                min="1"
                max="100"
                value={form.attemptLimit}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    attemptLimit: event.target.value,
                  }))
                }
                className="w-40 rounded-xl border border-border bg-transparent p-2.5 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar"
                ? "مدة الاختبار بالدقائق (اختياري)"
                : "Time limit in minutes (optional)"}
              <input
                type="number"
                min="1"
                max="300"
                value={form.timeLimitMinutes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    timeLimitMinutes: event.target.value,
                  }))
                }
                className="w-48 rounded-xl border border-border bg-transparent p-2.5 text-sm"
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "يفتح في" : "Opens at"}
              <input
                type="datetime-local"
                value={form.availableFromUtc}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    availableFromUtc: event.target.value,
                  }))
                }
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "يغلق في" : "Closes at"}
              <input
                type="datetime-local"
                value={form.availableUntilUtc}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    availableUntilUtc: event.target.value,
                  }))
                }
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-bold">
            {[
              [
                "randomizeQuestions",
                locale === "ar" ? "ترتيب أسئلة مختلف" : "Randomize questions",
              ],
              [
                "randomizeAnswers",
                locale === "ar" ? "ترتيب خيارات مختلف" : "Randomize answers",
              ],
              [
                "showScore",
                locale === "ar"
                  ? "إظهار النتيجة فورًا"
                  : "Show score immediately",
              ],
              [
                "showAnswers",
                locale === "ar"
                  ? "إظهار الإجابات بعد الإرسال"
                  : "Show answers after submission",
              ],
              [
                "allowLateAttempts",
                locale === "ar"
                  ? "السماح بمحاولة متأخرة"
                  : "Allow late attempts",
              ],
            ].map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form[key as keyof typeof form] as boolean}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [key]: event.target.checked,
                    }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <button
            disabled={create.isPending}
            className="focus-ring inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
          >
            <Plus size={17} aria-hidden="true" />
            {locale === "ar" ? "إنشاء الاختبار" : "Create quiz"}
          </button>
          <RequestError error={create.error} />
        </form>
      ) : null}
      <QuestionBankPanel
        course={course}
        quizzes={quizzes.data ?? []}
        quizLessons={quizLessons}
        disabled={disabled}
        onQuizChanged={refresh}
      />
      <RequestError error={quizzes.error} />
    </section>
  );
}

function QuestionBankPanel({
  course,
  quizzes,
  quizLessons,
  disabled,
  onQuizChanged,
}: {
  course: CourseEditorData;
  quizzes: TeacherQuizData[];
  quizLessons: { id: string; arabicTitle: string; englishTitle: string }[];
  disabled: boolean;
  onQuizChanged: () => void;
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [form, setForm] = useState({
    type: "SingleChoice" as QuestionBankItem["type"],
    arabicText: "",
    englishText: "",
    options: "",
    correctAnswers: "",
    tag: "",
    difficulty: "2",
    imageResourceId: "",
    courseModuleId: "",
    btecLearningAimId: "",
  });
  const [generator, setGenerator] = useState({
    lessonId: "",
    arabicTitle: "",
    englishTitle: "",
    questionCount: "5",
    passMark: "50",
    tag: "",
    difficulty: "",
    courseModuleId: "",
    btecLearningAimId: "",
    type: "",
  });
  const bank = useQuery({
    queryKey: ["teacher-question-bank", course.id],
    queryFn: () =>
      api<QuestionBankItem[]>(`/teacher/question-bank/courses/${course.id}`),
  });
  const refresh = () =>
    client.invalidateQueries({
      queryKey: ["teacher-question-bank", course.id],
    });
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/teacher/question-bank", {
        method: "POST",
        body: JSON.stringify({
          courseId: course.id,
          type: form.type,
          arabicText: form.arabicText,
          englishText: form.englishText,
          options:
            form.type === "TrueFalse"
              ? []
              : form.options.split("\n").map((item) => item.trim()),
          correctAnswers: form.correctAnswers
            .split("\n")
            .map((item) => item.trim()),
          imageResourceId: form.imageResourceId || null,
          tag: form.tag || null,
          difficulty: Number(form.difficulty),
          courseModuleId: form.courseModuleId || null,
          btecLearningAimId: form.btecLearningAimId || null,
        }),
      }),
    onSuccess: () => {
      setForm({
        type: "SingleChoice",
        arabicText: "",
        englishText: "",
        options: "",
        correctAnswers: "",
        tag: "",
        difficulty: "2",
        imageResourceId: "",
        courseModuleId: "",
        btecLearningAimId: "",
      });
      refresh();
    },
  });
  const addToQuiz = useMutation({
    mutationFn: ({
      questionId,
      quizId,
    }: {
      questionId: string;
      quizId: string;
    }) =>
      api<{ id: string }>(
        `/teacher/question-bank/${questionId}/quizzes/${quizId}`,
        { method: "POST" },
      ),
    onSuccess: onQuizChanged,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/teacher/question-bank/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const generate = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/teacher/question-bank/generate-quiz", {
        method: "POST",
        body: JSON.stringify({
          courseId: course.id,
          lessonId: generator.lessonId || null,
          arabicTitle: generator.arabicTitle,
          englishTitle: generator.englishTitle,
          questionCount: Number(generator.questionCount),
          passMark: Number(generator.passMark),
          randomizeQuestions: true,
          randomizeAnswers: true,
          tag: generator.tag || null,
          difficulty: generator.difficulty
            ? Number(generator.difficulty)
            : null,
          courseModuleId: generator.courseModuleId || null,
          btecLearningAimId: generator.btecLearningAimId || null,
          type: generator.type || null,
        }),
      }),
    onSuccess: () => {
      setGenerator({
        lessonId: "",
        arabicTitle: "",
        englishTitle: "",
        questionCount: "5",
        passMark: "50",
        tag: "",
        difficulty: "",
        courseModuleId: "",
        btecLearningAimId: "",
        type: "",
      });
      onQuizChanged();
    },
  });
  const needsOptions = ![
    "ShortAnswer",
    "FillInBlank",
    "TrueFalse",
    "Essay",
    "CodeQuestion",
  ].includes(form.type);
  const draftQuizzes = quizzes.filter(
    (quiz) => quiz.publicationStatus === "Draft",
  );
  const moduleOptions = [...course.modules].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );
  const aimsFor = (moduleId: string) =>
    moduleOptions
      .find((module) => module.id === moduleId)
      ?.learningAims.slice()
      .sort((left, right) => left.sortOrder - right.sortOrder) ?? [];
  const formAims = aimsFor(form.courseModuleId);
  const generatorAims = aimsFor(generator.courseModuleId);
  const imageResources = moduleOptions.flatMap((module) =>
    module.lessons.flatMap((lesson) =>
      lesson.resources
        .filter(
          (resource) =>
            resource.scanStatus === "Clean" &&
            resource.contentType.startsWith("image/"),
        )
        .map((resource) => ({
          id: resource.id,
          name: `${locale === "ar" ? module.arabicTitle : module.englishTitle} — ${resource.displayName}`,
        })),
    ),
  );
  const questionContext = (question: QuestionBankItem) => {
    const courseUnit = moduleOptions.find(
      (item) => item.id === question.courseModuleId,
    );
    const aim = courseUnit?.learningAims.find(
      (item) => item.id === question.btecLearningAimId,
    );
    if (!courseUnit)
      return locale === "ar" ? "على مستوى الدورة" : "Course-level";
    const unitTitle =
      locale === "ar" ? courseUnit.arabicTitle : courseUnit.englishTitle;
    return aim ? `${unitTitle} · ${aim.code}` : unitTitle;
  };
  return (
    <section className="grid gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-4">
      <div>
        <h3 className="font-black">
          {locale === "ar"
            ? "بنك الأسئلة والاختبارات العشوائية"
            : "Question bank & random quizzes"}
        </h3>
        <p className="mt-1 text-sm leading-6 text-muted">
          {locale === "ar"
            ? "احفظ السؤال مرة واحدة، انسخه إلى اختبار مسودة، أو أنشئ اختبارًا عشوائيًا من فلاتر البنك. لا يشارك الطلاب إجابات البنك الصحيحة."
            : "Save a reusable question, copy it into a draft quiz, or generate a random quiz from bank filters. Correct bank answers are never exposed to students."}
        </p>
      </div>
      {!disabled ? (
        <>
          <form
            className="grid gap-3 rounded-xl border border-border bg-surface-solid/55 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value as QuestionBankItem["type"],
                    options: "",
                    correctAnswers: "",
                    imageResourceId: "",
                  }))
                }
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
              >
                {quizQuestionTypes.map((type) => (
                  <option key={type} value={type}>
                    {quizQuestionTypeLabel(type, locale)}
                  </option>
                ))}
              </select>
              <input
                required
                value={form.tag}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    tag: event.target.value,
                  }))
                }
                maxLength={80}
                placeholder={
                  locale === "ar" ? "وسم: الوحدة/الموضوع" : "Tag: unit/topic"
                }
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
              />
              <label className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl border border-border px-2.5 text-xs font-bold text-muted">
                {locale === "ar" ? "الصعوبة" : "Difficulty"}
                <select
                  value={form.difficulty}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      difficulty: event.target.value,
                    }))
                  }
                  className="bg-transparent py-2.5 text-sm"
                >
                  {[1, 2, 3, 4, 5].map((level) => (
                    <option key={level} value={level}>
                      {level}/5
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <select
                value={form.courseModuleId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    courseModuleId: event.target.value,
                    btecLearningAimId: "",
                  }))
                }
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
              >
                <option value="">
                  {locale === "ar" ? "وحدة اختيارية" : "Optional unit"}
                </option>
                {moduleOptions.map((module) => (
                  <option key={module.id} value={module.id}>
                    {locale === "ar" ? module.arabicTitle : module.englishTitle}
                  </option>
                ))}
              </select>
              <select
                value={form.btecLearningAimId}
                disabled={!form.courseModuleId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    btecLearningAimId: event.target.value,
                  }))
                }
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm disabled:opacity-50"
              >
                <option value="">
                  {locale === "ar"
                    ? "هدف تعلم اختياري"
                    : "Optional learning aim"}
                </option>
                {formAims.map((aim) => (
                  <option key={aim.id} value={aim.id}>
                    {aim.code} —{" "}
                    {locale === "ar" ? aim.arabicTitle : aim.englishTitle}
                  </option>
                ))}
              </select>
            </div>
            {form.type === "ImageQuestion" ? (
              <select
                required
                value={form.imageResourceId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    imageResourceId: event.target.value,
                  }))
                }
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
              >
                <option value="">
                  {locale === "ar"
                    ? "اختر صورة مفحوصة من موارد الدورة"
                    : "Choose a scanned course image"}
                </option>
                {imageResources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <textarea
                required
                maxLength={6000}
                value={form.arabicText}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    arabicText: event.target.value,
                  }))
                }
                placeholder={
                  locale === "ar" ? "السؤال بالعربية" : "Arabic question"
                }
                className="min-h-24 rounded-xl border border-border bg-transparent p-3 text-sm"
              />
              <textarea
                required
                maxLength={6000}
                value={form.englishText}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    englishText: event.target.value,
                  }))
                }
                placeholder={
                  locale === "ar" ? "السؤال بالإنجليزية" : "English question"
                }
                className="min-h-24 rounded-xl border border-border bg-transparent p-3 text-sm"
              />
            </div>
            {needsOptions ? (
              <textarea
                required
                value={form.options}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    options: event.target.value,
                  }))
                }
                placeholder={
                  locale === "ar" ? "الخيار في كل سطر" : "One option per line"
                }
                className="min-h-20 rounded-xl border border-border bg-transparent p-3 text-sm"
              />
            ) : null}
            {form.type !== "Essay" && form.type !== "CodeQuestion" ? (
              <textarea
                required
                value={form.correctAnswers}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    correctAnswers: event.target.value,
                  }))
                }
                placeholder={
                  form.type === "Matching"
                    ? locale === "ar"
                      ? "الإجابات: Left => Right في كل سطر"
                      : "Answers: Left => Right per line"
                    : locale === "ar"
                      ? "الإجابة الصحيحة في كل سطر"
                      : "Correct answer per line"
                }
                className="min-h-20 rounded-xl border border-border bg-transparent p-3 text-sm"
              />
            ) : null}
            <button
              disabled={create.isPending}
              className="focus-ring w-fit rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
            >
              {locale === "ar" ? "حفظ في البنك" : "Save to question bank"}
            </button>
            <RequestError error={create.error} />
          </form>
          <form
            className="grid gap-3 rounded-xl border border-border bg-surface-solid/55 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              generate.mutate();
            }}
          >
            <h4 className="font-black">
              {locale === "ar" ? "توليد اختبار عشوائي" : "Generate random quiz"}
            </h4>
            <div className="grid gap-3 md:grid-cols-3">
              <input
                required
                value={generator.arabicTitle}
                onChange={(event) =>
                  setGenerator((current) => ({
                    ...current,
                    arabicTitle: event.target.value,
                  }))
                }
                placeholder={
                  locale === "ar"
                    ? "اسم الاختبار بالعربية"
                    : "Arabic quiz title"
                }
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
              />
              <input
                required
                value={generator.englishTitle}
                onChange={(event) =>
                  setGenerator((current) => ({
                    ...current,
                    englishTitle: event.target.value,
                  }))
                }
                placeholder={
                  locale === "ar"
                    ? "اسم الاختبار بالإنجليزية"
                    : "English quiz title"
                }
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
              />
              <select
                value={generator.lessonId}
                onChange={(event) =>
                  setGenerator((current) => ({
                    ...current,
                    lessonId: event.target.value,
                  }))
                }
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
              >
                <option value="">
                  {locale === "ar" ? "على مستوى الدورة" : "Course-level"}
                </option>
                {quizLessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {locale === "ar" ? lesson.arabicTitle : lesson.englishTitle}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                max="100"
                required
                value={generator.questionCount}
                onChange={(event) =>
                  setGenerator((current) => ({
                    ...current,
                    questionCount: event.target.value,
                  }))
                }
                placeholder={locale === "ar" ? "عدد الأسئلة" : "Question count"}
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
              />
              <input
                value={generator.tag}
                onChange={(event) =>
                  setGenerator((current) => ({
                    ...current,
                    tag: event.target.value,
                  }))
                }
                placeholder={locale === "ar" ? "وسم اختياري" : "Optional tag"}
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
              />
              <select
                value={generator.difficulty}
                onChange={(event) =>
                  setGenerator((current) => ({
                    ...current,
                    difficulty: event.target.value,
                  }))
                }
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
              >
                <option value="">
                  {locale === "ar" ? "كل مستويات الصعوبة" : "Any difficulty"}
                </option>
                {[1, 2, 3, 4, 5].map((level) => (
                  <option key={level} value={level}>
                    {level}/5
                  </option>
                ))}
              </select>
              <select
                value={generator.courseModuleId}
                onChange={(event) =>
                  setGenerator((current) => ({
                    ...current,
                    courseModuleId: event.target.value,
                    btecLearningAimId: "",
                  }))
                }
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
              >
                <option value="">
                  {locale === "ar" ? "كل الوحدات" : "All units"}
                </option>
                {moduleOptions.map((module) => (
                  <option key={module.id} value={module.id}>
                    {locale === "ar" ? module.arabicTitle : module.englishTitle}
                  </option>
                ))}
              </select>
              <select
                value={generator.btecLearningAimId}
                disabled={!generator.courseModuleId}
                onChange={(event) =>
                  setGenerator((current) => ({
                    ...current,
                    btecLearningAimId: event.target.value,
                  }))
                }
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm disabled:opacity-50"
              >
                <option value="">
                  {locale === "ar" ? "كل أهداف التعلم" : "All learning aims"}
                </option>
                {generatorAims.map((aim) => (
                  <option key={aim.id} value={aim.id}>
                    {aim.code} —{" "}
                    {locale === "ar" ? aim.arabicTitle : aim.englishTitle}
                  </option>
                ))}
              </select>
              <select
                value={generator.type}
                onChange={(event) =>
                  setGenerator((current) => ({
                    ...current,
                    type: event.target.value,
                  }))
                }
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
              >
                <option value="">
                  {locale === "ar" ? "كل أنواع الأسئلة" : "All question types"}
                </option>
                {quizQuestionTypes.map((type) => (
                  <option key={type} value={type}>
                    {quizQuestionTypeLabel(type, locale)}
                  </option>
                ))}
              </select>
            </div>
            <button
              disabled={generate.isPending}
              className="focus-ring w-fit rounded-xl border border-primary/50 px-4 py-2.5 text-sm font-black text-primary disabled:opacity-50"
            >
              {locale === "ar" ? "توليد اختبار مسودة" : "Generate draft quiz"}
            </button>
            <RequestError error={generate.error} />
          </form>
        </>
      ) : null}
      {bank.data?.length ? (
        <div className="grid gap-2">
          {bank.data.map((question) => (
            <article
              key={question.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-solid/50 p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-black">
                  {locale === "ar" ? question.arabicText : question.englishText}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {quizQuestionTypeLabel(question.type, locale)} ·{" "}
                  {question.tag || (locale === "ar" ? "بلا وسم" : "No tag")} ·{" "}
                  {question.difficulty}/5 · {questionContext(question)}
                </p>
              </div>
              {!disabled ? (
                <div className="flex flex-wrap gap-2">
                  {draftQuizzes.map((quiz) => (
                    <button
                      key={quiz.id}
                      type="button"
                      disabled={addToQuiz.isPending}
                      onClick={() =>
                        addToQuiz.mutate({
                          questionId: question.id,
                          quizId: quiz.id,
                        })
                      }
                      className="focus-ring rounded-lg border border-primary/40 px-2.5 py-1.5 text-xs font-bold text-primary disabled:opacity-50"
                    >
                      {locale === "ar"
                        ? `إلى: ${quiz.arabicTitle}`
                        : `To: ${quiz.englishTitle}`}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(question.id)}
                    className="focus-ring rounded-lg border border-red-500/45 px-2.5 py-1.5 text-xs font-bold text-red-400 disabled:opacity-50"
                  >
                    {locale === "ar" ? "حذف" : "Delete"}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : bank.isPending ? (
        <p className="text-sm text-muted">…</p>
      ) : null}
      <RequestError error={bank.error} />
    </section>
  );
}

const quizQuestionTypes: QuestionBankItem["type"][] = [
  "SingleChoice",
  "MultipleChoice",
  "TrueFalse",
  "ShortAnswer",
  "FillInBlank",
  "Matching",
  "Ordering",
  "Essay",
  "ImageQuestion",
  "CodeQuestion",
];

function quizQuestionTypeLabel(type: QuestionBankItem["type"], locale: string) {
  const labels: Record<QuestionBankItem["type"], [string, string]> = {
    SingleChoice: ["اختيار واحد", "Single choice"],
    MultipleChoice: ["اختيارات متعددة", "Multiple choice"],
    TrueFalse: ["صح / خطأ", "True / false"],
    ShortAnswer: ["إجابة قصيرة", "Short answer"],
    FillInBlank: ["أكمل الفراغ", "Fill in the blank"],
    Matching: ["مطابقة", "Matching"],
    Ordering: ["ترتيب", "Ordering"],
    Essay: ["مقال", "Essay"],
    ImageQuestion: ["سؤال بصورة", "Image question"],
    CodeQuestion: ["سؤال برمجي", "Code question"],
  };
  return labels[type][locale === "ar" ? 0 : 1];
}

function CourseQuizCard({
  quiz,
  lessons,
  imageResources,
  disabled,
  onChanged,
}: {
  quiz: TeacherQuizData;
  lessons: {
    id: string;
    arabicTitle: string;
    englishTitle: string;
  }[];
  imageResources: { id: string; name: string }[];
  disabled: boolean;
  onChanged: () => void;
}) {
  const locale = useLocale();
  const [isEditing, setIsEditing] = useState(false);
  const [showManualReviews, setShowManualReviews] = useState(false);
  const [settings, setSettings] = useState(() => quizSettingsFromQuiz(quiz));
  const [question, setQuestion] = useState({
    type: "SingleChoice" as TeacherQuizData["questions"][number]["type"],
    arabicText: "",
    englishText: "",
    options: "",
    correctAnswers: "",
    imageResourceId: "",
  });
  const isDraft = quiz.publicationStatus === "Draft";
  const publish = useMutation({
    mutationFn: () =>
      api(`/teacher/quizzes/${quiz.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ publish: !quiz.isPublished }),
      }),
    onSuccess: onChanged,
  });
  const setPublication = useMutation({
    mutationFn: (publicationStatus: TeacherQuizData["publicationStatus"]) =>
      api(`/teacher/quizzes/${quiz.id}/publication`, {
        method: "POST",
        body: JSON.stringify({
          publicationStatus,
          availableFromUtc:
            publicationStatus === "Scheduled" && quiz.availableFromUtc
              ? quiz.availableFromUtc
              : null,
        }),
      }),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => api(`/teacher/quizzes/${quiz.id}`, { method: "DELETE" }),
    onSuccess: onChanged,
  });
  const saveSettings = useMutation({
    mutationFn: () =>
      api(`/teacher/quizzes/${quiz.id}`, {
        method: "PUT",
        body: JSON.stringify({
          lessonId: settings.lessonId || null,
          arabicTitle: settings.arabicTitle,
          englishTitle: settings.englishTitle,
          passMark: Number(settings.passMark),
          attemptLimit: settings.attemptLimit
            ? Number(settings.attemptLimit)
            : null,
          timeLimitMinutes: settings.timeLimitMinutes
            ? Number(settings.timeLimitMinutes)
            : null,
          randomizeQuestions: settings.randomizeQuestions,
          randomizeAnswers: settings.randomizeAnswers,
          showAnswers: settings.showAnswers,
          showScore: settings.showScore,
          availableFromUtc: settings.availableFromUtc
            ? new Date(settings.availableFromUtc).toISOString()
            : null,
          availableUntilUtc: settings.availableUntilUtc
            ? new Date(settings.availableUntilUtc).toISOString()
            : null,
          allowLateAttempts: settings.allowLateAttempts,
        }),
      }),
    onSuccess: () => {
      setIsEditing(false);
      onChanged();
    },
  });
  const addQuestion = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/teacher/quizzes/questions", {
        method: "POST",
        body: JSON.stringify({
          quizId: quiz.id,
          type: question.type,
          arabicText: question.arabicText,
          englishText: question.englishText,
          options:
            question.type === "TrueFalse"
              ? []
              : question.options.split("\n").map((item) => item.trim()),
          correctAnswers: question.correctAnswers
            .split("\n")
            .map((item) => item.trim()),
          sortOrder: quiz.questions.length + 1,
          imageResourceId: question.imageResourceId || null,
        }),
      }),
    onSuccess: () => {
      setQuestion({
        type: "SingleChoice",
        arabicText: "",
        englishText: "",
        options: "",
        correctAnswers: "",
        imageResourceId: "",
      });
      onChanged();
    },
  });
  const removeQuestion = useMutation({
    mutationFn: (id: string) =>
      api(`/teacher/quizzes/questions/${id}`, { method: "DELETE" }),
    onSuccess: onChanged,
  });
  const needsOptions =
    question.type !== "ShortAnswer" &&
    question.type !== "FillInBlank" &&
    question.type !== "TrueFalse" &&
    question.type !== "Essay" &&
    question.type !== "CodeQuestion";
  const isManualQuestion =
    question.type === "Essay" || question.type === "CodeQuestion";
  const supportsMultipleAnswerLines = [
    "MultipleChoice",
    "Ordering",
    "Matching",
  ].includes(question.type);
  return (
    <article className="rounded-2xl border border-border bg-surface-solid/45 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-black">
            {locale === "ar" ? quiz.arabicTitle : quiz.englishTitle}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {locale === "ar" ? "النجاح" : "Pass"}: {quiz.passMark}% ·{" "}
            {quiz.attemptLimit
              ? `${quiz.attemptLimit} ${locale === "ar" ? "محاولات" : "attempts"}`
              : locale === "ar"
                ? "محاولات مفتوحة"
                : "Unlimited attempts"}
          </p>
          <p className="mt-1 text-xs font-bold text-primary">
            {quiz.publicationStatus === "Draft"
              ? locale === "ar"
                ? "مسودة"
                : "Draft"
              : quiz.publicationStatus === "Scheduled"
                ? locale === "ar"
                  ? "مجدول"
                  : "Scheduled"
                : quiz.publicationStatus === "Archived"
                  ? locale === "ar"
                    ? "مؤرشف"
                    : "Archived"
                  : locale === "ar"
                    ? "منشور"
                    : "Published"}
          </p>
        </div>
        {!disabled ? (
          <div className="flex flex-wrap gap-2">
            {isDraft ? (
              <button
                type="button"
                onClick={() => {
                  setSettings(quizSettingsFromQuiz(quiz));
                  setIsEditing((current) => !current);
                }}
                className="focus-ring rounded-lg border border-border px-3 py-2 text-xs font-bold"
              >
                {isEditing
                  ? locale === "ar"
                    ? "إغلاق التحرير"
                    : "Close editor"
                  : locale === "ar"
                    ? "تعديل الإعدادات"
                    : "Edit settings"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => publish.mutate()}
              disabled={publish.isPending}
              className="focus-ring rounded-lg border border-primary/40 px-3 py-2 text-xs font-bold text-primary"
            >
              {quiz.isPublished
                ? locale === "ar"
                  ? "إلغاء النشر"
                  : "Unpublish"
                : locale === "ar"
                  ? "نشر للطلاب"
                  : "Publish to students"}
            </button>
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "حالة النشر" : "Publication state"}
              <select
                value={quiz.publicationStatus}
                disabled={setPublication.isPending}
                onChange={(event) => {
                  const next = event.target
                    .value as TeacherQuizData["publicationStatus"];
                  if (next === "Scheduled" && !quiz.availableFromUtc) {
                    window.alert(
                      locale === "ar"
                        ? "حدّد تاريخ فتح مستقبليًا من الإعدادات أولًا."
                        : "Set a future opening date in quiz settings before scheduling.",
                    );
                    return;
                  }
                  setPublication.mutate(next);
                }}
                className="rounded-lg border border-border bg-page px-2 py-1.5 text-xs"
              >
                <option value="Draft">
                  {locale === "ar" ? "مسودة" : "Draft"}
                </option>
                <option value="Published">
                  {locale === "ar" ? "منشور" : "Published"}
                </option>
                <option value="Scheduled">
                  {locale === "ar" ? "مجدول" : "Scheduled"}
                </option>
                <option value="Archived">
                  {locale === "ar" ? "مؤرشف" : "Archived"}
                </option>
              </select>
            </label>
            {quiz.questions.some(
              (question) =>
                question.type === "Essay" || question.type === "CodeQuestion",
            ) ? (
              <button
                type="button"
                onClick={() => setShowManualReviews((current) => !current)}
                className="focus-ring rounded-lg border border-border px-3 py-2 text-xs font-bold"
              >
                {showManualReviews
                  ? locale === "ar"
                    ? "إغلاق التصحيح اليدوي"
                    : "Close manual marking"
                  : locale === "ar"
                    ? "تصحيح يدوي"
                    : "Manual marking"}
              </button>
            ) : null}
            {isDraft ? (
              <button
                type="button"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
                className="focus-ring inline-flex items-center gap-1 rounded-lg border border-red-400/40 px-3 py-2 text-xs font-bold text-red-400"
              >
                <Trash2 size={14} aria-hidden="true" />
                {locale === "ar" ? "حذف" : "Delete"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {isEditing && isDraft ? (
        <form
          className="mt-4 grid gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            saveSettings.mutate();
          }}
        >
          <p className="font-bold">
            {locale === "ar" ? "إعدادات الاختبار" : "Quiz settings"}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <select
              value={settings.lessonId}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  lessonId: event.target.value,
                }))
              }
              className="rounded-lg border border-border bg-transparent p-2 text-sm"
            >
              <option value="">
                {locale === "ar"
                  ? "اختبار على مستوى الدورة"
                  : "Course-level quiz"}
              </option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {locale === "ar" ? lesson.arabicTitle : lesson.englishTitle}
                </option>
              ))}
            </select>
            <input
              required
              value={settings.arabicTitle}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  arabicTitle: event.target.value,
                }))
              }
              placeholder={
                locale === "ar" ? "اسم الاختبار بالعربية" : "Arabic quiz title"
              }
              className="rounded-lg border border-border bg-transparent p-2 text-sm"
            />
            <input
              required
              value={settings.englishTitle}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  englishTitle: event.target.value,
                }))
              }
              placeholder={
                locale === "ar"
                  ? "اسم الاختبار بالإنجليزية"
                  : "English quiz title"
              }
              className="rounded-lg border border-border bg-transparent p-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              [
                "passMark",
                locale === "ar" ? "علامة النجاح %" : "Pass mark %",
                "0",
                "100",
              ],
              [
                "attemptLimit",
                locale === "ar" ? "حد المحاولات" : "Attempt limit",
                "1",
                "100",
              ],
              [
                "timeLimitMinutes",
                locale === "ar" ? "المدة بالدقائق" : "Minutes",
                "1",
                "300",
              ],
            ].map(([key, label, min, max]) => (
              <label
                key={key}
                className="grid gap-1 text-xs font-bold text-muted"
              >
                {label}
                <input
                  type="number"
                  min={min}
                  max={max}
                  required={key === "passMark"}
                  value={
                    settings[
                      key as "passMark" | "attemptLimit" | "timeLimitMinutes"
                    ]
                  }
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                  className="w-36 rounded-lg border border-border bg-transparent p-2 text-sm"
                />
              </label>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "يفتح في" : "Opens at"}
              <input
                type="datetime-local"
                value={settings.availableFromUtc}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    availableFromUtc: event.target.value,
                  }))
                }
                className="rounded-lg border border-border bg-transparent p-2 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "يغلق في" : "Closes at"}
              <input
                type="datetime-local"
                value={settings.availableUntilUtc}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    availableUntilUtc: event.target.value,
                  }))
                }
                className="rounded-lg border border-border bg-transparent p-2 text-sm"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-bold">
            {[
              [
                "randomizeQuestions",
                locale === "ar" ? "ترتيب أسئلة مختلف" : "Randomize questions",
              ],
              [
                "randomizeAnswers",
                locale === "ar" ? "ترتيب خيارات مختلف" : "Randomize answers",
              ],
              [
                "showScore",
                locale === "ar"
                  ? "إظهار النتيجة فورًا"
                  : "Show score immediately",
              ],
              [
                "showAnswers",
                locale === "ar"
                  ? "إظهار الإجابات بعد الإرسال"
                  : "Show answers after submission",
              ],
              [
                "allowLateAttempts",
                locale === "ar"
                  ? "السماح بمحاولة متأخرة"
                  : "Allow late attempts",
              ],
            ].map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings[key as QuizBooleanSetting]}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      [key]: event.target.checked,
                    }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={saveSettings.isPending}
              className="focus-ring w-fit rounded-lg bg-primary px-3 py-2 text-sm font-black text-slate-950 disabled:opacity-50"
            >
              {locale === "ar" ? "حفظ الإعدادات" : "Save settings"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="focus-ring rounded-lg border border-border px-3 py-2 text-sm font-bold"
            >
              {locale === "ar" ? "إلغاء" : "Cancel"}
            </button>
          </div>
          <RequestError error={saveSettings.error} />
        </form>
      ) : null}
      <ol className="mt-4 grid gap-2 border-t border-border pt-4 text-sm">
        {quiz.questions.map((item) => (
          <li key={item.id} className="rounded-lg border border-border p-3">
            <strong>
              {locale === "ar" ? item.arabicText : item.englishText}
            </strong>
            <p className="mt-1 text-xs text-muted">
              {item.type} ·{" "}
              {item.type === "Essay" || item.type === "CodeQuestion"
                ? locale === "ar"
                  ? "تصحيح يدوي"
                  : "Manual marking"
                : `${locale === "ar" ? "الإجابة الصحيحة: " : "Correct: "}${item.correctAnswers.join(", ")}`}
              {item.type === "ImageQuestion" && item.imageResourceId
                ? ` · ${locale === "ar" ? "صورة خاصة" : "Private image"}`
                : ""}
            </p>
            {!disabled && isDraft ? (
              <button
                type="button"
                onClick={() => removeQuestion.mutate(item.id)}
                className="focus-ring mt-2 text-xs font-bold text-red-400"
              >
                {locale === "ar" ? "حذف السؤال" : "Delete question"}
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      {showManualReviews ? <ManualQuizReviews quizId={quiz.id} /> : null}
      {!disabled && isDraft ? (
        <div className="mt-4 grid gap-3 rounded-xl border border-border bg-black/5 p-3">
          <p className="font-bold">
            {locale === "ar" ? "إضافة سؤال" : "Add question"}
          </p>
          <div className="grid gap-2 md:grid-cols-3">
            <select
              value={question.type}
              onChange={(event) =>
                setQuestion((current) => ({
                  ...current,
                  type: event.target.value as typeof question.type,
                  options: "",
                  correctAnswers: "",
                  imageResourceId: "",
                }))
              }
              className="rounded-lg border border-border bg-transparent p-2 text-sm"
            >
              <option value="SingleChoice">
                {locale === "ar" ? "اختيار واحد" : "Single choice"}
              </option>
              <option value="MultipleChoice">
                {locale === "ar" ? "اختيارات متعددة" : "Multiple choice"}
              </option>
              <option value="TrueFalse">
                {locale === "ar" ? "صح / خطأ" : "True / False"}
              </option>
              <option value="ShortAnswer">
                {locale === "ar" ? "إجابة قصيرة" : "Short answer"}
              </option>
              <option value="FillInBlank">
                {locale === "ar" ? "أكمل الفراغ" : "Fill in the blank"}
              </option>
              <option value="Ordering">
                {locale === "ar" ? "ترتيب العناصر" : "Ordering"}
              </option>
              <option value="Matching">
                {locale === "ar" ? "مطابقة" : "Matching"}
              </option>
              <option value="Essay">
                {locale === "ar"
                  ? "سؤال مقالي (تصحيح يدوي)"
                  : "Essay (manual marking)"}
              </option>
              <option value="ImageQuestion">
                {locale === "ar" ? "سؤال بصورة" : "Image question"}
              </option>
              <option value="CodeQuestion">
                {locale === "ar"
                  ? "سؤال كود (تصحيح يدوي)"
                  : "Code question (manual marking)"}
              </option>
            </select>
            <input
              required
              value={question.arabicText}
              onChange={(event) =>
                setQuestion((current) => ({
                  ...current,
                  arabicText: event.target.value,
                }))
              }
              placeholder={
                locale === "ar" ? "السؤال بالعربية" : "Arabic question"
              }
              className="rounded-lg border border-border bg-transparent p-2 text-sm"
            />
            <input
              required
              value={question.englishText}
              onChange={(event) =>
                setQuestion((current) => ({
                  ...current,
                  englishText: event.target.value,
                }))
              }
              placeholder={
                locale === "ar" ? "السؤال بالإنجليزية" : "English question"
              }
              className="rounded-lg border border-border bg-transparent p-2 text-sm"
            />
          </div>
          {question.type === "ImageQuestion" ? (
            <label className="grid gap-1 text-sm font-bold text-muted">
              {locale === "ar"
                ? "الصورة الخاصة بالسؤال"
                : "Private question image"}
              <select
                required
                value={question.imageResourceId}
                onChange={(event) =>
                  setQuestion((current) => ({
                    ...current,
                    imageResourceId: event.target.value,
                  }))
                }
                className="rounded-lg border border-border bg-transparent p-2 text-sm"
              >
                <option value="">
                  {locale === "ar"
                    ? "اختر صورة مرفوعة ومفحوصة من موارد الدورة"
                    : "Choose a scanned course image"}
                </option>
                {imageResources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
                  </option>
                ))}
              </select>
              {!imageResources.length ? (
                <span className="text-xs font-medium text-amber-500">
                  {locale === "ar"
                    ? "ارفع JPG أو PNG أو WEBP إلى مورد أحد الدروس أولًا."
                    : "Upload a JPG, PNG, or WEBP as a lesson resource first."}
                </span>
              ) : null}
            </label>
          ) : null}
          {needsOptions ? (
            <textarea
              value={question.options}
              onChange={(event) =>
                setQuestion((current) => ({
                  ...current,
                  options: event.target.value,
                }))
              }
              placeholder={
                question.type === "Matching"
                  ? locale === "ar"
                    ? "العبارات أو المفاهيم اليسرى، كل واحدة في سطر"
                    : "Left-side terms, one per line"
                  : question.type === "Ordering"
                    ? locale === "ar"
                      ? "العناصر التي سيعيد الطالب ترتيبها، كل عنصر في سطر"
                      : "Items the learner will arrange, one per line"
                    : locale === "ar"
                      ? "كل خيار في سطر مستقل"
                      : "One option per line"
              }
              className="min-h-20 rounded-lg border border-border bg-transparent p-2 text-sm"
            />
          ) : null}
          {isManualQuestion ? (
            <p className="rounded-lg border border-primary/25 bg-primary/5 p-2 text-sm text-muted">
              {locale === "ar"
                ? "لا يوجد نموذج إجابة هنا. سيظهر الرد للمعلم في قائمة التصحيح اليدوي، وتُحسب النتيجة فقط بعد التصحيح."
                : "No model answer is stored. The response is queued for teacher marking, and a final score is calculated only after grading."}
            </p>
          ) : supportsMultipleAnswerLines ? (
            <textarea
              value={question.correctAnswers}
              onChange={(event) =>
                setQuestion((current) => ({
                  ...current,
                  correctAnswers: event.target.value,
                }))
              }
              placeholder={
                question.type === "Matching"
                  ? locale === "ar"
                    ? "كل تطابق في سطر: المصطلح => المطابقة الصحيحة"
                    : "One match per line: term => correct match"
                  : question.type === "Ordering"
                    ? locale === "ar"
                      ? "الترتيب الصحيح، كل عنصر في سطر"
                      : "Correct order, one item per line"
                    : locale === "ar"
                      ? "كل إجابة صحيحة في سطر"
                      : "Correct answers, one per line"
              }
              className="min-h-20 rounded-lg border border-border bg-transparent p-2 text-sm"
            />
          ) : (
            <input
              value={question.correctAnswers}
              onChange={(event) =>
                setQuestion((current) => ({
                  ...current,
                  correctAnswers: event.target.value,
                }))
              }
              placeholder={
                question.type === "TrueFalse"
                  ? "True أو False"
                  : question.type === "FillInBlank"
                    ? locale === "ar"
                      ? "الإجابة المقبولة للفراغ"
                      : "Accepted blank answer"
                    : locale === "ar"
                      ? "الإجابة الصحيحة"
                      : "Correct answer"
              }
              className="rounded-lg border border-border bg-transparent p-2 text-sm"
            />
          )}
          <button
            type="button"
            onClick={() => addQuestion.mutate()}
            disabled={
              !question.arabicText.trim() ||
              !question.englishText.trim() ||
              (!isManualQuestion && !question.correctAnswers.trim()) ||
              (needsOptions && !question.options.trim()) ||
              (question.type === "ImageQuestion" &&
                !question.imageResourceId) ||
              addQuestion.isPending
            }
            className="focus-ring w-fit rounded-lg border border-primary/40 px-3 py-2 text-sm font-bold text-primary disabled:opacity-50"
          >
            {locale === "ar" ? "إضافة السؤال" : "Add question"}
          </button>
        </div>
      ) : null}
      <RequestError error={publish.error} />
      <RequestError error={remove.error} />
      <RequestError error={addQuestion.error} />
      <RequestError error={removeQuestion.error} />
    </article>
  );
}

function ManualQuizReviews({ quizId }: { quizId: string }) {
  const locale = useLocale();
  const reviews = useQuery({
    queryKey: ["manual-quiz-reviews", quizId, locale],
    queryFn: () =>
      api<ManualQuizReviewData>(
        `/teacher/quizzes/${quizId}/manual-reviews?locale=${locale}`,
      ),
  });
  return (
    <section className="mt-4 grid gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
      <div>
        <h4 className="font-black">
          {locale === "ar" ? "التصحيح اليدوي" : "Manual marking"}
        </h4>
        <p className="mt-1 text-xs text-muted">
          {locale === "ar"
            ? "تظهر هنا إجابات المقال والكود فقط. النتيجة النهائية تُحسب من الخادم عند إرسال جميع العلامات."
            : "Only essay and code responses appear here. The server calculates the final score after every manual grade is submitted."}
        </p>
      </div>
      {reviews.isPending ? (
        <p className="text-sm text-muted" aria-busy>
          {locale === "ar" ? "جارٍ تحميل الإجابات…" : "Loading responses…"}
        </p>
      ) : null}
      {reviews.data?.items.length ? (
        <div className="grid gap-3">
          {reviews.data.items.map((attempt) => (
            <ManualQuizAttemptCard
              key={attempt.id}
              quizId={quizId}
              attempt={attempt}
            />
          ))}
        </div>
      ) : reviews.data ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted">
          {locale === "ar"
            ? "لا توجد إجابات بانتظار التصحيح."
            : "No responses are waiting for marking."}
        </p>
      ) : null}
      <RequestError error={reviews.error} />
    </section>
  );
}

function ManualQuizAttemptCard({
  quizId,
  attempt,
}: {
  quizId: string;
  attempt: ManualQuizReviewData["items"][number];
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [grades, setGrades] = useState<
    Record<string, { scorePercent: string; studentFeedback: string }>
  >(() =>
    Object.fromEntries(
      attempt.questions.map((question) => [
        question.id,
        { scorePercent: "", studentFeedback: "" },
      ]),
    ),
  );
  const grade = useMutation({
    mutationFn: () =>
      api(`/teacher/quiz-attempts/${attempt.id}/manual-grades`, {
        method: "PUT",
        body: JSON.stringify({
          grades: attempt.questions.map((question) => ({
            questionId: question.id,
            scorePercent: Number(grades[question.id]?.scorePercent),
            studentFeedback: grades[question.id]?.studentFeedback || null,
          })),
        }),
      }),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: ["manual-quiz-reviews", quizId],
      }),
  });
  const ready = attempt.questions.every((question) => {
    const value = Number(grades[question.id]?.scorePercent);
    return (
      grades[question.id]?.scorePercent.trim() !== "" &&
      value >= 0 &&
      value <= 100
    );
  });
  return (
    <form
      className="grid gap-3 rounded-xl border border-border bg-surface-solid/55 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        grade.mutate();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <strong>{attempt.studentName}</strong>
        <span className="text-xs text-muted">
          {attempt.submittedAtUtc
            ? new Date(attempt.submittedAtUtc).toLocaleString(
                locale === "ar" ? "ar-JO" : "en-US",
              )
            : ""}
          {attempt.wasLate ? ` · ${locale === "ar" ? "متأخر" : "Late"}` : ""}
        </span>
      </div>
      {attempt.questions.map((question) => (
        <fieldset
          key={question.id}
          className="grid gap-2 rounded-lg border border-border p-3"
        >
          <legend className="px-1 text-sm font-black">{question.text}</legend>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-black/10 p-3 text-xs leading-6 text-foreground">
            {question.answer ||
              (locale === "ar"
                ? "لم يقدّم الطالب إجابة."
                : "No response submitted.")}
          </pre>
          <div className="grid gap-2 md:grid-cols-[9rem_minmax(0,1fr)]">
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "العلامة %" : "Score %"}
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={grades[question.id]?.scorePercent ?? ""}
                onChange={(event) =>
                  setGrades((current) => ({
                    ...current,
                    [question.id]: {
                      ...current[question.id],
                      scorePercent: event.target.value,
                    },
                  }))
                }
                className="rounded-lg border border-border bg-transparent p-2 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar"
                ? "ملاحظات ظاهرة للطالب (اختياري)"
                : "Student-visible feedback (optional)"}
              <textarea
                maxLength={4000}
                value={grades[question.id]?.studentFeedback ?? ""}
                onChange={(event) =>
                  setGrades((current) => ({
                    ...current,
                    [question.id]: {
                      ...current[question.id],
                      studentFeedback: event.target.value,
                    },
                  }))
                }
                className="min-h-20 rounded-lg border border-border bg-transparent p-2 text-sm"
              />
            </label>
          </div>
        </fieldset>
      ))}
      <button
        disabled={!ready || grade.isPending}
        className="focus-ring w-fit rounded-lg bg-primary px-3 py-2 text-sm font-black text-slate-950 disabled:opacity-50"
      >
        {locale === "ar"
          ? "حفظ العلامات وإصدار النتيجة"
          : "Save marks and release result"}
      </button>
      <RequestError error={grade.error} />
    </form>
  );
}

type QuizBooleanSetting =
  | "randomizeQuestions"
  | "randomizeAnswers"
  | "showAnswers"
  | "showScore"
  | "allowLateAttempts";

function quizSettingsFromQuiz(quiz: TeacherQuizData) {
  return {
    lessonId: quiz.lessonId ?? "",
    arabicTitle: quiz.arabicTitle,
    englishTitle: quiz.englishTitle,
    passMark: String(quiz.passMark),
    attemptLimit: quiz.attemptLimit ? String(quiz.attemptLimit) : "",
    timeLimitMinutes: quiz.timeLimitMinutes
      ? String(quiz.timeLimitMinutes)
      : "",
    randomizeQuestions: quiz.randomizeQuestions,
    randomizeAnswers: quiz.randomizeAnswers,
    showAnswers: quiz.showAnswers,
    showScore: quiz.showScore,
    availableFromUtc: toDateTimeLocalValue(quiz.availableFromUtc),
    availableUntilUtc: toDateTimeLocalValue(quiz.availableUntilUtc),
    allowLateAttempts: quiz.allowLateAttempts,
  };
}

function toDateTimeLocalValue(value?: string) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}

function CourseAssignmentsEditor({
  course,
  disabled,
}: {
  course: CourseEditorData;
  disabled: boolean;
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [form, setForm] = useState({
    moduleId: "",
    lessonId: "",
    learningAimId: "",
    arabicTitle: "",
    englishTitle: "",
    arabicInstructions: "",
    englishInstructions: "",
    availableFromUtc: "",
    dueAtUtc: "",
    maxSubmissionAttempts: "2",
    maxScore: "100",
    allowResubmission: true,
    maxFileSizeMb: "100",
    allowedFileExtensions: assignmentFileTypes.map(
      ([extension]) => extension,
    ) as string[],
  });
  const list = useQuery({
    queryKey: ["teacher-course-assignments", course.id],
    queryFn: () =>
      api<CourseAssignmentData[]>(`/teacher/courses/${course.id}/assignments`),
  });
  const submissions = useQuery({
    queryKey: ["teacher-course-assignment-submissions", course.id],
    queryFn: () =>
      api<TeacherAssignmentSubmission[]>(
        `/teacher/assignments/submissions?courseId=${course.id}`,
      ),
  });
  const refresh = () => {
    client.invalidateQueries({
      queryKey: ["teacher-course-assignments", course.id],
    });
    client.invalidateQueries({
      queryKey: ["teacher-course-assignment-submissions", course.id],
    });
  };
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/teacher/assignments", {
        method: "POST",
        body: JSON.stringify({
          courseId: course.id,
          moduleId: form.moduleId || null,
          lessonId: form.lessonId || null,
          learningAimId: form.learningAimId || null,
          arabicTitle: form.arabicTitle,
          englishTitle: form.englishTitle,
          arabicInstructions: form.arabicInstructions,
          englishInstructions: form.englishInstructions,
          availableFromUtc: form.availableFromUtc
            ? new Date(form.availableFromUtc).toISOString()
            : null,
          dueAtUtc: form.dueAtUtc
            ? new Date(form.dueAtUtc).toISOString()
            : null,
          maxSubmissionAttempts: Number(form.maxSubmissionAttempts),
          maxScore: Number(form.maxScore),
          allowResubmission: form.allowResubmission,
          maxFileSizeBytes: Number(form.maxFileSizeMb) * 1024 * 1024,
          allowedFileExtensions: form.allowedFileExtensions,
        }),
      }),
    onSuccess: () => {
      setForm({
        moduleId: "",
        lessonId: "",
        learningAimId: "",
        arabicTitle: "",
        englishTitle: "",
        arabicInstructions: "",
        englishInstructions: "",
        availableFromUtc: "",
        dueAtUtc: "",
        maxSubmissionAttempts: "2",
        maxScore: "100",
        allowResubmission: true,
        maxFileSizeMb: "100",
        allowedFileExtensions: assignmentFileTypes.map(
          ([extension]) => extension,
        ) as string[],
      });
      refresh();
    },
  });
  const selectedModule = course.modules.find(
    (module) => module.id === form.moduleId,
  );
  const assignmentLessons = (selectedModule?.lessons ?? []).filter(
    (lesson) => lesson.type === "Assignment",
  );

  return (
    <section className="card grid gap-5 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-black">
          <FileText size={20} className="text-primary" aria-hidden="true" />
          {locale === "ar"
            ? "مهام الدورة وسجل الدرجات"
            : "Coursework & gradebook"}
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          {locale === "ar"
            ? "أنشئ مهمة مرتبطة بوحدة أو درس، ثم اربط معايير BTEC. يحسب الخادم نتيجة P أو M أو D من المعايير التي حققها الطالب بعد تدقيقك."
            : "Create coursework linked to a unit or lesson, then attach BTEC criteria. The server derives the P, M, or D outcome from the criteria achieved after your review."}
        </p>
      </div>

      {list.isPending ? (
        <p className="text-sm text-muted" aria-busy>
          {locale === "ar" ? "يتم تحميل المهام…" : "Loading assignments…"}
        </p>
      ) : null}
      {list.data?.length ? (
        <div className="grid gap-4">
          {list.data.map((assignment) => (
            <CourseAssignmentCard
              key={assignment.id}
              assignment={assignment}
              course={course}
              disabled={disabled}
              onChanged={refresh}
            />
          ))}
        </div>
      ) : !list.isPending ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
          {locale === "ar"
            ? "لا توجد مهام في هذه الدورة بعد."
            : "No coursework has been created for this course yet."}
        </p>
      ) : null}

      {!disabled ? (
        <form
          className="grid gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <h3 className="font-black">
            {locale === "ar" ? "إضافة مهمة جديدة" : "Add new coursework"}
          </h3>
          <div className="grid gap-3 md:grid-cols-3">
            <select
              value={form.moduleId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  moduleId: event.target.value,
                  lessonId: "",
                  learningAimId: "",
                }))
              }
              className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
            >
              <option value="">
                {locale === "ar"
                  ? "دورة عامة (بدون وحدة)"
                  : "Course-wide (no unit)"}
              </option>
              {course.modules.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.unitCode ? `${module.unitCode} — ` : ""}
                  {locale === "ar" ? module.arabicTitle : module.englishTitle}
                </option>
              ))}
            </select>
            <select
              value={form.lessonId}
              disabled={!form.moduleId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  lessonId: event.target.value,
                }))
              }
              className="rounded-xl border border-border bg-transparent p-2.5 text-sm disabled:opacity-50"
            >
              <option value="">
                {locale === "ar" ? "بدون درس محدد" : "No specific lesson"}
              </option>
              {assignmentLessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {locale === "ar" ? lesson.arabicTitle : lesson.englishTitle}
                </option>
              ))}
            </select>
            <select
              value={form.learningAimId}
              disabled={!form.moduleId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  learningAimId: event.target.value,
                }))
              }
              className="rounded-xl border border-border bg-transparent p-2.5 text-sm disabled:opacity-50"
            >
              <option value="">
                {locale === "ar" ? "بدون هدف محدد" : "No specific learning aim"}
              </option>
              {selectedModule?.learningAims.map((aim) => (
                <option key={aim.id} value={aim.id}>
                  {aim.code} —{" "}
                  {locale === "ar" ? aim.arabicTitle : aim.englishTitle}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              required
              value={form.arabicTitle}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  arabicTitle: event.target.value,
                }))
              }
              placeholder={
                locale === "ar"
                  ? "عنوان المهمة بالعربية"
                  : "Arabic assignment title"
              }
              className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
            />
            <input
              required
              value={form.englishTitle}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  englishTitle: event.target.value,
                }))
              }
              placeholder={
                locale === "ar"
                  ? "عنوان المهمة بالإنجليزية"
                  : "English assignment title"
              }
              className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
            />
            <textarea
              required
              value={form.arabicInstructions}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  arabicInstructions: event.target.value,
                }))
              }
              placeholder={
                locale === "ar"
                  ? "تعليمات المهمة بالعربية"
                  : "Arabic instructions"
              }
              className="min-h-24 rounded-xl border border-border bg-transparent p-2.5 text-sm"
            />
            <textarea
              required
              value={form.englishInstructions}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  englishInstructions: event.target.value,
                }))
              }
              placeholder={
                locale === "ar"
                  ? "تعليمات المهمة بالإنجليزية"
                  : "English instructions"
              }
              className="min-h-24 rounded-xl border border-border bg-transparent p-2.5 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "تاريخ فتح المهمة" : "Available from"}
              <input
                type="datetime-local"
                value={form.availableFromUtc}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    availableFromUtc: event.target.value,
                  }))
                }
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar"
                ? "الموعد النهائي (اختياري)"
                : "Due date (optional)"}
              <input
                type="datetime-local"
                value={form.dueAtUtc}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    dueAtUtc: event.target.value,
                  }))
                }
                className="rounded-xl border border-border bg-transparent p-2.5 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "عدد المحاولات" : "Submission attempts"}
              <input
                type="number"
                min="1"
                max="10"
                required
                value={form.maxSubmissionAttempts}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    maxSubmissionAttempts: event.target.value,
                  }))
                }
                className="w-28 rounded-xl border border-border bg-transparent p-2.5 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "الدرجة الكلية" : "Maximum score"}
              <input
                type="number"
                min="1"
                required
                value={form.maxScore}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    maxScore: event.target.value,
                  }))
                }
                className="w-28 rounded-xl border border-border bg-transparent p-2.5 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "حجم الملف (MB)" : "File size (MB)"}
              <input
                type="number"
                min="1"
                max="100"
                required
                value={form.maxFileSizeMb}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    maxFileSizeMb: event.target.value,
                  }))
                }
                className="w-28 rounded-xl border border-border bg-transparent p-2.5 text-sm"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold text-muted">
            <input
              type="checkbox"
              checked={form.allowResubmission}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  allowResubmission: event.target.checked,
                }))
              }
            />
            {locale === "ar"
              ? "السماح بإعادة التسليم عند طلب المعلم"
              : "Allow resubmission when requested by the teacher"}
          </label>
          <AssignmentFileTypeSelector
            selected={form.allowedFileExtensions}
            onChange={(allowedFileExtensions) =>
              setForm((current) => ({ ...current, allowedFileExtensions }))
            }
            locale={locale}
          />
          <button
            disabled={create.isPending || !form.allowedFileExtensions.length}
            className="focus-ring inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
          >
            <Plus size={17} aria-hidden="true" />
            {locale === "ar" ? "إنشاء المهمة" : "Create coursework"}
          </button>
          <RequestError error={create.error} />
        </form>
      ) : null}

      <div className="border-t border-border pt-5">
        <h3 className="font-black">
          {locale === "ar" ? "تسليمات الطلاب" : "Student submissions"}
        </h3>
        {submissions.data?.length ? (
          <div className="mt-3 grid gap-3">
            {submissions.data.map((submission) => {
              const assignment = list.data?.find(
                (item) => item.id === submission.assignmentId,
              );
              return assignment ? (
                <AssignmentSubmissionCard
                  key={submission.id}
                  submission={submission}
                  assignment={assignment}
                  disabled={disabled}
                  onChanged={refresh}
                />
              ) : null;
            })}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {locale === "ar"
              ? "لا توجد تسليمات بعد."
              : "No student submissions yet."}
          </p>
        )}
      </div>
      <RequestError error={list.error} />
      <RequestError error={submissions.error} />
    </section>
  );
}

type TeacherCourseGradebook = {
  courseId: string;
  courseTitle: string;
  totalStudents: number;
  page: number;
  pageSize: number;
  students: {
    studentUserId: string;
    studentName: string;
    lessonProgressPercent: number;
    assignmentsCompleted: number;
    assignmentsTotal: number;
    predictedGrade: {
      predictedGrade: string;
      passAchieved: number;
      passRequired: number;
      meritAchieved: number;
      meritRequired: number;
      distinctionAchieved: number;
      distinctionRequired: number;
    };
  }[];
};

function TeacherCourseGradebook({ course }: { course: CourseEditorData }) {
  const locale = useLocale();
  const gradebook = useQuery({
    queryKey: ["teacher-course-gradebook", course.id, locale],
    queryFn: () =>
      api<TeacherCourseGradebook>(
        `/gradebook/teacher/courses/${course.id}?locale=${locale}&page=1&pageSize=25`,
      ),
  });
  const gradeLabel = (grade: string) => {
    const labels: Record<string, [string, string]> = {
      NotYetAchieved: ["لم يتحقق بعد", "Not achieved yet"],
      Pass: ["نجاح", "Pass"],
      Merit: ["تفوق", "Merit"],
      Distinction: ["امتياز", "Distinction"],
    };
    return labels[grade]?.[locale === "ar" ? 0 : 1] ?? grade;
  };
  return (
    <section className="card grid gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-secondary">
            BETCCO BTEC
          </p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-black">
            <BookOpenCheck
              size={20}
              className="text-secondary"
              aria-hidden="true"
            />
            {locale === "ar" ? "دفتر درجات الدورة" : "Course gradebook"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {locale === "ar"
              ? "تظهر النتائج المحتسبة من معايير المهام فقط؛ لا يمكن تعديلها من هذا الجدول."
              : "This view reports server-calculated coursework criteria only; it cannot edit a grade."}
          </p>
        </div>
        <span className="rounded-full border border-secondary/35 bg-secondary/10 px-3 py-1.5 text-sm font-black text-secondary">
          {gradebook.data?.totalStudents ?? "—"}{" "}
          {locale === "ar" ? "طلاب" : "students"}
        </span>
      </div>
      {gradebook.isPending ? (
        <p className="text-sm text-muted" aria-busy>
          …
        </p>
      ) : gradebook.isError ? (
        <p
          className="rounded-xl border border-red-500/35 p-3 text-sm text-red-400"
          role="alert"
        >
          {locale === "ar"
            ? "تعذّر تحميل دفتر الدرجات."
            : "Unable to load the gradebook."}
        </p>
      ) : gradebook.data?.students.length ? (
        <div className="overflow-x-auto rounded-xl border border-border/70">
          <table className="min-w-full text-sm">
            <thead className="bg-page/60 text-start text-xs text-muted">
              <tr>
                <th className="px-3 py-3 font-black">
                  {locale === "ar" ? "الطالب" : "Student"}
                </th>
                <th className="px-3 py-3 font-black">
                  {locale === "ar" ? "الدروس" : "Lessons"}
                </th>
                <th className="px-3 py-3 font-black">
                  {locale === "ar" ? "المهام" : "Coursework"}
                </th>
                <th className="px-3 py-3 font-black">
                  {locale === "ar" ? "النتيجة المتوقعة" : "Predicted grade"}
                </th>
              </tr>
            </thead>
            <tbody>
              {gradebook.data.students.map((student) => (
                <tr
                  key={student.studentUserId}
                  className="border-t border-border/70"
                >
                  <td className="px-3 py-3 font-bold">{student.studentName}</td>
                  <td className="px-3 py-3 text-muted">
                    {student.lessonProgressPercent}%
                  </td>
                  <td className="px-3 py-3 text-muted">
                    {student.assignmentsCompleted}/{student.assignmentsTotal}
                  </td>
                  <td className="px-3 py-3 font-black text-secondary">
                    {gradeLabel(student.predictedGrade.predictedGrade)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
          {locale === "ar"
            ? "لا يوجد طلاب مسجلون في هذه الدورة حتى الآن."
            : "No students are enrolled in this course yet."}
        </p>
      )}
    </section>
  );
}

export function CourseworkDeadlineExtensionPanel({
  assignment,
  disabled,
}: {
  assignment: CourseAssignmentData;
  disabled: boolean;
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [studentUserId, setStudentUserId] = useState("");
  const [extendedDueAt, setExtendedDueAt] = useState("");
  const [reason, setReason] = useState("");
  const historyKey = ["coursework-deadline-extensions", assignment.id];
  const history = useQuery({
    queryKey: historyKey,
    queryFn: () =>
      api<CourseworkDeadlineExtension[]>(
        `/teacher/assignments/${assignment.id}/deadline-extensions`,
      ),
    enabled: open,
  });
  const students = useQuery({
    queryKey: ["coursework-extension-eligible-students", assignment.id],
    queryFn: () =>
      api<{ studentUserId: string; displayName: string }[]>(
        `/teacher/assignments/${assignment.id}/deadline-extensions/eligible-students`,
      ),
    enabled: open,
  });
  const active = (history.data ?? []).filter((item) => !item.revokedAtUtc);
  const selectedHasExtension = active.some(
    (item) => item.studentUserId === studentUserId,
  );
  const date = extendedDueAt ? new Date(extendedDueAt) : null;
  const canGrant = Boolean(
    assignment.dueAtUtc &&
    studentUserId &&
    !selectedHasExtension &&
    date &&
    !Number.isNaN(date.getTime()) &&
    date > new Date(assignment.dueAtUtc) &&
    reason.trim().length > 0 &&
    reason.trim().length <= 500,
  );
  const grant = useMutation({
    mutationFn: () =>
      api(`/teacher/assignments/${assignment.id}/deadline-extensions`, {
        method: "POST",
        body: JSON.stringify({
          studentUserId,
          extendedDueAtUtc: date!.toISOString(),
          reason: reason.trim(),
        }),
      }),
    onSuccess: () => {
      setStudentUserId("");
      setExtendedDueAt("");
      setReason("");
      client.invalidateQueries({ queryKey: historyKey });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(
        `/teacher/assignments/${assignment.id}/deadline-extensions/${id}/revoke`,
        { method: "POST", body: JSON.stringify({ reason: null }) },
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: historyKey }),
  });
  return (
    <section className="mt-4 rounded-xl border border-border p-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="focus-ring text-sm font-bold text-primary"
      >
        {locale === "ar"
          ? "تمديدات مواعيد الطلاب"
          : "Student deadline extensions"}
      </button>
      {open ? (
        <div className="mt-3 grid gap-3">
          <p className="text-sm text-muted">
            {locale === "ar" ? "الموعد الأساسي: " : "Base deadline: "}
            {assignment.dueAtUtc
              ? new Date(assignment.dueAtUtc).toLocaleString(
                  locale === "ar" ? "ar-JO" : "en-US",
                )
              : locale === "ar"
                ? "لا يوجد"
                : "None"}
          </p>
          {history.isPending || students.isPending ? (
            <p aria-busy className="text-sm text-muted">
              {locale === "ar" ? "جارٍ التحميل…" : "Loading…"}
            </p>
          ) : null}
          {history.isError || students.isError ? (
            <p role="alert" className="text-sm text-red-400">
              {locale === "ar"
                ? "تعذر تحميل بيانات التمديد. تحقق من صلاحية الوصول وحاول مجددًا."
                : "Could not load extension data. Check access and try again."}
            </p>
          ) : null}
          {!history.isPending && !history.data?.length ? (
            <p className="text-sm text-muted">
              {locale === "ar"
                ? "لا توجد تمديدات مسجلة."
                : "No extensions recorded."}
            </p>
          ) : null}
          {history.data?.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2 text-xs"
            >
              <div>
                <p className="font-bold">
                  {students.data?.find(
                    (student) => student.studentUserId === item.studentUserId,
                  )?.displayName ?? item.studentUserId}
                </p>
                <p>
                  {new Date(item.extendedDueAtUtc).toLocaleString(
                    locale === "ar" ? "ar-JO" : "en-US",
                  )}
                </p>
                <p className="text-muted">
                  {item.revokedAtUtc
                    ? locale === "ar"
                      ? "ملغى"
                      : "Revoked"
                    : locale === "ar"
                      ? "نشط"
                      : "Active"}
                </p>
                <p className="text-muted">
                  {locale === "ar" ? "مُنح: " : "Granted: "}
                  {new Date(item.grantedAtUtc).toLocaleString(
                    locale === "ar" ? "ar-JO" : "en-US",
                  )}
                  {item.revokedAtUtc
                    ? `${locale === "ar" ? " · أُلغي: " : " · Revoked: "}${new Date(item.revokedAtUtc).toLocaleString(locale === "ar" ? "ar-JO" : "en-US")}`
                    : ""}
                </p>
                <p className="text-muted">
                  {locale === "ar" ? "مبرر الموظف: " : "Staff rationale: "}
                  {item.reason}
                </p>
              </div>
              {!item.revokedAtUtc && !disabled ? (
                <button
                  type="button"
                  disabled={revoke.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        locale === "ar"
                          ? "هل تريد إلغاء هذا التمديد؟"
                          : "Revoke this extension?",
                      )
                    )
                      revoke.mutate(item.id);
                  }}
                  className="focus-ring rounded-lg border border-red-400/40 px-3 py-2 font-bold text-red-400 disabled:opacity-50"
                >
                  {locale === "ar" ? "إلغاء التمديد" : "Revoke"}
                </button>
              ) : null}
            </div>
          ))}
          {assignment.dueAtUtc && !disabled ? (
            <form
              className="grid gap-2 rounded-lg border border-border p-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (canGrant && !grant.isPending) grant.mutate();
              }}
            >
              <label className="grid gap-1 text-sm font-bold">
                {locale === "ar" ? "الطالب المسجل" : "Enrolled student"}
                <select
                  className="focus-ring rounded-lg border border-border bg-page p-2"
                  value={studentUserId}
                  onChange={(event) => setStudentUserId(event.target.value)}
                  required
                >
                  <option value="">
                    {locale === "ar" ? "اختر طالبًا" : "Choose a student"}
                  </option>
                  {students.data?.map((student) => (
                    <option
                      key={student.studentUserId}
                      value={student.studentUserId}
                      disabled={active.some(
                        (item) => item.studentUserId === student.studentUserId,
                      )}
                    >
                      {student.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-bold">
                {locale === "ar" ? "الموعد الممدد" : "Extended deadline"}
                <input
                  className="focus-ring rounded-lg border border-border bg-page p-2"
                  type="datetime-local"
                  value={extendedDueAt}
                  onChange={(event) => setExtendedDueAt(event.target.value)}
                  required
                />
              </label>
              <label className="grid gap-1 text-sm font-bold">
                {locale === "ar" ? "المبرر الإداري" : "Staff rationale"}
                <textarea
                  className="focus-ring min-h-20 rounded-lg border border-border bg-page p-2"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                  required
                />
              </label>
              <p className="text-xs text-muted">
                {locale === "ar"
                  ? "اكتب سببًا إداريًا مختصرًا. لا تكتب تشخيصًا طبيًا أو معلومات شخصية حساسة غير ضرورية."
                  : "Enter a brief operational reason. Do not enter medical diagnoses or unnecessary sensitive personal information."}
              </p>
              <button
                type="submit"
                disabled={!canGrant || grant.isPending}
                className="focus-ring w-fit rounded-lg bg-primary px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
              >
                {grant.isPending
                  ? locale === "ar"
                    ? "جارٍ الحفظ…"
                    : "Saving…"
                  : locale === "ar"
                    ? "منح التمديد"
                    : "Grant extension"}
              </button>
            </form>
          ) : null}
          {grant.isSuccess || revoke.isSuccess ? (
            <p role="status" className="text-sm text-primary">
              {locale === "ar" ? "تم تحديث التمديد." : "Extension updated."}
            </p>
          ) : null}
          {grant.isError || revoke.isError ? (
            <p role="alert" className="text-sm text-red-400">
              {locale === "ar"
                ? "تعذر تحديث التمديد. تحقق من البيانات والصلاحيات."
                : "Could not update the extension. Check the details and access."}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CourseAssignmentCard({
  assignment,
  course,
  disabled,
  onChanged,
}: {
  assignment: CourseAssignmentData;
  course: CourseEditorData;
  disabled: boolean;
  onChanged: () => void;
}) {
  const locale = useLocale();
  const isDraft = assignment.publicationStatus === "Draft";
  const [criterionId, setCriterionId] = useState("");
  const [custom, setCustom] = useState({
    code: "",
    band: "Pass" as "Pass" | "Merit" | "Distinction",
    arabicDescription: "",
    englishDescription: "",
  });
  const [editing, setEditing] = useState(false);
  const [resourceFiles, setResourceFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState(() => ({
    arabicTitle: assignment.arabicTitle,
    englishTitle: assignment.englishTitle,
    arabicInstructions: assignment.arabicInstructions,
    englishInstructions: assignment.englishInstructions,
    availableFromUtc: assignment.availableFromUtc
      ? new Date(assignment.availableFromUtc).toISOString().slice(0, 16)
      : "",
    dueAtUtc: assignment.dueAtUtc
      ? new Date(assignment.dueAtUtc).toISOString().slice(0, 16)
      : "",
    maxSubmissionAttempts: String(assignment.maxSubmissionAttempts),
    maxScore: String(assignment.maxScore ?? 100),
    allowResubmission: assignment.allowResubmission,
    maxFileSizeMb: String(
      Math.round(assignment.maxFileSizeBytes / 1024 / 1024),
    ),
    allowedFileExtensions: assignment.allowedFileExtensions,
  }));
  const createCriterion = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api("/teacher/assignments/criteria", {
        method: "POST",
        body: JSON.stringify({
          assignmentId: assignment.id,
          sortOrder: assignment.criteria.length + 1,
          ...payload,
        }),
      }),
    onSuccess: () => {
      setCriterionId("");
      setCustom({
        code: "",
        band: "Pass",
        arabicDescription: "",
        englishDescription: "",
      });
      onChanged();
    },
  });
  const publish = useMutation({
    mutationFn: () =>
      api(`/teacher/assignments/${assignment.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ publish: !assignment.isPublished }),
      }),
    onSuccess: onChanged,
  });
  const setPublication = useMutation({
    mutationFn: (
      publicationStatus: CourseAssignmentData["publicationStatus"],
    ) =>
      api(`/teacher/assignments/${assignment.id}/publication`, {
        method: "POST",
        body: JSON.stringify({
          publicationStatus,
          availableFromUtc:
            publicationStatus === "Scheduled" && assignment.availableFromUtc
              ? assignment.availableFromUtc
              : null,
        }),
      }),
    onSuccess: onChanged,
  });
  const uploadResources = useMutation({
    mutationFn: async () => {
      for (const file of resourceFiles) {
        const body = new FormData();
        body.set("file", file);
        await api(`/teacher/assignments/${assignment.id}/resources`, {
          method: "POST",
          body,
        });
      }
    },
    onSuccess: () => {
      setResourceFiles([]);
      onChanged();
    },
  });
  const removeResource = useMutation({
    mutationFn: (resourceId: string) =>
      api(`/teacher/assignments/resources/${resourceId}`, { method: "DELETE" }),
    onSuccess: onChanged,
  });
  const update = useMutation({
    mutationFn: () =>
      api(`/teacher/assignments/${assignment.id}`, {
        method: "PUT",
        body: JSON.stringify({
          moduleId: assignment.courseModuleId ?? null,
          lessonId: assignment.lessonId ?? null,
          learningAimId: assignment.btecLearningAimId ?? null,
          arabicTitle: draft.arabicTitle,
          englishTitle: draft.englishTitle,
          arabicInstructions: draft.arabicInstructions,
          englishInstructions: draft.englishInstructions,
          availableFromUtc: draft.availableFromUtc
            ? new Date(draft.availableFromUtc).toISOString()
            : null,
          dueAtUtc: draft.dueAtUtc
            ? new Date(draft.dueAtUtc).toISOString()
            : null,
          maxSubmissionAttempts: Number(draft.maxSubmissionAttempts),
          maxScore: Number(draft.maxScore),
          allowResubmission: draft.allowResubmission,
          maxFileSizeBytes: Number(draft.maxFileSizeMb) * 1024 * 1024,
          allowedFileExtensions: draft.allowedFileExtensions,
        }),
      }),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      api(`/teacher/assignments/${assignment.id}`, { method: "DELETE" }),
    onSuccess: onChanged,
  });
  const removeCriterion = useMutation({
    mutationFn: (id: string) =>
      api(`/teacher/assignments/criteria/${id}`, { method: "DELETE" }),
    onSuccess: onChanged,
  });
  const availableCriteria = course.modules.flatMap((module) =>
    module.criteria.filter(
      (criterion) =>
        !assignment.criteria.some((item) => item.code === criterion.code),
    ),
  );
  return (
    <article className="rounded-2xl border border-border bg-surface-solid/45 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-black">
              {locale === "ar"
                ? assignment.arabicTitle
                : assignment.englishTitle}
            </h3>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${assignment.isPublished ? "bg-primary/15 text-primary" : "bg-black/10 text-muted"}`}
            >
              {assignment.isPublished
                ? locale === "ar"
                  ? "منشورة"
                  : "Published"
                : locale === "ar"
                  ? "مسودة"
                  : "Draft"}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
            {!editing &&
              (locale === "ar"
                ? assignment.arabicInstructions
                : assignment.englishInstructions)}
          </p>
          <p className="mt-2 text-xs text-muted">
            {assignment.dueAtUtc
              ? `${locale === "ar" ? "الموعد" : "Due"}: ${new Date(assignment.dueAtUtc).toLocaleString(locale === "ar" ? "ar-JO" : "en-US")}`
              : locale === "ar"
                ? "بدون موعد نهائي"
                : "No due date"}
            {" · "}
            {assignment.maxSubmissionAttempts}{" "}
            {locale === "ar" ? "محاولات" : "attempts"}
          </p>
        </div>
        {!disabled ? (
          <div className="flex flex-wrap gap-2">
            {isDraft ? (
              <button
                type="button"
                onClick={() => setEditing((value) => !value)}
                className="focus-ring rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted hover:border-primary/50 hover:text-primary"
              >
                {editing
                  ? locale === "ar"
                    ? "إغلاق التعديل"
                    : "Close editor"
                  : locale === "ar"
                    ? "تعديل المهمة"
                    : "Edit coursework"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => publish.mutate()}
              disabled={publish.isPending}
              className="focus-ring rounded-lg border border-primary/40 px-3 py-2 text-xs font-bold text-primary"
            >
              {assignment.isPublished
                ? locale === "ar"
                  ? "إلغاء النشر"
                  : "Unpublish"
                : locale === "ar"
                  ? "نشر للطلاب"
                  : "Publish to students"}
            </button>
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "حالة النشر" : "Publication state"}
              <select
                value={assignment.publicationStatus}
                disabled={setPublication.isPending}
                onChange={(event) => {
                  const next = event.target
                    .value as CourseAssignmentData["publicationStatus"];
                  if (next === "Scheduled" && !assignment.availableFromUtc) {
                    window.alert(
                      locale === "ar"
                        ? "حدّد تاريخ فتح مستقبليًا من تعديل المهمة أولًا."
                        : "Set a future opening date in the assignment editor before scheduling.",
                    );
                    return;
                  }
                  setPublication.mutate(next);
                }}
                className="rounded-lg border border-border bg-page px-2 py-1.5 text-xs"
              >
                <option value="Draft">
                  {locale === "ar" ? "مسودة" : "Draft"}
                </option>
                <option value="Published">
                  {locale === "ar" ? "منشورة" : "Published"}
                </option>
                <option value="Scheduled">
                  {locale === "ar" ? "مجدولة" : "Scheduled"}
                </option>
                <option value="Archived">
                  {locale === "ar" ? "مؤرشفة" : "Archived"}
                </option>
              </select>
            </label>
            {isDraft ? (
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      locale === "ar"
                        ? "هل تريد حذف هذه المهمة المسودة؟ لا يمكن التراجع عن الحذف."
                        : "Delete this draft coursework? This cannot be undone.",
                    )
                  )
                    remove.mutate();
                }}
                disabled={remove.isPending}
                className="focus-ring inline-flex items-center gap-1 rounded-lg border border-red-400/40 px-3 py-2 text-xs font-bold text-red-400"
              >
                <Trash2 size={14} aria-hidden="true" />
                {locale === "ar" ? "حذف" : "Delete"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <CourseworkDeadlineExtensionPanel
        assignment={assignment}
        disabled={disabled}
      />
      <div className="mt-4 grid gap-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold">
            {locale === "ar" ? "موارد المهمة" : "Assignment resources"}
          </p>
          <span className="text-xs text-muted">
            {assignment.resources.length} {locale === "ar" ? "ملف" : "files"}
          </span>
        </div>
        {assignment.resources.length ? (
          <div className="flex flex-wrap gap-2">
            {assignment.resources.map((resource) => (
              <span
                key={resource.id}
                className="inline-flex items-center gap-2 rounded-lg border border-primary/35 px-2.5 py-2 text-xs font-bold text-primary"
              >
                <a
                  href={`/api/v1/assignments/${assignment.id}/resources/${resource.id}`}
                >
                  <FileText
                    size={14}
                    className="me-1 inline"
                    aria-hidden="true"
                  />
                  {resource.displayName}
                </a>
                {!disabled ? (
                  <button
                    type="button"
                    aria-label={
                      locale === "ar" ? "حذف المورد" : "Delete resource"
                    }
                    onClick={() => removeResource.mutate(resource.id)}
                    className="text-red-400"
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
        {!disabled ? (
          <div className="grid gap-2 rounded-xl border border-border bg-page/35 p-3">
            <FilePicker
              label={
                locale === "ar"
                  ? "إرفاق موارد للطالب"
                  : "Attach learner resources"
              }
              files={resourceFiles}
              onFilesChange={setResourceFiles}
              locale={locale}
              multiple
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.jpg,.jpeg,.png,.webp"
              maxFileBytes={100 * 1024 * 1024}
              chooseLabel={
                locale === "ar"
                  ? "اختيار ملفات الموارد"
                  : "Choose resource files"
              }
            />
            <button
              type="button"
              onClick={() => uploadResources.mutate()}
              disabled={!resourceFiles.length || uploadResources.isPending}
              className="focus-ring w-fit rounded-lg border border-primary/40 px-3 py-2 text-xs font-bold text-primary disabled:opacity-50"
            >
              {locale === "ar"
                ? "رفع موارد المهمة"
                : "Upload assignment resources"}
            </button>
            <RequestError error={uploadResources.error} />
            <RequestError error={removeResource.error} />
          </div>
        ) : null}
      </div>
      {editing ? (
        <form
          className="mt-4 grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate();
          }}
        >
          <h4 className="font-black">
            {locale === "ar"
              ? "تعديل تفاصيل المهمة"
              : "Edit coursework details"}
          </h4>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              required
              value={draft.arabicTitle}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  arabicTitle: event.target.value,
                }))
              }
              placeholder={
                locale === "ar" ? "العنوان بالعربية" : "Arabic title"
              }
              className="rounded-lg border border-border bg-transparent p-2.5 text-sm"
            />
            <input
              required
              value={draft.englishTitle}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  englishTitle: event.target.value,
                }))
              }
              placeholder={
                locale === "ar" ? "العنوان بالإنجليزية" : "English title"
              }
              className="rounded-lg border border-border bg-transparent p-2.5 text-sm"
            />
            <textarea
              required
              value={draft.arabicInstructions}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  arabicInstructions: event.target.value,
                }))
              }
              className="min-h-24 rounded-lg border border-border bg-transparent p-2.5 text-sm"
            />
            <textarea
              required
              value={draft.englishInstructions}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  englishInstructions: event.target.value,
                }))
              }
              className="min-h-24 rounded-lg border border-border bg-transparent p-2.5 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "تاريخ الفتح" : "Available from"}
              <input
                type="datetime-local"
                value={draft.availableFromUtc}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    availableFromUtc: event.target.value,
                  }))
                }
                className="rounded-lg border border-border bg-transparent p-2.5 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "الموعد النهائي" : "Due date"}
              <input
                type="datetime-local"
                value={draft.dueAtUtc}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    dueAtUtc: event.target.value,
                  }))
                }
                className="rounded-lg border border-border bg-transparent p-2.5 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "عدد المحاولات" : "Submission attempts"}
              <input
                type="number"
                min="1"
                max="10"
                required
                value={draft.maxSubmissionAttempts}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    maxSubmissionAttempts: event.target.value,
                  }))
                }
                className="w-28 rounded-lg border border-border bg-transparent p-2.5 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "الدرجة الكلية" : "Maximum score"}
              <input
                type="number"
                min="1"
                required
                value={draft.maxScore}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    maxScore: event.target.value,
                  }))
                }
                className="w-28 rounded-lg border border-border bg-transparent p-2.5 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              {locale === "ar" ? "حجم الملف (MB)" : "File size (MB)"}
              <input
                type="number"
                min="1"
                max="100"
                required
                value={draft.maxFileSizeMb}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    maxFileSizeMb: event.target.value,
                  }))
                }
                className="w-28 rounded-lg border border-border bg-transparent p-2.5 text-sm"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold text-muted">
            <input
              type="checkbox"
              checked={draft.allowResubmission}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  allowResubmission: event.target.checked,
                }))
              }
            />
            {locale === "ar"
              ? "السماح بإعادة التسليم عند الطلب"
              : "Allow resubmission when requested"}
          </label>
          <AssignmentFileTypeSelector
            selected={draft.allowedFileExtensions}
            onChange={(allowedFileExtensions) =>
              setDraft((current) => ({ ...current, allowedFileExtensions }))
            }
            locale={locale}
          />
          <div className="flex flex-wrap gap-2">
            <button
              disabled={update.isPending || !draft.allowedFileExtensions.length}
              className="focus-ring rounded-lg bg-primary px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-50"
            >
              {locale === "ar" ? "حفظ التعديل" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft({
                  arabicTitle: assignment.arabicTitle,
                  englishTitle: assignment.englishTitle,
                  arabicInstructions: assignment.arabicInstructions,
                  englishInstructions: assignment.englishInstructions,
                  availableFromUtc: assignment.availableFromUtc
                    ? new Date(assignment.availableFromUtc)
                        .toISOString()
                        .slice(0, 16)
                    : "",
                  dueAtUtc: assignment.dueAtUtc
                    ? new Date(assignment.dueAtUtc).toISOString().slice(0, 16)
                    : "",
                  maxSubmissionAttempts: String(
                    assignment.maxSubmissionAttempts,
                  ),
                  maxScore: String(assignment.maxScore ?? 100),
                  allowResubmission: assignment.allowResubmission,
                  maxFileSizeMb: String(
                    Math.round(assignment.maxFileSizeBytes / 1024 / 1024),
                  ),
                  allowedFileExtensions: assignment.allowedFileExtensions,
                });
                setEditing(false);
              }}
              className="focus-ring rounded-lg border border-border px-4 py-2 text-sm font-bold text-muted"
            >
              {locale === "ar" ? "إلغاء" : "Cancel"}
            </button>
          </div>
          <RequestError error={update.error} />
        </form>
      ) : null}
      <div className="mt-4 border-t border-border pt-4">
        <p className="font-bold">
          {locale === "ar" ? "معايير التقييم" : "Assessment criteria"}
        </p>
        {assignment.criteria.length ? (
          <ul className="mt-2 grid gap-2">
            {assignment.criteria.map((criterion) => (
              <li
                key={criterion.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm"
              >
                <span>
                  <strong className="text-primary">{criterion.code}</strong> ·{" "}
                  {locale === "ar"
                    ? criterion.arabicDescription
                    : criterion.englishDescription}
                </span>
                {!disabled && isDraft ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          locale === "ar"
                            ? "هل تريد حذف هذا المعيار من المهمة؟"
                            : "Remove this criterion from the coursework?",
                        )
                      )
                        removeCriterion.mutate(criterion.id);
                    }}
                    className="focus-ring text-xs font-bold text-red-400"
                  >
                    {locale === "ar" ? "حذف" : "Delete"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {locale === "ar"
              ? "أضف معيارًا واحدًا على الأقل قبل النشر."
              : "Add at least one criterion before publishing."}
          </p>
        )}
        {!disabled && isDraft ? (
          <div className="mt-3 grid gap-3 rounded-xl border border-border bg-black/5 p-3">
            {availableCriteria.length ? (
              <div className="flex flex-wrap gap-2">
                <select
                  value={criterionId}
                  onChange={(event) => setCriterionId(event.target.value)}
                  className="min-w-56 flex-1 rounded-lg border border-border bg-transparent p-2 text-sm"
                >
                  <option value="">
                    {locale === "ar"
                      ? "اختر معيار BTEC من الدورة"
                      : "Choose a BTEC criterion from the course"}
                  </option>
                  {availableCriteria.map((criterion) => (
                    <option key={criterion.id} value={criterion.id}>
                      {criterion.code} —{" "}
                      {locale === "ar"
                        ? criterion.arabicDescription
                        : criterion.englishDescription}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!criterionId || createCriterion.isPending}
                  onClick={() =>
                    createCriterion.mutate({ btecCriterionId: criterionId })
                  }
                  className="focus-ring rounded-lg border border-primary/40 px-3 py-2 text-sm font-bold text-primary disabled:opacity-50"
                >
                  {locale === "ar" ? "ربط المعيار" : "Attach criterion"}
                </button>
              </div>
            ) : null}
            <div className="grid gap-2 md:grid-cols-4">
              <input
                value={custom.code}
                onChange={(event) =>
                  setCustom((current) => ({
                    ...current,
                    code: event.target.value,
                  }))
                }
                placeholder="A.P1"
                className="rounded-lg border border-border bg-transparent p-2 text-sm"
              />
              <select
                value={custom.band}
                onChange={(event) =>
                  setCustom((current) => ({
                    ...current,
                    band: event.target.value as typeof custom.band,
                  }))
                }
                className="rounded-lg border border-border bg-transparent p-2 text-sm"
              >
                <option value="Pass">P — Pass</option>
                <option value="Merit">M — Merit</option>
                <option value="Distinction">D — Distinction</option>
              </select>
              <input
                value={custom.arabicDescription}
                onChange={(event) =>
                  setCustom((current) => ({
                    ...current,
                    arabicDescription: event.target.value,
                  }))
                }
                placeholder={
                  locale === "ar" ? "وصف عربي" : "Arabic description"
                }
                className="rounded-lg border border-border bg-transparent p-2 text-sm"
              />
              <input
                value={custom.englishDescription}
                onChange={(event) =>
                  setCustom((current) => ({
                    ...current,
                    englishDescription: event.target.value,
                  }))
                }
                placeholder={
                  locale === "ar" ? "وصف إنجليزي" : "English description"
                }
                className="rounded-lg border border-border bg-transparent p-2 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={
                !custom.code.trim() ||
                !custom.arabicDescription.trim() ||
                !custom.englishDescription.trim() ||
                createCriterion.isPending
              }
              onClick={() => createCriterion.mutate(custom)}
              className="focus-ring w-fit rounded-lg border border-primary/40 px-3 py-2 text-sm font-bold text-primary disabled:opacity-50"
            >
              {locale === "ar" ? "إضافة معيار مخصص" : "Add custom criterion"}
            </button>
          </div>
        ) : null}
      </div>
      <RequestError error={publish.error} />
      <RequestError error={remove.error} />
      <RequestError error={removeCriterion.error} />
      <RequestError error={createCriterion.error} />
    </article>
  );
}

function AssignmentSubmissionCard({
  submission,
  assignment,
  disabled,
  onChanged,
}: {
  submission: TeacherAssignmentSubmission;
  assignment: CourseAssignmentData;
  disabled: boolean;
  onChanged: () => void;
}) {
  const locale = useLocale();
  const [results, setResults] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      assignment.criteria.map((criterion) => [criterion.id, "NotAchieved"]),
    ),
  );
  const [criterionFeedbacks, setCriterionFeedbacks] = useState<
    Record<string, string>
  >({});
  const [feedback, setFeedback] = useState("");
  const [privateNotes, setPrivateNotes] = useState("");
  const grade = useMutation({
    mutationFn: () =>
      api(`/teacher/assignments/submissions/${submission.id}/grade`, {
        method: "POST",
        body: JSON.stringify({
          results: assignment.criteria.map((criterion) => ({
            criterionId: criterion.id,
            achievement: results[criterion.id],
            feedback: criterionFeedbacks[criterion.id] || null,
          })),
          overallFeedback: feedback || null,
          privateTeacherNotes: privateNotes || null,
        }),
      }),
    onSuccess: onChanged,
  });
  const revision = useMutation({
    mutationFn: () =>
      api(`/teacher/assignments/submissions/${submission.id}/revision`, {
        method: "POST",
        body: JSON.stringify({ feedback }),
      }),
    onSuccess: onChanged,
  });
  const canReview = submission.status === "Submitted" && !disabled;
  return (
    <article className="rounded-xl border border-border bg-surface-solid/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-black">
            {locale === "ar" ? assignment.arabicTitle : assignment.englishTitle}
          </p>
          <p className="mt-1 text-sm text-muted">
            {locale === "ar" ? "الطالب" : "Student"}: {submission.studentUserId}{" "}
            · {submission.status}
          </p>
        </div>
        {submission.calculatedGrade ? (
          <span className="rounded-full bg-primary/15 px-3 py-1 text-sm font-black text-primary">
            {submission.calculatedGrade}
          </span>
        ) : null}
      </div>
      {submission.files.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {submission.files.map((file) => (
            <a
              key={file.id}
              href={`/api/v1/assignments/submissions/${submission.id}/files/${file.id}`}
              className="focus-ring inline-flex items-center gap-1 rounded-lg border border-primary/35 px-2.5 py-2 text-xs font-bold text-primary"
            >
              <FileText size={14} aria-hidden="true" /> {file.originalFileName}
            </a>
          ))}
        </div>
      ) : null}
      {submission.feedback.length ? (
        <div className="mt-3 grid gap-2 border-t border-border pt-3 text-sm">
          {submission.feedback.map((item) => (
            <p
              key={`${item.createdAtUtc}-${item.body}`}
              className={`rounded-lg p-2.5 ${item.isPrivate ? "border border-amber-400/35 bg-amber-400/10 text-amber-200" : "bg-page/50 text-muted"}`}
            >
              {item.isPrivate
                ? locale === "ar"
                  ? "ملاحظة خاصة: "
                  : "Private note: "
                : ""}
              {item.requestsResubmission ? "↻ " : ""}
              {item.body}
            </p>
          ))}
        </div>
      ) : null}
      {canReview ? (
        <div className="mt-4 grid gap-3 border-t border-border pt-4">
          <p className="font-bold">
            {locale === "ar" ? "تدقيق المعايير" : "Criterion review"}
          </p>
          {assignment.criteria.map((criterion) => (
            <div
              key={criterion.id}
              className="grid gap-2 rounded-lg border border-border p-3 text-sm"
            >
              <div className="grid gap-2 md:grid-cols-[1fr_12rem] md:items-center">
                <span>
                  <strong className="text-primary">{criterion.code}</strong> —{" "}
                  {locale === "ar"
                    ? criterion.arabicDescription
                    : criterion.englishDescription}
                </span>
                <select
                  value={results[criterion.id] ?? "NotAchieved"}
                  onChange={(event) =>
                    setResults((current) => ({
                      ...current,
                      [criterion.id]: event.target.value,
                    }))
                  }
                  className="rounded-lg border border-border bg-transparent p-2 text-sm"
                >
                  <option value="Achieved">
                    {locale === "ar" ? "متحقق" : "Achieved"}
                  </option>
                  <option value="PartiallyAchieved">
                    {locale === "ar" ? "متحقق جزئيًا" : "Partially achieved"}
                  </option>
                  <option value="NotAchieved">
                    {locale === "ar" ? "غير متحقق" : "Not achieved"}
                  </option>
                  <option value="NotApplicable">
                    {locale === "ar" ? "لا ينطبق" : "Not applicable"}
                  </option>
                </select>
              </div>
              <textarea
                value={criterionFeedbacks[criterion.id] ?? ""}
                onChange={(event) =>
                  setCriterionFeedbacks((current) => ({
                    ...current,
                    [criterion.id]: event.target.value,
                  }))
                }
                maxLength={4000}
                placeholder={
                  locale === "ar"
                    ? `ملاحظات ظاهرة للطالب حول ${criterion.code}`
                    : `Student-visible feedback for ${criterion.code}`
                }
                className="min-h-16 rounded-lg border border-border bg-transparent p-2 text-sm"
              />
            </div>
          ))}
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder={
              locale === "ar"
                ? "ملاحظات عامة للطالب"
                : "Overall feedback for the student"
            }
            className="min-h-20 rounded-xl border border-border bg-transparent p-2.5 text-sm"
          />
          <textarea
            value={privateNotes}
            onChange={(event) => setPrivateNotes(event.target.value)}
            maxLength={4000}
            placeholder={
              locale === "ar"
                ? "ملاحظات خاصة للمعلم/الأدمن — لا تظهر للطالب"
                : "Private teacher/admin notes — never shown to the student"
            }
            className="min-h-20 rounded-xl border border-amber-400/35 bg-amber-400/5 p-2.5 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => grade.mutate()}
              disabled={grade.isPending}
              className="focus-ring rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
            >
              {locale === "ar"
                ? "حفظ التقييم والنتيجة"
                : "Save assessment & result"}
            </button>
            <button
              type="button"
              onClick={() => revision.mutate()}
              disabled={!feedback.trim() || revision.isPending}
              className="focus-ring rounded-xl border border-primary/40 px-4 py-2.5 text-sm font-bold text-primary disabled:opacity-50"
            >
              {locale === "ar" ? "طلب إعادة تسليم" : "Request resubmission"}
            </button>
          </div>
          <RequestError error={grade.error} />
          <RequestError error={revision.error} />
        </div>
      ) : null}
    </article>
  );
}

function ReviewSubmission({
  course,
  disabled,
}: {
  course: CourseEditorData;
  disabled: boolean;
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const submit = useMutation({
    mutationFn: () =>
      api<{ passed: boolean; reasons: string[] }>(
        `/teacher/courses/${course.id}/submit`,
        { method: "POST" },
      ),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["teacher-course", course.id] }),
  });
  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 text-lg font-black">
        <CheckCircle2 size={19} className="text-primary" aria-hidden="true" />
        {locale === "ar" ? "إرسال للمراجعة" : "Submit for review"}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        {locale === "ar"
          ? "لن يستطيع الأدمن اعتماد الدورة قبل مراجعة الغلاف والوحدات والدروس والملفات الموجودة هنا."
          : "The administrator reviews the cover, modules, lessons, and uploaded files here before approving this course."}
      </p>
      <button
        type="button"
        disabled={disabled || submit.isPending}
        onClick={() => submit.mutate()}
        className="focus-ring mt-4 w-full rounded-xl bg-primary px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-50"
      >
        {locale === "ar" ? "فحص وإرسال الدورة" : "Check and submit course"}
      </button>
      {submit.data ? (
        <div
          className={`mt-3 rounded-xl p-3 text-sm ${submit.data.passed ? "bg-primary/10 text-primary" : "bg-red-500/10 text-red-300"}`}
        >
          {submit.data.passed ? (
            locale === "ar" ? (
              "تم إرسال الدورة إلى الأدمن للمراجعة."
            ) : (
              "The course was submitted to the administrator."
            )
          ) : (
            <ul className="list-inside list-disc">
              {submit.data.reasons.map((reason) => (
                <li key={reason}>{localizeCourseMessage(reason, locale)}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      <RequestError error={submit.error} />
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  multiline = false,
  disabled = false,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-bold text-muted">
      {label}
      {multiline ? (
        <textarea
          required={required}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-28 rounded-xl border border-border bg-transparent p-3 text-foreground disabled:opacity-50"
        />
      ) : (
        <input
          required={required}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="rounded-xl border border-border bg-transparent p-3 text-foreground disabled:opacity-50"
        />
      )}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; name: string }[];
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-bold text-muted">
      {label}
      <select
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-border bg-transparent p-3 text-foreground"
      >
        <option value="">—</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function RequestError({ error }: { error: unknown }) {
  const locale = useLocale();
  return error ? (
    <p role="alert" className="text-sm text-red-400">
      {localizeCourseMessage(
        error instanceof Error ? error.message : "Request failed.",
        locale,
      )}
    </p>
  ) : null;
}

function localizeCourseMessage(message: string, locale: string) {
  if (locale !== "ar") return message;

  const messages: Record<string, string> = {
    "Course title is required.": "أدخل عنوان الدورة.",
    "Course description is required.": "أدخل وصفًا مختصرًا للدورة.",
    "A processed, safe cover image is required.":
      "ارفع غلافًا صالحًا وآمنًا للدورة قبل إرسالها للمراجعة.",
    "A paid course needs a valid price.":
      "أدخل سعرًا صحيحًا للدورة المدفوعة أو اختر أنها مجانية.",
    "At least one published module and lesson are required.":
      "أضف وحدة منشورة ودرسًا منشورًا واحدًا على الأقل قبل الإرسال.",
    "Published video lessons need a duration.":
      "أدخل مدة صحيحة لكل درس فيديو منشور.",
    "Enter the required course details and a valid price.":
      "أدخل معلومات الدورة الأساسية وسعرًا صحيحًا، أو اختر أنها مجانية.",
    "Choose a valid learning track, grade, specialization, and subject.":
      "تحقّق من المسار أو الصف أو التخصص أو المادة التي اخترتها.",
    "Only editable draft courses with complete details can be updated.":
      "لا يمكن تعديل هذه الدورة إلا إذا كانت مسودة أو بحاجة إلى تعديل ومعلوماتها الأساسية مكتملة.",
    "This module cannot be updated.": "تعذّر تعديل هذه الوحدة.",
    "Only an editable unit can be duplicated.":
      "يمكن تكرار الوحدات القابلة للتحرير فقط.",
    "Request failed.": "تعذّر تنفيذ الطلب. حاول مرة أخرى.",
    "Unable to initialize request security.":
      "تعذّر تهيئة حماية الطلب. حدّث الصفحة ثم حاول مرة أخرى.",
    Forbidden:
      "ليس لديك صلاحية لتنفيذ هذه العملية أو أن الدورة لم تعد قابلة للتحرير.",
    "Bad Request": "البيانات المدخلة غير صحيحة. راجع الحقول وحاول مرة أخرى.",
  };

  return messages[message] ?? message;
}

function statusLabel(status: string, locale: string) {
  const ar: Record<string, string> = {
    Draft: "مسودة",
    Rejected: "تحتاج تعديلًا",
    SubmittedForReview: "قيد مراجعة الأدمن",
    Approved: "معتمدة بانتظار النشر",
    Published: "منشورة",
  };
  const en: Record<string, string> = {
    Draft: "Draft",
    Rejected: "Needs revision",
    SubmittedForReview: "Under admin review",
    Approved: "Approved, awaiting publication",
    Published: "Published",
  };
  return (locale === "ar" ? ar : en)[status] ?? status;
}
