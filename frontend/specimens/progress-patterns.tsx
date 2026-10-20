import type { ReactNode } from "react";
import { Check, Circle, CircleDot, LockKeyhole } from "lucide-react";
import { QueryState } from "@/components/ui/query-state";
import { formatLocalizedNumber } from "@/i18n/number-format";
import { formatLocalizedDateTime } from "@/i18n/date-time";
import type {
  AimSnapshot,
  DashboardSnapshot,
  EvaluationSnapshot,
  ProgressCopy,
  ProgressLocale,
  TaskSnapshot,
  UnitSnapshot,
} from "./progress-contracts";
import styles from "./progress-patterns.module.css";

type CopyProps = { copy: ProgressCopy; locale: ProgressLocale };
const titleOf = (value: UnitSnapshot | AimSnapshot, locale: ProgressLocale) =>
  locale === "ar" ? value.arabicTitle : value.englishTitle;
const knownLabel = (
  values: Record<string, string>,
  value: string | undefined,
) =>
  value === undefined
    ? undefined
    : Object.hasOwn(values, value)
      ? values[value]
      : value;

function State({ value, copy }: { value?: string; copy: ProgressCopy }) {
  const label = knownLabel(copy.states, value) ?? copy.unknown;
  const tone =
    value === "Completed"
      ? "complete"
      : ["Locked", "NotConfigured", "NeedsRevision", "PaymentFailed"].includes(
            value ?? "",
          )
        ? "attention"
        : [
              "Submitted",
              "Assigned",
              "UnderReview",
              "PendingAssignment",
            ].includes(value ?? "")
          ? "waiting"
          : "neutral";
  return (
    <span className={styles.state} data-tone={tone} data-source-state={value}>
      <bdi>{label}</bdi>
    </span>
  );
}

function Ratio({
  completed,
  total,
  label,
  copy,
  locale,
}: CopyProps & {
  completed?: number;
  total?: number;
  label: string;
}) {
  return (
    <p className={styles.ratio}>
      <span className="ui-type-label">{label}</span>
      <strong className="ui-type-data" dir="ltr" data-ratio>
        {completed !== undefined && total !== undefined
          ? `${formatLocalizedNumber(completed, locale)}/${formatLocalizedNumber(total, locale)}`
          : copy.unknown}
      </strong>
      {total === 0 && <span className="ui-type-meta">{copy.noContent}</span>}
    </p>
  );
}

function Due({ value, copy, locale }: CopyProps & { value?: string | null }) {
  return (
    <p className="ui-type-meta text-text-secondary">
      {copy.due}:{" "}
      {value ? (
        <time dateTime={value}>
          {formatLocalizedDateTime(value, locale) || value}
        </time>
      ) : (
        copy.noDue
      )}
    </p>
  );
}

/** A: real Unit identities only; a current Unit is supplied by page context. */
export function CourseJourneyRail({
  units,
  currentUnitId,
  copy,
  locale,
}: CopyProps & {
  units?: readonly UnitSnapshot[];
  currentUnitId?: string;
}) {
  return (
    <section
      data-progress-model="course"
      aria-label={copy.courseJourney}
      className={styles.pattern}
    >
      <h2 className="ui-type-section">{copy.courseJourney}</h2>
      {units === undefined ? (
        <QueryState kind="unavailable" title={copy.unavailable} />
      ) : units.length === 0 ? (
        <QueryState kind="empty" title={copy.noUnits} />
      ) : (
        <ol className={styles.journey}>
          {units.map((unit) => {
            const current = unit.id === currentUnitId;
            const confirmed = unit.finalPractice?.isTrainingComplete === true;
            const Icon = confirmed ? Check : current ? CircleDot : Circle;
            const countsKnown = unit.aims?.every(
              (aim) =>
                aim.contentCompleted !== undefined &&
                aim.contentTotal !== undefined,
            );
            const final = unit.finalPractice;
            return (
              <li
                key={unit.id}
                className={styles.unit}
                data-current={current}
                data-confirmed={confirmed}
              >
                <Icon
                  size={20}
                  strokeWidth={2}
                  aria-hidden="true"
                  className={styles.railMarker}
                />
                <details open={current}>
                  <summary
                    className={`focus-ring ${styles.summary}`}
                    aria-current={current ? "step" : undefined}
                  >
                    <span className="ui-type-label">
                      <bdi>{titleOf(unit, locale)}</bdi>
                    </span>
                    <span className="ui-type-meta">
                      {confirmed
                        ? copy.confirmedComplete
                        : current
                          ? copy.current
                          : copy.notConfirmed}
                    </span>
                  </summary>
                  <div className={styles.unitBody}>
                    <Ratio
                      copy={copy}
                      locale={locale}
                      label={copy.content}
                      completed={
                        countsKnown
                          ? unit.aims!.reduce(
                              (n, aim) => n + aim.contentCompleted!,
                              0,
                            )
                          : undefined
                      }
                      total={
                        countsKnown
                          ? unit.aims!.reduce(
                              (n, aim) => n + aim.contentTotal!,
                              0,
                            )
                          : undefined
                      }
                    />
                    <div className={styles.line}>
                      <span className="ui-type-label">
                        {copy.finalPractice}
                      </span>
                      <State value={final?.status} copy={copy} />
                    </div>
                    {final?.unavailableReason && (
                      <p className="ui-type-meta text-text-secondary">
                        <bdi>
                          {knownLabel(copy.reasons, final.unavailableReason)}
                        </bdi>
                      </p>
                    )}
                    {final?.effectiveDueAtUtc && (
                      <Due
                        value={final.effectiveDueAtUtc}
                        copy={copy}
                        locale={locale}
                      />
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** B: content confirmation, saved practice status and supplied feedback are separate. */
export function LearningAimChecklist({
  aim,
  copy,
  locale,
}: CopyProps & { aim: AimSnapshot }) {
  const feedback = [
    [copy.strengths, aim.strengths],
    [copy.gaps, aim.gaps],
    [copy.guidance, aim.improvementGuidance],
  ] as const;
  const hasFeedback = feedback.some(([, value]) => Boolean(value));
  return (
    <section
      data-progress-model="aim"
      aria-label={copy.aimChecklist}
      className={styles.pattern}
    >
      <h2 className="ui-type-section">{copy.aimChecklist}</h2>
      <p className="ui-type-label">
        <bdi dir="auto">{aim.code}</bdi> · <bdi>{titleOf(aim, locale)}</bdi>
      </p>
      {aim.isUnlocked === false && (
        <div className={styles.line}>
          <LockKeyhole size={18} aria-hidden="true" />
          <State copy={copy} value="Locked" />
        </div>
      )}
      <ol className={styles.checklist}>
        <li>
          <Ratio
            completed={aim.contentCompleted}
            total={aim.contentTotal}
            label={copy.content}
            copy={copy}
            locale={locale}
          />
          <p
            className="ui-type-meta"
            data-content-confirmed={aim.contentComplete === true}
          >
            {aim.contentComplete === true
              ? copy.contentComplete
              : aim.contentComplete === false
                ? copy.notConfirmed
                : copy.unknown}
          </p>
        </li>
        <li>
          <div className={styles.line}>
            <h3 className="ui-type-label">{copy.practice}</h3>
            <State copy={copy} value={aim.practiceStatus} />
          </div>
          {aim.attemptsRemaining !== undefined && (
            <p className="ui-type-meta">
              {copy.attemptsRemaining}:{" "}
              {formatLocalizedNumber(aim.attemptsRemaining, locale)}
            </p>
          )}
          <dl className={styles.outcomes}>
            {[
              [copy.latest, aim.trainingOutcome],
              [copy.best, aim.bestTrainingOutcome],
            ].map(([label, value]) =>
              value ? (
                <div key={label}>
                  <dt className="ui-type-meta">{label}</dt>
                  <dd className="ui-type-label">
                    <bdi>{value}</bdi>
                  </dd>
                </div>
              ) : null,
            )}
          </dl>
          <p className="ui-type-meta text-text-muted">{copy.formativeOnly}</p>
        </li>
        <li>
          <h3 className="ui-type-label">{copy.feedback}</h3>
          {hasFeedback ? (
            <dl className={styles.feedback}>
              {feedback.map(([label, value]) =>
                value ? (
                  <div key={label}>
                    <dt className="ui-type-meta">{label}</dt>
                    <dd className="ui-type-body">
                      <bdi dir="auto">{value}</bdi>
                    </dd>
                  </div>
                ) : null,
              )}
            </dl>
          ) : (
            <p className="ui-type-meta text-text-muted">{copy.noFeedback}</p>
          )}
        </li>
      </ol>
    </section>
  );
}

/** C: no inferred overdue state or action eligibility. The caller owns actions. */
export function TaskStateRow({
  task,
  action,
  copy,
  locale,
}: CopyProps & { task: TaskSnapshot; action?: ReactNode }) {
  return (
    <section
      data-progress-model="task"
      aria-label={copy.taskRow}
      className={styles.pattern}
    >
      <h2 className="ui-type-section">{copy.taskRow}</h2>
      <div className={styles.task}>
        <div>
          <h3 className="ui-type-label">
            <bdi>{task.title}</bdi>
          </h3>
          <Due copy={copy} locale={locale} value={task.effectiveDueAtUtc} />
        </div>
        <State value={task.status} copy={copy} />
        <div>
          {task.status !== undefined && action ? (
            action
          ) : (
            <span className="ui-type-meta text-text-muted">
              {copy.actionUnavailable}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/** D: current saved stage + real feedback order; never a fabricated completed chain. */
export function EvaluationLifecycle({
  request,
  copy,
  locale,
}: CopyProps & { request: EvaluationSnapshot }) {
  const origin = request.isResit
    ? request.resitOfEvaluationRequestId
    : request.isRetake
      ? request.retakeOfEvaluationRequestId
      : null;
  return (
    <section
      data-progress-model="evaluation"
      aria-label={copy.evaluationLifecycle}
      className={styles.pattern}
    >
      <h2 className="ui-type-section">{copy.evaluationLifecycle}</h2>
      <p className="ui-type-label">
        {request.isResit
          ? copy.resit
          : request.isRetake
            ? copy.retake
            : copy.standard}
      </p>
      <ol className={styles.lifecycle}>
        {origin && (
          <li>
            <p className="ui-type-meta">{copy.originalRequest}</p>
            <bdi className="ui-type-data" dir="auto">
              {origin}
            </bdi>
          </li>
        )}
        <li aria-current="step">
          <p className="ui-type-meta">
            {copy.request} · <bdi dir="auto">{request.id}</bdi>
          </p>
          <div className={styles.line}>
            <h3 className="ui-type-label">{copy.currentStage}</h3>
            <State value={request.status} copy={copy} />
          </div>
          <p className="ui-type-meta">
            {copy.attempt}:{" "}
            {formatLocalizedNumber(request.submissionAttemptNumber, locale)}
          </p>
          {request.effectiveRevisionDueAtUtc && (
            <Due
              copy={copy}
              locale={locale}
              value={request.effectiveRevisionDueAtUtc}
            />
          )}
        </li>
        {request.feedback.map((entry, index) => (
          <li
            key={`${index}:${entry.createdAtUtc}`}
            data-revision={entry.requestsResubmission}
          >
            <p className="ui-type-label">
              {entry.requestsResubmission ? copy.revision : copy.feedback}
            </p>
            <p className="ui-type-meta">
              <time dateTime={entry.createdAtUtc}>
                {formatLocalizedDateTime(entry.createdAtUtc, locale) ||
                  entry.createdAtUtc}
              </time>
            </p>
            <p className="ui-type-body">
              <bdi dir="auto">{entry.body}</bdi>
            </p>
          </li>
        ))}
      </ol>
      <div className={styles.result}>
        <p className="ui-type-meta">{copy.formalGrade}</p>
        <p className="ui-type-label">
          <bdi>{request.calculatedGrade ?? copy.gradeUnknown}</bdi>
        </p>
      </div>
      <p className="ui-type-meta text-text-secondary">
        {copy.submittedNotPassed}
      </p>
      <p className="ui-type-meta text-text-muted">{copy.fundingUnknown}</p>
      <p className="ui-type-meta text-text-muted">{copy.historyUnknown}</p>
    </section>
  );
}

/** E: the server's counts/state stay distinct; percent never gates Continue. */
export function DashboardContinuation({
  course,
  action,
  copy,
  locale,
}: CopyProps & { course: DashboardSnapshot; action?: ReactNode }) {
  return (
    <section
      data-progress-model="dashboard"
      aria-label={copy.dashboardSummary}
      className={styles.pattern}
    >
      <h2 className="ui-type-section">{copy.dashboardSummary}</h2>
      <div className={styles.compact}>
        <div>
          <h3 className="ui-type-label">
            <bdi>{course.localizedTitle}</bdi>
          </h3>
          <Ratio
            copy={copy}
            locale={locale}
            completed={course.completedLessons}
            total={course.totalLessons}
            label={copy.lessons}
          />
        </div>
        <State value={course.progressState} copy={copy} />
        {course.accessAvailable === true && action ? (
          action
        ) : (
          <p className="ui-type-meta text-text-secondary">
            {course.accessAvailable === false
              ? copy.accessUnavailable
              : copy.actionUnavailable}
          </p>
        )}
      </div>
      <p className="ui-type-meta text-text-muted">{copy.ratioNotGrade}</p>
    </section>
  );
}

/** F: completion is solely the exposed server flag, never a threshold guess. */
export function ConfirmedMilestone({
  unit,
  copy,
  locale,
}: CopyProps & { unit: UnitSnapshot }) {
  const confirmed = unit.finalPractice?.isTrainingComplete === true;
  const Icon = confirmed ? Check : Circle;
  return (
    <section
      data-progress-model="milestone"
      aria-label={copy.milestone}
      className={styles.pattern}
    >
      <h2 className="ui-type-section">{copy.milestone}</h2>
      <div className={styles.milestone} data-confirmed={confirmed}>
        <Icon size={24} strokeWidth={2} aria-hidden="true" />
        <div>
          <p className="ui-type-label">
            <bdi>{titleOf(unit, locale)}</bdi>
          </p>
          <p className="ui-type-meta">
            {confirmed
              ? copy.confirmedComplete
              : unit.finalPractice?.isTrainingComplete === false
                ? copy.notConfirmed
                : copy.unknown}
          </p>
          <p className="ui-type-meta">
            <bdi dir="auto">{unit.id}</bdi>
          </p>
        </div>
      </div>
      <p className="ui-type-meta text-text-muted">{copy.noAward}</p>
    </section>
  );
}
