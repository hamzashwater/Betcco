import { useState } from "react";
import { Action } from "@/components/ui/action";
import { Field } from "@/components/forms/field";
import { FilePicker } from "@/components/forms/file-picker";
import { MutationOutcome, QueryState } from "@/components/ui/query-state";

/** Isolated visual fixture; synthetic bilingual copy, never a production route. */
export function Ui2aPresentationSpecimen({ locale }: { locale: "ar" | "en" }) {
  const [files, setFiles] = useState<File[]>([]);
  const ar = locale === "ar";
  const text = (en: string, arabic: string) => (ar ? arabic : en);
  return (
    <main
      dir={ar ? "rtl" : "ltr"}
      className="mx-auto grid max-w-3xl gap-6 p-4 text-text-primary sm:p-8"
    >
      <h1 className="text-2xl font-bold">
        {text("Shared presentation specimen", "عينة عناصر العرض المشتركة")}
      </h1>
      <div className="flex flex-wrap gap-3">
        <Action>
          {text(
            "Continue with the selected learning material",
            "متابعة العمل باستخدام المادة التعليمية المختارة لهذه المهمة",
          )}
        </Action>
        <Action variant="secondary">{text("Details", "التفاصيل")}</Action>
        <Action variant="quiet">{text("Back", "رجوع")}</Action>
        <Action variant="danger">{text("Delete", "حذف")}</Action>
        <Action disabled>{text("Disabled", "معطل")}</Action>
        <Action pending pendingLabel={text("Saving…", "جارٍ الحفظ…")}>
          {text("Save", "حفظ")}
        </Action>
      </div>
      <Field
        label={text(
          "A long field label explaining the required evidence",
          "عنوان حقل طويل يوضح الأدلة المطلوبة لإتمام المهمة التعليمية",
        )}
        help={text(
          "Supporting guidance stays separate from validation.",
          "تبقى الإرشادات المساندة منفصلة عن رسائل التحقق.",
        )}
        error={text("Enter the evidence title.", "أدخل عنوان الأدلة.")}
      >
        <input required />
      </Field>
      <Field label={text("Read-only notes", "ملاحظات للقراءة فقط")}>
        <textarea readOnly value={text("Saved notes", "ملاحظات محفوظة")} />
      </Field>
      <Field label={text("Disabled selection", "اختيار معطل")}>
        <select disabled>
          <option>{text("Selected", "مختار")}</option>
        </select>
      </Field>
      <QueryState
        kind="loading"
        title={text("Loading records…", "جارٍ تحميل السجلات…")}
      />
      <QueryState
        kind="empty"
        title={text("No records yet", "لا توجد سجلات بعد")}
      />
      <QueryState
        kind="error"
        title={text("Records could not be loaded", "تعذر تحميل السجلات")}
        action={
          <Action variant="secondary">
            {text("Try again", "حاول مرة أخرى")}
          </Action>
        }
      />
      <QueryState
        kind="unavailable"
        title={text("Not configured", "غير مهيأ")}
      />
      <QueryState
        kind="restricted"
        title={text("Permission required", "يتطلب صلاحية")}
      />
      <MutationOutcome kind="success">
        {text("Saved successfully", "تم الحفظ بنجاح")}
      </MutationOutcome>
      <MutationOutcome kind="error">
        {text("Could not save", "تعذر الحفظ")}
      </MutationOutcome>
      <FilePicker
        label={text("Evidence files", "ملفات الأدلة")}
        locale={locale}
        files={files}
        onFilesChange={setFiles}
        multiple
        maxFileBytes={20}
        helpText={text(
          "Fixture limit: 20 bytes per file",
          "حد العينة: 20 بايت لكل ملف",
        )}
      />
    </main>
  );
}
