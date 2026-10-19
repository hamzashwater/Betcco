import { Action, actionClassName } from "@/components/ui/action";
import { MutationOutcome, QueryState } from "@/components/ui/query-state";
import { ArrowUpRight } from "lucide-react";

// Fixed synthetic copy for isolated evidence. No production route imports this.
const copy = {
  en: {
    title: "Actions and factual local states",
    action: "Continue the current task · BTEC Level 3",
    pending: "Saving the current explanation…",
    remove: "Remove draft evidence · BTEC Level 3",
    removing: "Removing draft evidence…",
    disabled: "Currently unavailable",
    primary: "Primary",
    secondary: "Secondary",
    quiet: "Quiet",
    danger: "Danger",
    loading: "Loading the current request",
    empty: "No items in the successful response",
    error: "The current request failed",
    unavailable: "The current information is unavailable",
    restricted: "This account cannot access this item",
    recovery: "Retry the current request",
    success: "The explanation was saved",
    failed: "The explanation could not be saved",
    link: "Open the existing destination",
  },
  ar: {
    title: "الإجراءات والحالات المحليّة الواضحة",
    action: "متابعة المهمّة الحالية · BTEC Level 3",
    pending: "جارٍ حفظ الشرح الحالي…",
    remove: "إزالة مسودة الدليل · BTEC Level 3",
    removing: "جارٍ إزالة مسودة الدليل…",
    disabled: "غير متاح حاليًا",
    primary: "رئيسي",
    secondary: "مساند",
    quiet: "هادئ",
    danger: "إجراء خطِر",
    loading: "جارٍ تحميل الطلب الحالي",
    empty: "لا توجد عناصر في الاستجابة الناجحة",
    error: "تعذّر إكمال الطلب الحالي",
    unavailable: "المعلومات الحالية غير متاحة",
    restricted: "هذا الحساب لا يمكنه الوصول إلى العنصر",
    recovery: "إعادة محاولة الطلب الحالي",
    success: "تمّ حفظ الشرح",
    failed: "تعذّر حفظ الشرح",
    link: "فتح الوجهة الموجودة",
  },
};

export function InteractionStateSpecimen({ locale }: { locale: "en" | "ar" }) {
  const t = copy[locale];
  return (
    <main
      className="shell grid min-w-0 gap-6 py-6 text-text-primary"
      data-primitive-root
    >
      <h1 className="ui-type-page">{t.title}</h1>
      <section className="grid min-w-0 gap-5" aria-label={t.title}>
        {(["primary", "secondary", "quiet", "danger"] as const).map(
          (variant) => (
            <section
              key={variant}
              className="min-w-0 border-t border-border-subtle pt-4"
            >
              <h2 className="ui-type-section">{t[variant]}</h2>
              <div className="mt-3 flex min-w-0 flex-wrap items-start gap-3">
                <Action
                  variant={variant}
                  data-variant={variant}
                  data-action-state="default"
                >
                  <ArrowUpRight
                    size={20}
                    strokeWidth={2}
                    aria-hidden="true"
                    className="shrink-0 rtl:-scale-x-100"
                  />
                  {variant === "danger" ? t.remove : t.action}
                </Action>
                <Action
                  variant={variant}
                  disabled
                  data-variant={variant}
                  data-action-state="disabled"
                >
                  {t.disabled}
                </Action>
                <Action
                  variant={variant}
                  pending
                  pendingLabel={variant === "danger" ? t.removing : t.pending}
                  data-variant={variant}
                  data-action-state="pending"
                >
                  {variant === "danger" ? t.remove : t.action}
                </Action>
              </div>
            </section>
          ),
        )}
        <a
          href="#fixture-destination"
          className={actionClassName("quiet")}
          data-native-link
        >
          {t.link}
        </a>
      </section>
      <section className="grid min-w-0 gap-3 border-t border-border-subtle pt-4">
        {(
          ["loading", "empty", "error", "unavailable", "restricted"] as const
        ).map((kind) => (
          <section key={kind} data-query-kind={kind}>
            <QueryState
              kind={kind}
              title={t[kind]}
              description={
                <bdi dir="auto">
                  RAW server explanation — شرح الخادم — BTEC Level 3 · ١٢/٢٤
                </bdi>
              }
              action={
                kind === "error" ? (
                  <Action variant="secondary">{t.recovery}</Action>
                ) : undefined
              }
            />
          </section>
        ))}
        <section data-outcome-kind="success">
          <MutationOutcome kind="success">{t.success}</MutationOutcome>
        </section>
        <section data-outcome-kind="error">
          <MutationOutcome kind="error">{t.failed}</MutationOutcome>
        </section>
      </section>
      <p id="fixture-destination" className="ui-type-meta">
        RAW identifier: BTEC-A.P1 / ١٢/٢٤
      </p>
    </main>
  );
}
