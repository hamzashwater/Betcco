"use client";

import { FileText, FileUp, Image as ImageIcon, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Action } from "@/components/ui/action";

export type FilePickerCopy = {
  noFilesSelected: string;
  selectionStatus: (count: number) => string;
  chooseFile: string;
  chooseFiles: string;
  selectedFiles: string;
  inputLabel: (label: string) => string;
  removeFile: (fileName: string) => string;
  oversizedFile: (fileName: string, limit: string) => string;
  typeLabel: (value: string) => string;
};

type FilePickerProps = {
  label: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
  locale: string;
  accept?: string;
  multiple?: boolean;
  maxFileBytes?: number;
  helpText?: string;
  chooseLabel?: string;
  copy?: FilePickerCopy;
  disabled?: boolean;
};

export function FilePicker({
  label,
  files,
  onFilesChange,
  locale,
  accept,
  multiple = false,
  maxFileBytes,
  helpText,
  chooseLabel,
  copy,
  disabled = false,
}: FilePickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const isArabic = locale === "ar";
  const selectionStatus = copy
    ? copy.selectionStatus(files.length)
    : isArabic
      ? files.length === 1
        ? "ملف واحد مختار"
        : `${files.length} ملفات مختارة`
      : `${files.length} ${files.length === 1 ? "file" : "files"} selected`;
  const defaultChooseLabel = copy
    ? multiple
      ? copy.chooseFiles
      : copy.chooseFile
    : multiple
      ? isArabic
        ? "اختيار ملفات"
        : "Choose files"
      : isArabic
        ? "اختيار ملف"
        : "Choose file";

  const chooseFiles = (selectedFiles: File[]) => {
    const oversized = maxFileBytes
      ? selectedFiles.find((file) => file.size > maxFileBytes)
      : undefined;
    if (oversized) {
      setError(
        copy
          ? copy.oversizedFile(oversized.name, formatBytes(maxFileBytes!))
          : isArabic
            ? `الملف «${oversized.name}» أكبر من الحد المسموح: ${formatBytes(maxFileBytes!)} لكل ملف.`
            : `“${oversized.name}” exceeds the ${formatBytes(maxFileBytes!)} limit per file.`,
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setError(undefined);
    if (!multiple) {
      onFilesChange(selectedFiles.slice(0, 1));
      return;
    }

    const combined = [...files, ...selectedFiles];
    onFilesChange(
      combined.filter(
        (file, index) =>
          combined.findIndex(
            (candidate) => fileKey(candidate) === fileKey(file),
          ) === index,
      ),
    );
  };

  const removeFile = (file: File) => {
    onFilesChange(
      files.filter((candidate) => fileKey(candidate) !== fileKey(file)),
    );
    if (files.length === 1 && inputRef.current) inputRef.current.value = "";
  };

  return (
    <section
      className="min-w-0 rounded-2xl border border-border-default! bg-surface-content p-4"
      aria-labelledby={`${inputId}-label`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p
            id={`${inputId}-label`}
            className="text-sm font-black text-text-primary"
          >
            {label}
          </p>
          <p className="mt-1 text-xs text-text-muted" aria-live="polite">
            {files.length > 0
              ? selectionStatus
              : copy
                ? copy.noFilesSelected
                : isArabic
                  ? "لم يتم اختيار ملفات بعد"
                  : "No files selected yet"}
          </p>
        </div>
        <Action
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          aria-describedby={
            [
              helpText ? `${inputId}-help` : undefined,
              error ? `${inputId}-error` : undefined,
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }
        >
          <FileUp size={18} aria-hidden="true" />
          {chooseLabel ?? defaultChooseLabel}
        </Action>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => chooseFiles(Array.from(event.target.files ?? []))}
        className="sr-only"
        tabIndex={-1}
        aria-invalid={Boolean(error)}
        aria-describedby={
          [
            helpText ? `${inputId}-help` : undefined,
            error ? `${inputId}-error` : undefined,
          ]
            .filter(Boolean)
            .join(" ") || undefined
        }
        aria-label={
          copy
            ? copy.inputLabel(label)
            : isArabic
              ? `اختيار ${label}`
              : `Choose ${label}`
        }
      />
      {helpText ? (
        <p
          id={`${inputId}-help`}
          className="mt-3 text-sm leading-6 text-text-muted"
        >
          {helpText}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="mt-3 text-sm font-bold leading-6 text-danger"
        >
          {error}
        </p>
      ) : null}
      {files.length > 0 ? (
        <ul
          className="mt-4 grid gap-2"
          aria-label={
            copy
              ? copy.selectedFiles
              : isArabic
                ? "الملفات المختارة"
                : "Selected files"
          }
        >
          {files.map((file) => (
            <li
              key={fileKey(file)}
              className="flex min-w-0 items-center gap-3 rounded-xl border border-border-subtle! bg-surface-raised p-3"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-muted text-text-secondary">
                {file.type.startsWith("image/") ? (
                  <ImageIcon size={17} aria-hidden="true" />
                ) : (
                  <FileText size={17} aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-bold text-text-primary">
                  {file.name}
                </span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  {copy ? copy.typeLabel(fileType(file)) : fileType(file)} ·{" "}
                  {formatBytes(file.size)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => removeFile(file)}
                aria-label={
                  copy
                    ? copy.removeFile(file.name)
                    : isArabic
                      ? `إزالة الملف ${file.name}`
                      : `Remove ${file.name}`
                }
                className="focus-ring grid size-11 shrink-0 place-items-center rounded-control border border-border-default! text-text-muted transition-colors duration-150 hover:border-danger! hover:bg-danger-surface hover:text-danger motion-reduce:transition-none"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function fileType(file: File) {
  const extension = file.name.split(".").pop()?.toUpperCase();
  if (extension) return extension;
  return file.type || "File";
}
