import type { FilePickerCopy } from "@/components/forms/file-picker";
import type { useTranslations } from "next-intl";

type TeacherTranslations = ReturnType<
  typeof useTranslations<"teacherWorkspace">
>;

export function teacherFilePickerCopy(t: TeacherTranslations): FilePickerCopy {
  return {
    noFilesSelected: t("filePicker.noFilesSelected"),
    selectionStatus: (count) =>
      count === 1
        ? t("filePicker.oneFileSelected", { count })
        : t("filePicker.filesSelected", { count }),
    chooseFile: t("filePicker.chooseFile"),
    chooseFiles: t("lesson.chooseFiles"),
    selectedFiles: t("filePicker.selectedFiles"),
    inputLabel: (label) => t("filePicker.chooseInput", { label }),
    removeFile: (fileName) => t("filePicker.removeFile", { fileName }),
    oversizedFile: (fileName, limit) =>
      t("filePicker.oversizedFile", { fileName, limit }),
    typeLabel: (value) =>
      value === "File" ? t("filePicker.genericFile") : value,
  };
}
