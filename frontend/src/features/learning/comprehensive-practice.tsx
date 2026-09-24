"use client";

import { FilePicker } from "@/components/forms/file-picker";
import { ApiError, api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useState } from "react";

const tr = (locale: string, ar: string, en: string) =>
  locale === "ar" ? ar : en;
const statusLabel = (locale: string, status: string) =>
  ({
    NotConfigured: tr(locale, "لم تُنشأ المهمة بعد", "Not configured"),
    Locked: tr(locale, "مقفل", "Locked"),
    Available: tr(locale, "متاح", "Available"),
    Draft: tr(locale, "مسودة", "Draft"),
    Submitted: tr(
      locale,
      "مُسلَّم، بانتظار مراجعة المعلم",
      "Submitted, awaiting teacher review",
    ),
    Finalized: tr(locale, "تمت المراجعة", "Reviewed"),
  })[status] ?? tr(locale, "حالة غير معروفة", "Unknown status");
const outcomeLabel = (locale: string, outcome: string) =>
  ({
    NotYetAchieved: tr(locale, "لم يتحقق بعد", "Not yet achieved"),
    Pass: tr(locale, "نجاح", "Pass"),
    Merit: tr(locale, "جدارة", "Merit"),
    Distinction: tr(locale, "تميز", "Distinction"),
  })[outcome] ?? tr(locale, "نتيجة غير معروفة", "Unknown outcome");

type FinalPractice = {
  assignmentId?: string;
  arabicTitle?: string;
  englishTitle?: string;
  arabicInstructions?: string;
  englishInstructions?: string;
  effectiveDueAtUtc?: string;
  resources?: { id: string; displayName: string }[];
  criteria?: {
    code: string;
    arabicDescription: string;
    englishDescription: string;
  }[];
  isAvailable: boolean;
  status: string;
  trainingOutcome?: string;
  strengths?: string;
  gaps?: string;
  improvementGuidance?: string;
  isTrainingComplete: boolean;
};
type Unit = {
  id: string;
  arabicTitle: string;
  englishTitle: string;
  aims: { isComplete: boolean }[];
  finalPractice?: FinalPractice;
};
type Mine = {
  assignmentId: string;
  versions: { files: { id: string; originalFileName: string }[] }[];
};

export function StudentComprehensivePractice({
  courseId,
}: {
  courseId: string;
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [active, setActive] = useState<{
    assignmentId: string;
    submissionId: string;
  }>();
  const [files, setFiles] = useState<File[]>([]);
  const [comment, setComment] = useState("");
  const units = useQuery({
    queryKey: ["learning-aim-practice", courseId],
    queryFn: () =>
      api<Unit[]>(`/student/courses/${courseId}/learning-aim-practice`),
  });
  const mine = useQuery({
    queryKey: ["student-course-assignment-submissions"],
    queryFn: () => api<Mine[]>("/student/assignments/mine"),
  });
  const refresh = () => {
    void client.invalidateQueries({
      queryKey: ["learning-aim-practice", courseId],
    });
    void client.invalidateQueries({
      queryKey: ["student-course-assignment-submissions"],
    });
  };
  const start = useMutation({
    mutationFn: (assignmentId: string) =>
      api<{ submissionId: string }>(
        `/student/assignments/${assignmentId}/submissions`,
        { method: "POST", body: JSON.stringify({ comment }) },
      ),
    onSuccess: (result, assignmentId) => {
      setActive({ assignmentId, submissionId: result.submissionId });
      refresh();
    },
  });
  const upload = useMutation({
    mutationFn: async () => {
      if (!active) throw new Error("No active submission");
      for (const file of files) {
        const body = new FormData();
        body.set("file", file);
        await api(
          `/student/assignments/submissions/${active.submissionId}/files`,
          { method: "POST", body },
        );
      }
    },
    onSuccess: () => {
      setFiles([]);
      refresh();
    },
  });
  const submit = useMutation({
    mutationFn: () => {
      if (!active) throw new Error("No active submission");
      return api(
        `/student/assignments/submissions/${active.submissionId}/submit`,
        { method: "POST" },
      );
    },
    onSuccess: () => {
      setActive(undefined);
      setComment("");
      refresh();
    },
  });
  if (units.isPending || mine.isPending)
    return (
      <p aria-busy="true" className="mt-5 text-sm text-muted">
        {tr(locale, "جارٍ تحميل تدريب الوحدة…", "Loading Final Unit Practice…")}
      </p>
    );
  if (units.isError || mine.isError)
    return (
      <p role="alert" className="mt-5 text-sm text-red-400">
        {tr(
          locale,
          "تعذر تحميل تدريب الوحدة.",
          "Final Unit Practice could not be loaded.",
        )}
      </p>
    );
  if (!units.data?.length) return null;
  return (
    <section
      className="mt-6 grid gap-4"
      aria-label={tr(locale, "التدريب النهائي للوحدة", "Final Unit Practice")}
    >
      {units.data.map((unit) => {
        const practice = unit.finalPractice;
        if (!practice) return null;
        const submission = mine.data?.find(
          (item) => item.assignmentId === practice.assignmentId,
        );
        const uploaded =
          submission?.versions.flatMap((version) => version.files) ?? [];
        const editing = active?.assignmentId === practice.assignmentId;
        const canAct =
          practice.isAvailable &&
          practice.status !== "Submitted" &&
          practice.status !== "Finalized";
        return (
          <article
            key={unit.id}
            className="min-w-0 rounded-2xl border border-primary/30 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-black">
                  {tr(locale, unit.arabicTitle, unit.englishTitle)} ·{" "}
                  {tr(locale, "التدريب النهائي للوحدة", "Final Unit Practice")}
                </h2>
                <p className="text-sm text-muted">
                  {tr(
                    locale,
                    "أهداف التعلم المكتملة",
                    "Learning Aims complete",
                  )}
                  : {unit.aims.filter((aim) => aim.isComplete).length} /{" "}
                  {unit.aims.length}
                </p>
              </div>
              <span className="text-sm font-bold text-primary">
                {statusLabel(locale, practice.status)}
              </span>
            </div>
            {practice.isTrainingComplete ? (
              <p className="mt-2 font-bold">
                {tr(
                  locale,
                  "اكتمل مسار التدريب للوحدة",
                  "Unit Training Complete",
                )}
              </p>
            ) : null}
            {!practice.isAvailable && practice.status === "Locked" ? (
              <p className="mt-2 text-sm text-muted">
                {tr(
                  locale,
                  "أكمل جميع أهداف التعلم ومراجعاتها أولًا.",
                  "Complete all Learning Aims and their reviews first.",
                )}
              </p>
            ) : null}
            {practice.assignmentId && practice.isAvailable ? (
              <div className="mt-3 border-t border-border pt-3">
                <h3 className="font-bold">
                  {tr(
                    locale,
                    practice.arabicTitle ?? "مهمة الوحدة",
                    practice.englishTitle ?? "Unit Practice",
                  )}
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                  {tr(
                    locale,
                    practice.arabicInstructions ?? "",
                    practice.englishInstructions ?? "",
                  )}
                </p>
                {practice.effectiveDueAtUtc ? (
                  <p className="mt-1 text-sm text-muted">
                    {tr(locale, "الموعد النهائي", "Deadline")}:{" "}
                    {new Date(practice.effectiveDueAtUtc).toLocaleString(
                      locale,
                    )}
                  </p>
                ) : null}
                {practice.resources?.map((resource) => (
                  <a
                    key={resource.id}
                    href={`/api/v1/assignments/${practice.assignmentId}/resources/${resource.id}`}
                    className="focus-ring block w-fit text-sm text-primary underline"
                  >
                    {resource.displayName}
                  </a>
                ))}
                {practice.criteria?.length ? (
                  <div className="mt-2 text-sm">
                    <p className="font-bold">
                      {tr(
                        locale,
                        "معايير مرجعية للتدريب",
                        "Training reference criteria",
                      )}
                    </p>
                    {practice.criteria.map((criterion) => (
                      <p key={criterion.code}>
                        {criterion.code} ·{" "}
                        {tr(
                          locale,
                          criterion.arabicDescription,
                          criterion.englishDescription,
                        )}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {practice.trainingOutcome ? (
              <div className="mt-3 grid gap-2 text-sm">
                <p className="font-black">
                  {tr(locale, "النتيجة التدريبية", "Training Outcome")}:{" "}
                  {outcomeLabel(locale, practice.trainingOutcome)}
                </p>
                <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-2">
                  {tr(
                    locale,
                    "هذه نتيجة تدريبية لمهمة الوحدة وليست نتيجة تقييم BTEC رسمي.",
                    "This is a training result for the Unit Practice and is not a formal BTEC assessment result.",
                  )}
                </p>
                <p>
                  <strong>{tr(locale, "نقاط القوة", "Strengths")}:</strong>{" "}
                  {practice.strengths}
                </p>
                <p>
                  <strong>
                    {tr(
                      locale,
                      "الفجوات والأدلة الناقصة",
                      "Gaps / missing evidence",
                    )}
                    :
                  </strong>{" "}
                  {practice.gaps}
                </p>
                <p>
                  <strong>
                    {tr(locale, "كيفية التحسين", "How to improve")}:
                  </strong>{" "}
                  {practice.improvementGuidance}
                </p>
              </div>
            ) : null}
            {canAct && practice.assignmentId ? (
              <div className="mt-3 grid gap-3">
                {!editing ? (
                  <button
                    type="button"
                    disabled={start.isPending}
                    onClick={() => start.mutate(practice.assignmentId!)}
                    className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
                  >
                    {submission
                      ? tr(locale, "متابعة المسودة", "Continue draft")
                      : tr(locale, "فتح التدريب", "Open Practice")}
                  </button>
                ) : (
                  <>
                    <label className="grid gap-1 text-sm">
                      {tr(
                        locale,
                        "ملاحظة للمعلم (اختيارية)",
                        "Note to teacher (optional)",
                      )}
                      <textarea
                        value={comment}
                        maxLength={4000}
                        onChange={(event) => setComment(event.target.value)}
                        className="rounded-xl border border-border bg-transparent p-2"
                      />
                    </label>
                    <FilePicker
                      label={tr(locale, "ملفات الحل", "Work files")}
                      files={files}
                      onFilesChange={setFiles}
                      locale={locale}
                      multiple
                      accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.zip,.txt"
                      maxFileBytes={100 * 1024 * 1024}
                      chooseLabel={tr(locale, "اختيار ملفات", "Choose files")}
                    />
                    {uploaded.map((file) => (
                      <a
                        key={file.id}
                        href={`/api/v1/assignments/submissions/${active!.submissionId}/files/${file.id}`}
                        className="focus-ring w-fit text-sm text-primary underline"
                      >
                        {file.originalFileName}
                      </a>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={
                          start.isPending ||
                          upload.isPending ||
                          submit.isPending
                        }
                        onClick={() => start.mutate(practice.assignmentId!)}
                        className="focus-ring rounded-xl border border-border px-4 py-2 text-sm font-bold disabled:opacity-50"
                      >
                        {tr(locale, "حفظ الملاحظة", "Save note")}
                      </button>
                      <button
                        type="button"
                        disabled={
                          !files.length || upload.isPending || submit.isPending
                        }
                        onClick={() => upload.mutate()}
                        className="focus-ring rounded-xl border border-primary/40 px-4 py-2 text-sm font-bold text-primary disabled:opacity-50"
                      >
                        {tr(locale, "رفع الملفات", "Upload files")}
                      </button>
                      <button
                        type="button"
                        disabled={
                          !uploaded.length ||
                          upload.isPending ||
                          submit.isPending
                        }
                        onClick={() => submit.mutate()}
                        className="focus-ring rounded-xl bg-primary px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
                      >
                        {tr(locale, "تسليم للمعلم", "Submit to teacher")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </article>
        );
      })}
      {start.isError || upload.isError || submit.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {(start.error ?? upload.error ?? submit.error)?.message}
        </p>
      ) : null}
    </section>
  );
}

type TeacherModule = {
  id: string;
  unitDefinitionId?: string;
  arabicTitle: string;
  englishTitle: string;
  criteria: {
    id: string;
    code: string;
    arabicDescription: string;
    englishDescription: string;
  }[];
};
type TeacherPractice = {
  id: string;
  courseModuleId: string;
  arabicTitle: string;
  englishTitle: string;
  dueAtUtc?: string;
  resources: { id: string; displayName: string }[];
  criteria: { id: string; btecCriterionId?: string; code: string }[];
};
type TeacherSubmission = {
  id: string;
  courseAssignmentId: string;
  studentUserId: string;
  status: string;
  trainingOutcome?: string;
  trainingStrengths?: string;
  trainingGaps?: string;
  trainingImprovementGuidance?: string;
  files: { id: string; originalFileName: string }[];
};

export function TeacherComprehensivePractice({
  courseId,
  modules,
}: {
  courseId: string;
  modules: TeacherModule[];
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [moduleId, setModuleId] = useState("");
  const [form, setForm] = useState({
    arabicTitle: "",
    englishTitle: "",
    arabicInstructions: "",
    englishInstructions: "",
    dueAt: "",
  });
  const practices = useQuery({
    queryKey: ["teacher-comprehensive-practice", courseId],
    queryFn: () =>
      api<TeacherPractice[]>(
        `/teacher/courses/${courseId}/comprehensive-practice`,
      ),
  });
  const submissions = useQuery({
    queryKey: ["teacher-comprehensive-submissions", courseId],
    queryFn: () =>
      api<TeacherSubmission[]>(
        `/teacher/courses/${courseId}/comprehensive-practice/submissions`,
      ),
  });
  const refresh = () => {
    void client.invalidateQueries({
      queryKey: ["teacher-comprehensive-practice", courseId],
    });
    void client.invalidateQueries({
      queryKey: ["teacher-comprehensive-submissions", courseId],
    });
  };
  const create = useMutation({
    mutationFn: () =>
      api("/teacher/comprehensive-practice", {
        method: "POST",
        body: JSON.stringify({
          courseModuleId: moduleId,
          ...form,
          dueAtUtc: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        }),
      }),
    onSuccess: () => {
      setModuleId("");
      setForm({
        arabicTitle: "",
        englishTitle: "",
        arabicInstructions: "",
        englishInstructions: "",
        dueAt: "",
      });
      refresh();
    },
  });
  const units = modules.filter((module) => module.unitDefinitionId);
  if (!units.length) return null;
  return (
    <section
      className="grid gap-4 rounded-2xl border border-primary/25 p-4"
      aria-label={tr(locale, "التدريب النهائي للوحدات", "Final Unit Practice")}
    >
      <div>
        <h3 className="text-lg font-black">
          {tr(locale, "التدريب النهائي للوحدات", "Final Unit Practice")}
        </h3>
        <p className="text-sm text-muted">
          {tr(
            locale,
            "مهمة تدريبية تكوينية لكل وحدة، تُراجع بعد إكمال أهداف التعلم.",
            "One formative Practice per Unit, reviewed after all Learning Aims are complete.",
          )}
        </p>
      </div>
      {practices.isPending || submissions.isPending ? (
        <p aria-busy="true" className="text-sm text-muted">
          {tr(locale, "جارٍ التحميل…", "Loading…")}
        </p>
      ) : null}
      {units.map((unit) => {
        const practice = practices.data?.find(
          (item) => item.courseModuleId === unit.id,
        );
        return (
          <div
            key={unit.id}
            className="min-w-0 grid gap-2 rounded-xl border border-border p-3"
          >
            <h4 className="font-bold">
              {tr(locale, unit.arabicTitle, unit.englishTitle)}
            </h4>
            {practice ? (
              <>
                <p className="text-sm text-muted">
                  {tr(locale, practice.arabicTitle, practice.englishTitle)}
                </p>
                <TeacherComprehensiveCriteria
                  practice={practice}
                  unit={unit}
                  onChanged={refresh}
                />
                <TeacherComprehensiveResources
                  practice={practice}
                  onChanged={refresh}
                />
                {submissions.data
                  ?.filter((item) => item.courseAssignmentId === practice.id)
                  .map((item) => (
                    <TeacherComprehensiveReview
                      key={item.id}
                      submission={item}
                      onChanged={refresh}
                    />
                  ))}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setModuleId(unit.id)}
                className="focus-ring w-fit rounded-lg border border-primary/40 px-3 py-2 text-sm font-bold text-primary"
              >
                {tr(locale, "إنشاء مهمة الوحدة", "Create Unit Practice")}
              </button>
            )}
          </div>
        );
      })}
      {moduleId ? (
        <form
          className="grid gap-3 rounded-xl border border-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!create.isPending) create.mutate();
          }}
        >
          <h4 className="font-bold">
            {tr(locale, "مهمة تدريبية جديدة للوحدة", "New Final Unit Practice")}
          </h4>
          {(
            [
              ["arabicTitle", "العنوان بالعربية", "Arabic title"],
              ["englishTitle", "العنوان بالإنجليزية", "English title"],
              [
                "arabicInstructions",
                "التعليمات بالعربية",
                "Arabic instructions",
              ],
              [
                "englishInstructions",
                "التعليمات بالإنجليزية",
                "English instructions",
              ],
            ] as const
          ).map(([key, ar, en]) => (
            <label key={key} className="grid gap-1 text-sm">
              {tr(locale, ar, en)}
              <textarea
                required
                maxLength={key.includes("Instructions") ? 4000 : 256}
                value={form[key]}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                className="rounded-lg border border-border bg-transparent p-2"
              />
            </label>
          ))}
          <label className="grid gap-1 text-sm">
            {tr(locale, "الموعد النهائي (اختياري)", "Deadline (optional)")}
            <input
              type="datetime-local"
              value={form.dueAt}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  dueAt: event.target.value,
                }))
              }
              className="rounded-lg border border-border bg-transparent p-2"
            />
          </label>
          <button
            type="submit"
            disabled={create.isPending}
            className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 font-bold text-slate-950 disabled:opacity-50"
          >
            {tr(locale, "حفظ المهمة", "Save Practice")}
          </button>
          {create.isError ? (
            <p role="alert" className="text-sm text-red-400">
              {create.error.message}
            </p>
          ) : null}
        </form>
      ) : null}
      {practices.isError || submissions.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {tr(
            locale,
            "تعذر تحميل مهام الوحدة.",
            "Unit Practice could not be loaded.",
          )}
        </p>
      ) : null}
    </section>
  );
}

function TeacherComprehensiveResources({
  practice,
  onChanged,
}: {
  practice: TeacherPractice;
  onChanged: () => void;
}) {
  const locale = useLocale();
  const [files, setFiles] = useState<File[]>([]);
  const upload = useMutation({
    mutationFn: async () => {
      for (const file of files) {
        const body = new FormData();
        body.set("file", file);
        await api(`/teacher/assignments/${practice.id}/resources`, {
          method: "POST",
          body,
        });
      }
    },
    onSuccess: () => {
      setFiles([]);
      onChanged();
    },
  });
  return (
    <div className="grid gap-2 text-sm">
      <p className="font-bold">
        {tr(locale, "مواد مساعدة", "Supporting materials")}
      </p>
      {practice.resources.map((resource) => (
        <a
          key={resource.id}
          href={`/api/v1/assignments/${practice.id}/resources/${resource.id}`}
          className="focus-ring w-fit text-primary underline"
        >
          {resource.displayName}
        </a>
      ))}
      <FilePicker
        label={tr(locale, "ملفات مساعدة", "Resource files")}
        files={files}
        onFilesChange={setFiles}
        locale={locale}
        multiple
        accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.zip,.txt"
        maxFileBytes={100 * 1024 * 1024}
        chooseLabel={tr(locale, "اختيار ملفات", "Choose files")}
      />
      <button
        type="button"
        disabled={!files.length || upload.isPending}
        onClick={() => upload.mutate()}
        className="focus-ring w-fit rounded-lg border border-primary/40 px-3 py-2 font-bold text-primary disabled:opacity-50"
      >
        {tr(locale, "رفع المواد", "Upload resources")}
      </button>
      {upload.isError ? (
        <p role="alert" className="text-red-400">
          {upload.error.message}
        </p>
      ) : null}
    </div>
  );
}

function TeacherComprehensiveCriteria({
  practice,
  unit,
  onChanged,
}: {
  practice: TeacherPractice;
  unit: TeacherModule;
  onChanged: () => void;
}) {
  const locale = useLocale();
  const [criterionId, setCriterionId] = useState("");
  const add = useMutation({
    mutationFn: () =>
      api("/teacher/assignments/criteria", {
        method: "POST",
        body: JSON.stringify({
          assignmentId: practice.id,
          btecCriterionId: criterionId,
          sortOrder: practice.criteria.length,
        }),
      }),
    onSuccess: () => {
      setCriterionId("");
      onChanged();
    },
  });
  const available = unit.criteria.filter(
    (criterion) =>
      !practice.criteria.some((link) => link.btecCriterionId === criterion.id),
  );
  return (
    <div className="grid gap-2 text-sm">
      <p className="font-bold">
        {tr(
          locale,
          "المعايير المرجعية للوحدة",
          "Unit criteria for training context",
        )}
      </p>
      {practice.criteria.length ? (
        <p>{practice.criteria.map((criterion) => criterion.code).join(", ")}</p>
      ) : null}
      {available.length ? (
        <div className="flex flex-wrap gap-2">
          <label className="grid gap-1">
            {tr(
              locale,
              "اختر معيارًا من الوحدة",
              "Choose a criterion from this Unit",
            )}
            <select
              value={criterionId}
              onChange={(event) => setCriterionId(event.target.value)}
              className="w-full max-w-full rounded-lg border border-border bg-surface-solid p-2"
            >
              <option value="">
                {tr(locale, "اختر معيارًا", "Select criterion")}
              </option>
              {available.map((criterion) => (
                <option key={criterion.id} value={criterion.id}>
                  {criterion.code} ·{" "}
                  {tr(
                    locale,
                    criterion.arabicDescription,
                    criterion.englishDescription,
                  )}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!criterionId || add.isPending}
            onClick={() => add.mutate()}
            className="focus-ring self-end rounded-lg border border-primary/40 px-3 py-2 font-bold text-primary disabled:opacity-50"
          >
            {tr(locale, "ربط المعيار", "Attach criterion")}
          </button>
        </div>
      ) : (
        <p className="text-muted">
          {tr(
            locale,
            "لا تتوفر معايير أكاديمية إضافية في بيانات هذه الوحدة.",
            "No additional canonical criteria are available for this Unit.",
          )}
        </p>
      )}
      {add.isError ? (
        <p role="alert" className="text-red-400">
          {add.error.message}
        </p>
      ) : null}
    </div>
  );
}

function TeacherComprehensiveReview({
  submission,
  onChanged,
}: {
  submission: TeacherSubmission;
  onChanged: () => void;
}) {
  const locale = useLocale();
  const [form, setForm] = useState({
    trainingOutcome: "Pass",
    strengths: "",
    gaps: "",
    improvementGuidance: "",
  });
  const review = useMutation({
    mutationFn: () =>
      api(
        `/teacher/comprehensive-practice/submissions/${submission.id}/review`,
        { method: "POST", body: JSON.stringify(form) },
      ),
    onSuccess: onChanged,
  });
  return (
    <article className="grid gap-2 rounded-lg bg-white/5 p-3 text-sm">
      <p>
        {tr(locale, "الطالب", "Learner")}: {submission.studentUserId} ·{" "}
        {statusLabel(locale, submission.status)}
      </p>
      {submission.files.map((file) => (
        <a
          key={file.id}
          href={`/api/v1/assignments/submissions/${submission.id}/files/${file.id}`}
          className="focus-ring w-fit text-primary underline"
        >
          {file.originalFileName}
        </a>
      ))}
      {submission.trainingOutcome ? (
        <div className="grid gap-1">
          <p>
            {tr(locale, "النتيجة التدريبية", "Training Outcome")}:{" "}
            {outcomeLabel(locale, submission.trainingOutcome)}
          </p>
          <p>{submission.trainingStrengths}</p>
          <p>{submission.trainingGaps}</p>
          <p>{submission.trainingImprovementGuidance}</p>
        </div>
      ) : null}
      {submission.status === "Submitted" ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!review.isPending) review.mutate();
          }}
        >
          <label className="grid gap-1">
            {tr(locale, "النتيجة التدريبية", "Training Outcome")}
            <select
              value={form.trainingOutcome}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  trainingOutcome: event.target.value,
                }))
              }
              className="rounded-lg border border-border bg-surface-solid p-2"
            >
              {["NotYetAchieved", "Pass", "Merit", "Distinction"].map(
                (value) => (
                  <option key={value} value={value}>
                    {outcomeLabel(locale, value)}
                  </option>
                ),
              )}
            </select>
          </label>
          {(
            [
              ["strengths", "نقاط القوة", "Strengths"],
              ["gaps", "الفجوات والأدلة الناقصة", "Gaps / missing evidence"],
              [
                "improvementGuidance",
                "إرشادات التحسين",
                "Improvement guidance",
              ],
            ] as const
          ).map(([key, ar, en]) => (
            <label key={key} className="grid gap-1">
              {tr(locale, ar, en)}
              <textarea
                required
                maxLength={4000}
                value={form[key]}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                className="rounded-lg border border-border bg-transparent p-2"
              />
            </label>
          ))}
          <button
            type="submit"
            disabled={review.isPending}
            className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 font-bold text-slate-950 disabled:opacity-50"
          >
            {tr(locale, "اعتماد المراجعة", "Finalize review")}
          </button>
          {review.isError ? (
            <p role="alert" className="text-red-400">
              {review.error instanceof ApiError && review.error.status === 409
                ? tr(
                    locale,
                    "اعتمدت مراجعة أخرى هذه المهمة. حدّث الصفحة.",
                    "Another review finalized this Practice. Refresh the page.",
                  )
                : review.error.message}
            </p>
          ) : null}
        </form>
      ) : null}
    </article>
  );
}
