"use client";

import { FilePicker } from "@/components/forms/file-picker";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useState } from "react";

type Aim = {
  id: string;
  code: string;
  arabicTitle: string;
  englishTitle: string;
  isUnlocked: boolean;
  contentTotal: number;
  contentCompleted: number;
  contentComplete: boolean;
  assignmentId?: string;
  assignmentArabicTitle?: string;
  assignmentEnglishTitle?: string;
  arabicInstructions?: string;
  englishInstructions?: string;
  practiceAvailable: boolean;
  practiceStatus: string;
  trainingOutcome?: string;
  strengths?: string;
  gaps?: string;
  improvementGuidance?: string;
  isComplete: boolean;
};
type Unit = {
  id: string;
  arabicTitle: string;
  englishTitle: string;
  aims: Aim[];
};
type Mine = {
  id: string;
  assignmentId: string;
  status: string;
  versions: {
    versionNumber: number;
    files: { id: string; originalFileName: string }[];
  }[];
};
type Practice = {
  id: string;
  btecLearningAimId: string;
  arabicTitle: string;
  englishTitle: string;
};
type PracticeSubmission = {
  id: string;
  courseAssignmentId: string;
  studentUserId: string;
  status: string;
  trainingOutcome?: string;
  files: { id: string; originalFileName: string }[];
};

const tr = (locale: string, ar: string, en: string) =>
  locale === "ar" ? ar : en;

function practiceStatus(locale: string, status: string) {
  const arabic: Record<string, string> = {
    NotConfigured: "لم يُنشأ النشاط بعد",
    Locked: "مقفل",
    Available: "متاح",
    Draft: "مسودة",
    Submitted: "مُسلَّم، بانتظار المراجعة",
    Finalized: "تمت المراجعة",
  };
  return locale === "ar" ? (arabic[status] ?? status) : status;
}

function trainingOutcomeLabel(locale: string, outcome: string) {
  const arabic: Record<string, string> = {
    NotYetAchieved: "لم يتحقق بعد (Not Yet Achieved)",
    Pass: "نجاح (Pass)",
    Merit: "جدارة (Merit)",
    Distinction: "تميز (Distinction)",
  };
  return locale === "ar" ? (arabic[outcome] ?? outcome) : outcome;
}

export function StudentLearningAimPractice({ courseId }: { courseId: string }) {
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
    void client.invalidateQueries({ queryKey: ["player", courseId] });
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
      if (!active) throw new Error("No active practice submission");
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
      if (!active) throw new Error("No active practice submission");
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
  if (units.isPending)
    return (
      <p className="mt-5 text-sm text-muted" aria-busy="true">
        {tr(locale, "جارٍ تحميل أهداف التعلم…", "Loading learning aims…")}
      </p>
    );
  if (units.isError || mine.isError)
    return (
      <p className="mt-5 text-sm text-red-400" role="alert">
        {tr(
          locale,
          "تعذر تحميل أنشطة التدريب.",
          "Practice activities could not be loaded.",
        )}
      </p>
    );
  if (!units.data?.length) return null;
  return (
    <section
      className="mt-6 grid gap-4"
      aria-label={tr(
        locale,
        "أهداف التعلم والتدريب",
        "Learning aims and practice",
      )}
    >
      {units.data.map((unit) => (
        <div key={unit.id} className="rounded-2xl border border-border p-4">
          <h2 className="text-lg font-black">
            {tr(locale, unit.arabicTitle, unit.englishTitle)}
          </h2>
          <div className="mt-3 grid gap-3">
            {unit.aims.map((aim) => {
              const submission = mine.data?.find(
                (item) => item.assignmentId === aim.assignmentId,
              );
              const draft = active?.assignmentId === aim.assignmentId;
              const uploaded =
                submission?.versions.flatMap((version) => version.files) ?? [];
              return (
                <article
                  key={aim.id}
                  className="min-w-0 rounded-xl border border-border bg-white/5 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-black">
                      {aim.code} ·{" "}
                      {tr(locale, aim.arabicTitle, aim.englishTitle)}
                    </h3>
                    <span className="text-sm font-bold text-primary">
                      {aim.isComplete
                        ? tr(locale, "مكتمل", "Complete")
                        : aim.isUnlocked
                          ? tr(locale, "متاح", "Available")
                          : tr(locale, "مقفل", "Locked")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {tr(locale, "المحتوى", "Content")}: {aim.contentCompleted} /{" "}
                    {aim.contentTotal}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {tr(locale, "التدريب", "Practice")}:{" "}
                    {practiceStatus(locale, aim.practiceStatus)}
                  </p>
                  {!aim.isUnlocked ? (
                    <p className="mt-2 text-sm text-muted">
                      {tr(
                        locale,
                        "أكمل الهدف السابق ومراجعته لفتح هذا الهدف.",
                        "Complete the previous aim and its review to unlock this aim.",
                      )}
                    </p>
                  ) : null}
                  {aim.isUnlocked && aim.assignmentId ? (
                    <div className="mt-3 border-t border-border pt-3">
                      <h4 className="font-bold">
                        {tr(
                          locale,
                          aim.assignmentArabicTitle ?? "نشاط تدريبي",
                          aim.assignmentEnglishTitle ?? "Practice activity",
                        )}
                      </h4>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                        {tr(
                          locale,
                          aim.arabicInstructions ?? "",
                          aim.englishInstructions ?? "",
                        )}
                      </p>
                      {!aim.contentComplete ? (
                        <p className="mt-2 text-sm text-muted">
                          {tr(
                            locale,
                            "أكمل جميع عناصر المحتوى لفتح النشاط.",
                            "Complete all content items to unlock practice.",
                          )}
                        </p>
                      ) : null}
                      {aim.trainingOutcome ? (
                        <div className="mt-3 grid gap-2 text-sm">
                          <p className="font-black">
                            {tr(
                              locale,
                              "النتيجة التدريبية",
                              "Training Outcome",
                            )}
                            :{" "}
                            {trainingOutcomeLabel(locale, aim.trainingOutcome)}
                          </p>
                          <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-2">
                            {tr(
                              locale,
                              "هذه نتيجة تدريبية تكوينية وليست نتيجة تقييم BTEC رسمي ولا تدخل في ASSESS.",
                              "This formative training result is not a formal BTEC assessment result and is not part of ASSESS.",
                            )}
                          </p>
                          <p>
                            <strong>
                              {tr(locale, "نقاط القوة", "Strengths")}:
                            </strong>{" "}
                            {aim.strengths}
                          </p>
                          <p>
                            <strong>
                              {tr(locale, "الفجوات", "Missing / gaps")}:
                            </strong>{" "}
                            {aim.gaps}
                          </p>
                          <p>
                            <strong>
                              {tr(locale, "كيفية التحسين", "How to improve")}:
                            </strong>{" "}
                            {aim.improvementGuidance}
                          </p>
                        </div>
                      ) : null}
                      {aim.practiceAvailable &&
                      aim.practiceStatus !== "Submitted" &&
                      aim.practiceStatus !== "Finalized" ? (
                        <div className="mt-3 grid gap-3">
                          {!draft ? (
                            <button
                              type="button"
                              disabled={start.isPending}
                              onClick={() => start.mutate(aim.assignmentId!)}
                              className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
                            >
                              {submission?.status === "Draft"
                                ? tr(locale, "متابعة المسودة", "Continue draft")
                                : tr(locale, "بدء التدريب", "Start practice")}
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
                                  onChange={(event) =>
                                    setComment(event.target.value)
                                  }
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
                                chooseLabel={tr(
                                  locale,
                                  "اختيار ملفات",
                                  "Choose files",
                                )}
                              />
                              {uploaded.length ? (
                                <p className="text-sm text-muted">
                                  {uploaded.length}{" "}
                                  {tr(locale, "ملفات مرفوعة", "uploaded files")}
                                </p>
                              ) : null}
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={
                                    start.isPending ||
                                    upload.isPending ||
                                    submit.isPending
                                  }
                                  onClick={() =>
                                    start.mutate(aim.assignmentId!)
                                  }
                                  className="focus-ring rounded-xl border border-border px-4 py-2 text-sm font-bold text-muted disabled:opacity-50"
                                >
                                  {tr(locale, "حفظ الملاحظة", "Save note")}
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    !files.length ||
                                    upload.isPending ||
                                    submit.isPending
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
                                  {tr(
                                    locale,
                                    "تسليم للمعلم",
                                    "Submit to teacher",
                                  )}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      ))}
      {start.isError || upload.isError || submit.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {(start.error ?? upload.error ?? submit.error)?.message ??
            tr(locale, "تعذر إكمال العملية.", "The action failed.")}
        </p>
      ) : null}
    </section>
  );
}

export function TeacherLearningAimPractice({
  courseId,
  modules,
}: {
  courseId: string;
  modules: {
    id: string;
    unitDefinitionId?: string;
    arabicTitle: string;
    englishTitle: string;
    learningAims: {
      id: string;
      code: string;
      arabicTitle: string;
      englishTitle: string;
    }[];
  }[];
}) {
  const locale = useLocale();
  const client = useQueryClient();
  const [form, setForm] = useState({
    learningAimId: "",
    arabicTitle: "",
    englishTitle: "",
    arabicInstructions: "",
    englishInstructions: "",
  });
  const practices = useQuery({
    queryKey: ["teacher-practice", courseId],
    queryFn: () => api<Practice[]>(`/teacher/courses/${courseId}/practice`),
  });
  const submissions = useQuery({
    queryKey: ["teacher-practice-submissions", courseId],
    queryFn: () =>
      api<PracticeSubmission[]>(
        `/teacher/courses/${courseId}/practice/submissions`,
      ),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["teacher-practice", courseId] });
    void client.invalidateQueries({
      queryKey: ["teacher-practice-submissions", courseId],
    });
  };
  const create = useMutation({
    mutationFn: () =>
      api("/teacher/practice", {
        method: "POST",
        body: JSON.stringify({ ...form, dueAtUtc: null }),
      }),
    onSuccess: () => {
      setForm({
        learningAimId: "",
        arabicTitle: "",
        englishTitle: "",
        arabicInstructions: "",
        englishInstructions: "",
      });
      refresh();
    },
  });
  const aims = modules
    .filter((module) => module.unitDefinitionId)
    .flatMap((module) =>
      module.learningAims.map((aim) => ({
        ...aim,
        unit: tr(locale, module.arabicTitle, module.englishTitle),
      })),
    );
  if (!aims.length) return null;
  return (
    <section className="grid gap-4 rounded-2xl border border-primary/25 p-4">
      <div>
        <h3 className="text-lg font-black">
          {tr(
            locale,
            "أنشطة أهداف التعلم التدريبية",
            "Learning Aim Practice Activities",
          )}
        </h3>
        <p className="mt-1 text-sm text-muted">
          {tr(
            locale,
            "نتائج تدريبية يحددها المعلم، وليست نتائج تقييم BTEC رسمي.",
            "Teacher-decided formative outcomes, separate from formal BTEC assessment.",
          )}
        </p>
      </div>
      {practices.isPending || submissions.isPending ? (
        <p aria-busy="true" className="text-sm text-muted">
          {tr(locale, "جارٍ التحميل…", "Loading…")}
        </p>
      ) : null}
      {aims.map((aim) => {
        const practice = practices.data?.find(
          (item) => item.btecLearningAimId === aim.id,
        );
        return (
          <div
            key={aim.id}
            className="grid gap-2 rounded-xl border border-border p-3"
          >
            <h4 className="font-bold">
              {aim.unit} · {aim.code} ·{" "}
              {tr(locale, aim.arabicTitle, aim.englishTitle)}
            </h4>
            {practice ? (
              <>
                <p className="text-sm text-muted">
                  {tr(locale, practice.arabicTitle, practice.englishTitle)}
                </p>
                {submissions.data
                  ?.filter((item) => item.courseAssignmentId === practice.id)
                  .map((item) => (
                    <TeacherPracticeReview
                      key={item.id}
                      submission={item}
                      onChanged={refresh}
                    />
                  ))}
              </>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setForm((current) => ({ ...current, learningAimId: aim.id }))
                }
                className="focus-ring w-fit rounded-lg border border-primary/40 px-3 py-2 text-sm font-bold text-primary"
              >
                {tr(locale, "إضافة نشاط تدريبي", "Add practice activity")}
              </button>
            )}
          </div>
        );
      })}
      {form.learningAimId ? (
        <form
          className="grid gap-3 rounded-xl border border-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!create.isPending) create.mutate();
          }}
        >
          <h4 className="font-bold">
            {tr(locale, "نشاط تدريبي جديد", "New practice activity")}
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
          <button
            type="submit"
            disabled={create.isPending}
            className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
          >
            {tr(locale, "حفظ النشاط", "Save activity")}
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
            "تعذر تحميل أنشطة التدريب.",
            "Practice activities could not be loaded.",
          )}
        </p>
      ) : null}
    </section>
  );
}

function TeacherPracticeReview({
  submission,
  onChanged,
}: {
  submission: PracticeSubmission;
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
      api(`/teacher/practice/submissions/${submission.id}/review`, {
        method: "POST",
        body: JSON.stringify(form),
      }),
    onSuccess: onChanged,
  });
  return (
    <article className="grid gap-2 rounded-lg bg-white/5 p-3 text-sm">
      <p>
        {tr(locale, "الطالب", "Learner")}: {submission.studentUserId} ·{" "}
        {submission.status}
      </p>
      {submission.files.map((file) => (
        <a
          key={file.id}
          href={`/api/v1/assignments/submissions/${submission.id}/files/${file.id}`}
          className="focus-ring text-primary underline"
        >
          {file.originalFileName}
        </a>
      ))}
      {submission.trainingOutcome ? (
        <p>
          {tr(locale, "النتيجة التدريبية", "Training Outcome")}:{" "}
          {trainingOutcomeLabel(locale, submission.trainingOutcome)}
        </p>
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
                    {trainingOutcomeLabel(locale, value)}
                  </option>
                ),
              )}
            </select>
          </label>
          {(
            [
              ["strengths", "نقاط القوة", "Strengths"],
              ["gaps", "الفجوات", "Missing / gaps"],
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
              {review.error.message}
            </p>
          ) : null}
        </form>
      ) : null}
    </article>
  );
}
