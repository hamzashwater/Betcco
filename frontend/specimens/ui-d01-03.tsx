import { Action } from "@/components/ui/action";
import { MutationOutcome, QueryState } from "@/components/ui/query-state";

// Fixed synthetic copy, never imported by a production route. The specimen
// exercises actual shared primitives; no API/backend integration is implied.
const copy = {
  en: {
    display: "Learning with a clear next step",
    page: "A deliberately long learning workspace title that wraps without hiding the next action",
    section: "Feedback, evidence and a useful next step",
    item: "Review the current Learning Aim and its evidence",
    body: "Read the teacher feedback, compare your evidence and continue the current task. Learning, practice and formal assessment retain their separate meanings.",
    meta: "Updated 18 October 2026 · reference BTEC Level 3",
    name: "Learner name and a long descriptive field label",
    notes: "Evidence notes",
    invalid: "Add a clear explanation before continuing.",
    action: "Continue the current learning task and review the evidence",
    saving: "Saving the current explanation…",
    disabled: "Currently unavailable",
    column: "Reference",
    amount: "Amount / quantity",
    loading: "Loading the current workspace",
    empty: "No items match the current scope",
    error: "The current request could not be completed",
    restricted: "This item is not available to this account",
    unavailable: "The current information is unavailable",
    recovery: "Retry the current request",
    saved: "The explanation was saved",
    failed: "The explanation could not be saved",
    legacy: "Unmigrated body/reference: existing font policy is retained.",
  },
  ar: {
    display: "تعلُّمٌ واضحٌ وخطوةٌ تاليةٌ مفيدة",
    page: "عنوانٌ طويلٌ مقصودٌ لمساحة التعلُّم لاختبار الالتفاف ووضوح الحركات دون إخفاء الإجراء التالي",
    section: "الملاحظات والأدلّة والخطوة التالية",
    item: "مراجعة هدف التعلُّم الحالي والأدلّة المرتبطة به",
    body: "اقرأ ملاحظات المعلّم، وقارن الأدلّة، ثم تابع المهمّة الحالية. يحتفظ التعلُّم والتدريب والتقييم الرسمي بمعنى مستقلّ لكلّ منها. نختبر هنا التشكيل: التَّعَلُّمُ والمُراجَعَةُ والمسؤوليّةُ.",
    meta: "آخر تحديث ١٨ أكتوبر ٢٠٢٦ · مرجع تعليمي",
    name: "اسم الطالب مع وصفٍ طويلٍ للحقل لاختبار القراءة",
    notes: "ملاحظات الأدلّة",
    invalid: "أضف شرحًا واضحًا قبل المتابعة.",
    action: "متابعة مهمّة التعلُّم الحالية ومراجعة الأدلّة المرفقة",
    saving: "جارٍ حفظ الشرح الحالي…",
    disabled: "غير متاح حاليًا",
    column: "المرجع",
    amount: "المبلغ / الكميّة",
    loading: "جارٍ تحميل مساحة العمل الحالية",
    empty: "لا توجد عناصر ضمن النطاق الحالي",
    error: "تعذّر إكمال الطلب الحالي",
    restricted: "هذا العنصر غير متاح لهذا الحساب",
    unavailable: "المعلومات الحالية غير متاحة",
    recovery: "إعادة محاولة الطلب الحالي",
    saved: "تمّ حفظ الشرح",
    failed: "تعذّر حفظ الشرح",
    legacy: "مرجع للنص غير المعتمد بعد: يحتفظ بسياسة الخط السابقة.",
  },
};

export function BilingualTypographySpecimen({
  locale,
}: {
  locale: "en" | "ar";
}) {
  const t = copy[locale];
  return (
    <main
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="shell grid gap-6 py-6 text-text-primary"
    >
      <header className="grid min-w-0 gap-3">
        <p className="ui-type-display" data-type-role="display">
          {t.display}
        </p>
        <h1 className="ui-type-page" data-type-role="page">
          {t.page}
        </h1>
        <h2 className="ui-type-section" data-type-role="section">
          {t.section}
        </h2>
        <h3 className="ui-type-item" data-type-role="item">
          {t.item}
        </h3>
        <p className="ui-type-body" data-type-role="body">
          {t.body}
        </p>
        <p className="ui-type-meta text-text-muted" data-type-role="meta">
          {t.meta}
        </p>
        <p className="ui-type-body" data-mixed-run>
          <bdi lang="en" dir="ltr">
            BTEC Level 3 · JOD 125.00 · raw.student@example.invalid
          </bdi>{" "}
          ·{" "}
          <bdi lang="ar" dir="rtl">
            ١٢/٢٤ — مُلاحظةٌ خامٌّ
          </bdi>
        </p>
      </header>
      <section className="min-w-0 border-t border-border-subtle pt-4">
        <h2 className="ui-type-section">{t.amount}</h2>
        <table
          className="ui-type-data mt-3 w-full table-fixed border-collapse"
          data-type-role="data"
        >
          <thead>
            <tr>
              <th scope="col" className="break-words p-2 text-start">
                {t.column}
              </th>
              <th scope="col" className="break-words p-2 text-end">
                {t.amount}
              </th>
            </tr>
          </thead>
          <tbody>
            {["125.00", "١٢/٢٤", "JOD 1,250.50"].map((value) => (
              <tr key={value}>
                <td className="break-words border-t border-border-subtle p-2">
                  <bdi lang="en" dir="ltr">
                    BTEC Level 3
                  </bdi>
                </td>
                <td className="break-words border-t border-border-subtle p-2 text-end">
                  <bdi
                    lang={value.includes("١") ? "ar" : "en"}
                    dir={value.includes("١") ? "rtl" : "ltr"}
                  >
                    {value}
                  </bdi>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <form
        className="grid min-w-0 gap-3 border-t border-border-subtle pt-4"
        onSubmit={(event) => event.preventDefault()}
      >
        <label
          htmlFor="type-name"
          className="ui-type-label"
          data-type-role="label"
        >
          {t.name}
        </label>
        <input
          id="type-name"
          className="ui-type-label focus-ring min-h-11 w-full min-w-0 border border-border-interactive! bg-surface-panel p-3"
          defaultValue="RAW User اسم المستخدم"
          aria-invalid="true"
          aria-describedby="type-error"
        />
        <p id="type-error" className="ui-type-label text-danger">
          {t.invalid}
        </p>
        <label htmlFor="type-notes" className="ui-type-label">
          {t.notes}
        </label>
        <textarea
          id="type-notes"
          className="ui-type-body focus-ring min-h-28 w-full min-w-0 border border-border-interactive! bg-surface-panel p-3"
          defaultValue="RAW learner explanation — تعليق الطالب الخام"
        />
        <div className="flex flex-wrap gap-3">
          <Action>{t.action}</Action>
          <Action pending pendingLabel={t.saving}>
            {t.action}
          </Action>
          <Action disabled>{t.disabled}</Action>
        </div>
      </form>
      <section className="grid min-w-0 gap-3 border-t border-border-subtle pt-4">
        {(
          ["loading", "empty", "error", "restricted", "unavailable"] as const
        ).map((kind) => (
          <QueryState
            key={kind}
            kind={kind}
            title={t[kind]}
            description={
              <span dir="auto">RAW server explanation — شرح الخادم الخام</span>
            }
            action={
              kind === "error" ? (
                <Action onClick={() => undefined}>{t.recovery}</Action>
              ) : undefined
            }
          />
        ))}
        <MutationOutcome kind="success">{t.saved}</MutationOutcome>
        <MutationOutcome kind="error">{t.failed}</MutationOutcome>
      </section>
      <p data-legacy-reference>{t.legacy}</p>
    </main>
  );
}
