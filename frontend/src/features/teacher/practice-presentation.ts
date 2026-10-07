import type { useTranslations } from "next-intl";
type TeacherPracticeTranslations = ReturnType<
  typeof useTranslations<"teacherWorkspace">
>;

export function learningAimPracticeStatus(
  value: string,
  t: TeacherPracticeTranslations,
) {
  const labels = new Map<string, string>([
    ["NotConfigured", t("practice.learningAimPracticeStatusNotConfigured")],
    ["Locked", t("practice.learningAimPracticeStatusLocked")],
    ["Available", t("practice.learningAimPracticeStatusAvailable")],
    ["Draft", t("courseEditor.status.draft")],
    ["Submitted", t("practice.learningAimPracticeStatusSubmitted")],
    ["Finalized", t("practice.learningAimPracticeStatusFinalized")],
  ]);
  return labels.get(value) ?? value;
}

export function learningAimTrainingOutcome(
  value: string,
  t: TeacherPracticeTranslations,
) {
  const labels = new Map<string, string>([
    ["NotYetAchieved", t("practice.learningAimTrainingOutcomeNotYetAchieved")],
    ["Pass", t("practice.learningAimTrainingOutcomePass")],
    ["Merit", t("practice.learningAimTrainingOutcomeMerit")],
    ["Distinction", t("practice.learningAimTrainingOutcomeDistinction")],
  ]);
  return labels.get(value) ?? value;
}

export function unitPracticeStatus(
  value: string,
  t: TeacherPracticeTranslations,
) {
  const labels = new Map<string, string>([
    ["NotConfigured", t("practice.unitPracticeStatusNotConfigured")],
    ["Locked", t("practice.learningAimPracticeStatusLocked")],
    ["Available", t("practice.learningAimPracticeStatusAvailable")],
    ["Draft", t("courseEditor.status.draft")],
    ["Submitted", t("practice.unitPracticeStatusSubmitted")],
    ["Finalized", t("practice.unitPracticeStatusFinalized")],
  ]);
  return labels.get(value) ?? t("practice.unknownStatus");
}

export function unitTrainingOutcome(
  value: string,
  t: TeacherPracticeTranslations,
) {
  const labels = new Map<string, string>([
    ["NotYetAchieved", t("practice.unitTrainingOutcomeNotYetAchieved")],
    ["Pass", t("gradebook.grades.Pass")],
    ["Merit", t("practice.unitTrainingOutcomeMerit")],
    ["Distinction", t("practice.unitTrainingOutcomeDistinction")],
  ]);
  return labels.get(value) ?? t("practice.unknownOutcome");
}
