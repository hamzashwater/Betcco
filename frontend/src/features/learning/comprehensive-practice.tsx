"use client";

import { formatLocalizedDateTime } from "@/i18n/date-time";
import { Action } from "@/components/ui/action";
import { QueryState, MutationOutcome } from "@/components/ui/query-state";
import styles from "./student-practice-presentation.module.css";
import { FilePicker } from "@/components/forms/file-picker";
import { teacherFilePickerCopy } from "@/features/teacher/file-picker-copy";
import { ApiError, api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  unitPracticeStatus,
  unitTrainingOutcome,
} from "@/features/teacher/practice-presentation";

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
  unavailableReason?:
    | "NotConfigured"
    | "LearningAimsIncomplete"
    | "DeadlineExpired"
    | "AccessRestricted";
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
  id: string;
  assignmentId: string;
  versions: { files: { id: string; originalFileName: string }[] }[];
};

export function StudentComprehensivePractice({
  courseId,
}: {
  courseId: string;
}) {
  const locale = useLocale();
  const access = useTranslations("studentCoursesLearningHub.access");
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
      <QueryState
        kind="loading"
        title={tr(
          locale,
          "جارٍ تحميل تدريب الوحدة…",
          "Loading Final Unit Practice…",
        )}
      />
    );
  if (units.isError || mine.isError)
    return (
      <QueryState
        kind="error"
        title={tr(
          locale,
          "تعذر تحميل تدريب الوحدة.",
          "Final Unit Practice could not be loaded.",
        )}
      />
    );
  if (!units.data?.length) return null;
  return (
    <section
      className={styles.region}
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
          <article key={unit.id} className={styles.final}>
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
              <span
                className={styles.status}
                role={practice.status === "Submitted" ? "status" : undefined}
              >
                {statusLabel(locale, practice.status)}
              </span>
            </div>
            <p className={styles.disclaimer}>
              {tr(
                locale,
                "هذه نتيجة تدريبية لمهمة الوحدة وليست نتيجة تقييم BTEC رسمي.",
                "This is a training result for the Unit Practice and is not a formal BTEC assessment result.",
              )}
            </p>
            {practice.effectiveDueAtUtc ? (
              <p className="mt-1 text-sm text-muted">
                {tr(locale, "الموعد النهائي", "Deadline")}:{" "}
                {formatLocalizedDateTime(practice.effectiveDueAtUtc, locale)}
              </p>
            ) : null}

            {practice.isTrainingComplete ? (
              <p className="mt-2 font-bold">
                {tr(
                  locale,
                  "اكتمل مسار التدريب للوحدة",
                  "Unit Training Complete",
                )}
              </p>
            ) : null}
            {!practice.isAvailable &&
            practice.status !== "Submitted" &&
            practice.status !== "Finalized" &&
            practice.unavailableReason === "LearningAimsIncomplete" ? (
              <p className="mt-2 text-sm text-muted">
                {tr(
                  locale,
                  "أكمل جميع أهداف التعلم ومراجعاتها أولًا.",
                  "Complete all Learning Aims and their reviews first.",
                )}
              </p>
            ) : null}
            {!practice.isAvailable &&
            practice.status !== "Submitted" &&
            practice.status !== "Finalized" &&
            practice.unavailableReason === "DeadlineExpired" ? (
              <p className="mt-2 text-sm text-muted">
                {tr(
                  locale,
                  "انتهى الموعد النهائي لهذه المهمة التدريبية.",
                  "The deadline for this Unit Practice has passed.",
                )}
              </p>
            ) : null}
            {!practice.isAvailable &&
            practice.status !== "Submitted" &&
            practice.status !== "Finalized" &&
            practice.unavailableReason === "AccessRestricted" ? (
              <QueryState kind="restricted" title={access("unavailable")} />
            ) : null}
            {practice.assignmentId && practice.isAvailable ? (
              <div className={styles.brief}>
                <h3 className="font-bold">
                  {tr(
                    locale,
                    practice.arabicTitle ?? "مهمة الوحدة",
                    practice.englishTitle ?? "Unit Practice",
                  )}
                </h3>
                <p className={styles.instructions}>
                  {tr(
                    locale,
                    practice.arabicInstructions ?? "",
                    practice.englishInstructions ?? "",
                  )}
                </p>
                {practice.resources?.map((resource) => (
                  <a
                    key={resource.id}
                    href={`/api/v1/assignments/${practice.assignmentId}/resources/${resource.id}`}
                    className={styles.fileRow + " focus-ring"}
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
                        <bdi>{criterion.code}</bdi> ·{" "}
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
            {uploaded.length ? (
              <div
                className={styles.evidence}
                aria-label={tr(locale, "ملفات الحل", "Work files")}
              >
                <p
                  className={styles.meta}
                  role={upload.isSuccess ? "status" : undefined}
                >
                  {tr(locale, "ملفات الحل", "Work files")}
                </p>{" "}
                {uploaded.map((file) => (
                  <a
                    key={file.id}
                    href={`/api/v1/assignments/submissions/${editing ? active!.submissionId : submission!.id}/files/${file.id}`}
                    className={styles.fileRow + " focus-ring"}
                  >
                    <bdi>{file.originalFileName}</bdi>
                  </a>
                ))}
              </div>
            ) : null}
            {canAct && practice.assignmentId ? (
              <div className={styles.work}>
                {!editing ? (
                  <Action
                    variant="primary"
                    pending={start.isPending}
                    pendingLabel={tr(locale, "فتح التدريب", "Open Practice")}
                    type="button"
                    disabled={start.isPending}
                    onClick={() => start.mutate(practice.assignmentId!)}
                    className={styles.action}
                  >
                    {submission
                      ? tr(locale, "متابعة المسودة", "Continue draft")
                      : tr(locale, "فتح التدريب", "Open Practice")}
                  </Action>
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
                        className={styles.note + " focus-ring"}
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
                    <div className="flex flex-wrap gap-2">
                      <Action
                        variant="secondary"
                        pending={start.isPending}
                        pendingLabel={tr(locale, "حفظ الملاحظة", "Save note")}
                        type="button"
                        disabled={
                          start.isPending ||
                          upload.isPending ||
                          submit.isPending
                        }
                        onClick={() => start.mutate(practice.assignmentId!)}
                        className={styles.action}
                      >
                        {tr(locale, "حفظ الملاحظة", "Save note")}
                      </Action>
                      <Action
                        variant="secondary"
                        pending={upload.isPending}
                        pendingLabel={tr(locale, "رفع الملفات", "Upload files")}
                        type="button"
                        disabled={
                          !files.length || upload.isPending || submit.isPending
                        }
                        onClick={() => upload.mutate()}
                        className={styles.action}
                      >
                        {tr(locale, "رفع الملفات", "Upload files")}
                      </Action>
                      <Action
                        variant="primary"
                        pending={submit.isPending}
                        pendingLabel={tr(
                          locale,
                          "تسليم للمعلم",
                          "Submit to teacher",
                        )}
                        type="button"
                        disabled={
                          !uploaded.length ||
                          upload.isPending ||
                          submit.isPending
                        }
                        onClick={() => submit.mutate()}
                        className={styles.action}
                      >
                        {tr(locale, "تسليم للمعلم", "Submit to teacher")}
                      </Action>
                    </div>
                  </>
                )}
              </div>
            ) : null}
            {practice.trainingOutcome ? (
              <div className={styles.feedback}>
                <p className="font-black">
                  {tr(locale, "النتيجة التدريبية", "Training Outcome")}:{" "}
                  {outcomeLabel(locale, practice.trainingOutcome)}
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
          </article>
        );
      })}
      {start.isSuccess && active ? (
        <MutationOutcome kind="success">
          {tr(locale, "حُفظت التعديلات.", "Changes saved.")}
        </MutationOutcome>
      ) : null}
      {start.isError || upload.isError || submit.isError ? (
        <MutationOutcome kind="error">
          {(start.error ?? upload.error ?? submit.error)?.message}
        </MutationOutcome>
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
  arabicInstructions: string;
  englishInstructions: string;
  dueAtUtc?: string;
  isPublished: boolean;
  publicationStatus: string;
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
  const t = useTranslations("teacherWorkspace");
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
      aria-label={t("practice.finalUnitPractice")}
    >
      <div>
        <h3 className="text-lg font-black">
          {t("practice.finalUnitPractice")}
        </h3>
        <p className="text-sm text-muted">
          {t(
            "practice.oneFormativePracticePerUnitReviewedAfterAllLearningAimsAreComplete",
          )}
        </p>
      </div>
      {practices.isPending || submissions.isPending ? (
        <p aria-busy="true" className="text-sm text-muted">
          {t("deadlineExtensions.loading")}
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
                  {tr(locale, practice.arabicTitle, practice.englishTitle)} ·{" "}
                  {practice.isPublished
                    ? t("announcements.published")
                    : t("practice.unpublishedDraft")}
                </p>
                {!practice.isPublished ? (
                  <TeacherComprehensiveAuthoring
                    practice={practice}
                    onChanged={refresh}
                  />
                ) : null}
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
                {t("practice.createUnitPractice")}
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
          <h4 className="font-bold">{t("practice.newFinalUnitPractice")}</h4>
          {(
            [
              ["arabicTitle", t("courseDetails.arabicTitle")],
              ["englishTitle", t("courseDetails.englishTitle")],
              ["arabicInstructions", t("practice.arabicInstructions")],
              ["englishInstructions", t("practice.englishInstructions")],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="grid gap-1 text-sm">
              {label}
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
            {t("practice.deadlineOptional")}
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
            {t("practice.savePractice")}
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
          {t("practice.unitPracticeCouldNotBeLoaded")}
        </p>
      ) : null}
    </section>
  );
}

function localDateTimeInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function TeacherComprehensiveAuthoring({
  practice,
  onChanged,
}: {
  practice: TeacherPractice;
  onChanged: () => void;
}) {
  const t = useTranslations("teacherWorkspace");
  const [form, setForm] = useState({
    arabicTitle: practice.arabicTitle,
    englishTitle: practice.englishTitle,
    arabicInstructions: practice.arabicInstructions,
    englishInstructions: practice.englishInstructions,
    dueAt: localDateTimeInput(practice.dueAtUtc),
  });
  const update = useMutation({
    mutationFn: () =>
      api(`/teacher/comprehensive-practice/${practice.id}`, {
        method: "PUT",
        body: JSON.stringify({
          arabicTitle: form.arabicTitle,
          englishTitle: form.englishTitle,
          arabicInstructions: form.arabicInstructions,
          englishInstructions: form.englishInstructions,
          dueAtUtc: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        }),
      }),
    onSuccess: onChanged,
  });
  const publish = useMutation({
    mutationFn: () =>
      api(`/teacher/assignments/${practice.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ publish: true }),
      }),
    onSuccess: onChanged,
  });
  return (
    <div className="grid gap-3 rounded-lg border border-border p-3">
      <p className="text-sm text-muted">
        {t(
          "practice.finishTheTaskResourcesAndCriteriaBeforePublishingForLearners",
        )}
      </p>
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!update.isPending) update.mutate();
        }}
      >
        {(
          [
            ["arabicTitle", t("courseDetails.arabicTitle")],
            ["englishTitle", t("courseDetails.englishTitle")],
            ["arabicInstructions", t("practice.arabicInstructions")],
            ["englishInstructions", t("practice.englishInstructions")],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="grid gap-1 text-sm">
            {label}
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
          {t("practice.deadlineOptional")}
          <input
            type="datetime-local"
            value={form.dueAt}
            onChange={(event) =>
              setForm((current) => ({ ...current, dueAt: event.target.value }))
            }
            className="rounded-lg border border-border bg-transparent p-2"
          />
        </label>
        <button
          type="submit"
          disabled={update.isPending || publish.isPending}
          className="focus-ring w-fit rounded-lg border border-primary/40 px-3 py-2 font-bold text-primary disabled:opacity-50"
        >
          {t("courseDetails.save")}
        </button>
      </form>
      {update.isSuccess ? (
        <p role="status" className="text-sm text-primary">
          {t("practice.changesSaved")}
        </p>
      ) : null}
      {update.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {update.error.message}
        </p>
      ) : null}
      <button
        type="button"
        disabled={publish.isPending || update.isPending}
        onClick={() => publish.mutate()}
        className="focus-ring w-fit rounded-xl bg-primary px-4 py-2 font-bold text-slate-950 disabled:opacity-50"
      >
        {t("practice.publishUnitPractice")}
      </button>
      {publish.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {publish.error.message}
        </p>
      ) : null}
    </div>
  );
}

function TeacherComprehensiveResources({
  practice,
  onChanged,
}: {
  practice: TeacherPractice;
  onChanged: () => void;
}) {
  const t = useTranslations("teacherWorkspace");
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
      <p className="font-bold">{t("practice.supportingMaterials")}</p>
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
        copy={teacherFilePickerCopy(t)}
        label={t("practice.resourceFiles")}
        files={files}
        onFilesChange={setFiles}
        locale={locale}
        multiple
        accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.zip,.txt"
        maxFileBytes={100 * 1024 * 1024}
        chooseLabel={t("lesson.chooseFiles")}
      />
      <button
        type="button"
        disabled={!files.length || upload.isPending}
        onClick={() => upload.mutate()}
        className="focus-ring w-fit rounded-lg border border-primary/40 px-3 py-2 font-bold text-primary disabled:opacity-50"
      >
        {t("practice.uploadResources")}
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
  const t = useTranslations("teacherWorkspace");
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
        {t("practice.unitCriteriaForTrainingContext")}
      </p>
      {practice.criteria.length ? (
        <p>{practice.criteria.map((criterion) => criterion.code).join(", ")}</p>
      ) : null}
      {available.length ? (
        <div className="flex flex-wrap gap-2">
          <label className="grid gap-1">
            {t("practice.chooseACriterionFromThisUnit")}
            <select
              value={criterionId}
              onChange={(event) => setCriterionId(event.target.value)}
              className="w-full max-w-full rounded-lg border border-border bg-surface-solid p-2"
            >
              <option value="">{t("practice.selectCriterion")}</option>
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
            {t("assignmentCard.attachCriterion")}
          </button>
        </div>
      ) : (
        <p className="text-muted">
          {t("practice.noAdditionalCanonicalCriteriaAreAvailableForThisUnit")}
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
  const t = useTranslations("teacherWorkspace");
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
        {t("practice.learner")}: {submission.studentUserId} ·{" "}
        {unitPracticeStatus(submission.status, t)}
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
            {t("practice.trainingOutcome")}:{" "}
            {unitTrainingOutcome(submission.trainingOutcome, t)}
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
            {t("practice.trainingOutcome")}
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
                    {unitTrainingOutcome(value, t)}
                  </option>
                ),
              )}
            </select>
          </label>
          {(
            [
              ["strengths", t("practice.strengths")],
              ["gaps", t("practice.gapsMissingEvidence")],
              ["improvementGuidance", t("practice.improvementGuidance")],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="grid gap-1">
              {label}
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
            {t("practice.finalizeReview")}
          </button>
          {review.isError ? (
            <p role="alert" className="text-red-400">
              {review.error instanceof ApiError && review.error.status === 409
                ? t("practice.anotherReviewFinalizedThisPracticeRefreshThePage")
                : review.error.message}
            </p>
          ) : null}
        </form>
      ) : null}
    </article>
  );
}
