"use client";

import { FileText, FileUp, Image as ImageIcon, X } from "lucide-react";
import { useId, useRef, useState } from "react";

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
  disabled = false,
}: FilePickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const isArabic = locale === "ar";
  const selectionStatus = isArabic
    ? files.length === 1
      ? "ملف واحد مختار"
      : `${files.length} ملفات مختارة`
    : `${files.length} ${files.length === 1 ? "file" : "files"} selected`;
  const defaultChooseLabel = multiple
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
        isArabic
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
      className="min-w-0 rounded-2xl border border-border bg-surface-solid/55 p-4"
      aria-labelledby={`${inputId}-label`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p
            id={`${inputId}-label`}
            className="text-sm font-black text-foreground"
          >
            {label}
          </p>
          <p className="mt-1 text-xs text-muted" aria-live="polite">
            {files.length > 0
              ? selectionStatus
              : isArabic
                ? "لم يتم اختيار ملفات بعد"
                : "No files selected yet"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="focus-ring inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl border border-primary/45 bg-primary/15 px-4 py-2.5 text-sm font-black text-primary hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-55"
        >
          <FileUp size={18} aria-hidden="true" />
          {chooseLabel ?? defaultChooseLabel}
        </button>
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
        aria-label={isArabic ? `اختيار ${label}` : `Choose ${label}`}
      />
      {helpText ? (
        <p className="mt-3 text-xs leading-5 text-muted">{helpText}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-xs font-bold text-red-400">
          {error}
        </p>
      ) : null}
      {files.length > 0 ? (
        <ul
          className="mt-4 grid gap-2"
          aria-label={isArabic ? "الملفات المختارة" : "Selected files"}
        >
          {files.map((file) => (
            <li
              key={fileKey(file)}
              className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-page/45 p-3"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                {file.type.startsWith("image/") ? (
                  <ImageIcon size={17} aria-hidden="true" />
                ) : (
                  <FileText size={17} aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-foreground">
                  {file.name}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {fileType(file)} · {formatBytes(file.size)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => removeFile(file)}
                aria-label={
                  isArabic ? `إزالة الملف ${file.name}` : `Remove ${file.name}`
                }
                className="focus-ring grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-300"
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
