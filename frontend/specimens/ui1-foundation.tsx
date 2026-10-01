import { BrandLogo } from "@/components/brand-logo";
import { resolveBrandIdentity, type BrandLocale } from "@/lib/brand";

/* Isolated test fixture, deliberately not imported by a production route.
   These bilingual labels and synthetic assets are specimen data only.
   Render in separate documents with root data-theme=light/dark. */
const wordmark = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="80" viewBox="0 0 480 80"><rect width="480" height="80" rx="8" fill="#1b4f72"/><circle cx="40" cy="40" r="20" fill="#21c1a6"/><path d="M88 28h352M88 52h264" stroke="#f5f6f8" stroke-width="8"/></svg>',
)}`;
const mark = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="160" viewBox="0 0 80 160"><rect width="80" height="160" rx="12" fill="#1b4f72"/><circle cx="40" cy="50" r="24" fill="#21c1a6"/><path d="M20 110h40M20 130h40" stroke="#f5f6f8" stroke-width="8"/></svg>',
)}`;

export const ui1ReplacementSettings = {
  BrandName: "Northstar Learning and Assessment Studio",
  Logo: wordmark,
  LogoWidth: "480",
  LogoHeight: "80",
  BrandMark: mark,
  BrandMarkWidth: "80",
  BrandMarkHeight: "160",
};

const labels = {
  en: {
    heading: "Foundation specimen",
    body: "Learning content, practice and evaluation retain their own meaning.",
    content: "Content surface",
    raised: "Raised surface",
    overlay: "Overlay surface",
    muted: "Muted surface",
    interactive: "Interactive surface",
    primary: "Continue",
    secondary: "View details",
    danger: "Remove",
    disabled: "Unavailable",
    pending: "Saving…",
    success: "Success — saved",
    warning: "Warning — attention needed",
    error: "Error — retry required",
    info: "Information — review details",
    brands: "Replaceable identity samples",
    help: "Supporting information",
    link: "Keyboard focus sample",
  },
  ar: {
    heading: "عينة أساس الواجهة",
    body: "يحتفظ محتوى التعلم والتدريب والتقييم بمعنى مستقل لكل منها.",
    content: "سطح المحتوى",
    raised: "سطح مرتفع",
    overlay: "سطح النوافذ",
    muted: "سطح ثانوي",
    interactive: "سطح تفاعلي",
    primary: "متابعة التعلم",
    secondary: "عرض التفاصيل",
    danger: "إزالة",
    disabled: "غير متاح",
    pending: "جارٍ الحفظ…",
    success: "نجاح — تم الحفظ",
    warning: "تنبيه — يحتاج إلى انتباه",
    error: "خطأ — أعد المحاولة",
    info: "معلومة — راجع التفاصيل",
    brands: "عينات الهوية القابلة للاستبدال",
    help: "معلومات مساندة",
    link: "عينة التركيز بلوحة المفاتيح",
  },
};

export function Ui1FoundationSpecimen({ locale }: { locale: BrandLocale }) {
  const t = labels[locale];
  const current = resolveBrandIdentity(locale);
  const replacement = resolveBrandIdentity(locale, ui1ReplacementSettings);
  const actionClass = "focus-ring rounded-control px-4 py-3 font-semibold";

  return (
    <main
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="ui-type-body mx-auto grid max-w-4xl gap-6 bg-page p-6 text-text-primary"
    >
      <header>
        <h1 className="ui-type-page">{t.heading}</h1>
        <p className="mt-2 text-text-secondary">{t.body}</p>
        <p className="ui-type-meta mt-2 text-text-muted">{t.help}</p>
      </header>
      <section className="grid gap-3 rounded-region border border-border-default bg-surface-content p-4">
        <h2 className="ui-type-section">{t.content}</h2>
        <div className="rounded-region border border-border-subtle bg-surface-raised p-3 shadow-raised">
          {t.raised}
        </div>
        <div className="rounded-region border border-border-strong bg-surface-overlay p-3 shadow-overlay">
          {t.overlay}
        </div>
        <div className="rounded-region bg-surface-muted p-3 text-text-secondary">
          {t.muted}
        </div>
        <div className="rounded-region bg-surface-interactive p-3">
          {t.interactive}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={`${actionClass} bg-action-primary text-action-primary-text`}
          >
            {t.primary}
          </button>
          <button
            type="button"
            className={`${actionClass} border border-border-strong bg-action-secondary text-action-secondary-text`}
          >
            {t.secondary}
          </button>
          <button
            type="button"
            className={`${actionClass} bg-action-danger text-action-danger-text`}
          >
            {t.danger}
          </button>
          <button
            type="button"
            disabled
            className={`${actionClass} cursor-not-allowed bg-action-disabled text-action-disabled-text`}
          >
            {t.disabled}
          </button>
          <button
            type="button"
            disabled
            aria-busy="true"
            className={`${actionClass} cursor-wait bg-action-pending text-action-pending-text`}
          >
            {t.pending}
          </button>
        </div>
        <a
          href="#identity"
          className="focus-ring rounded-control text-text-link underline"
        >
          {t.link}
        </a>
      </section>
      <section aria-label={t.help} className="grid gap-3">
        <p className="rounded-control bg-success-surface p-3 text-success">
          <span aria-hidden="true">✓ </span>
          {t.success}
        </p>
        <p className="rounded-control bg-warning-surface p-3 text-warning">
          <span aria-hidden="true">! </span>
          {t.warning}
        </p>
        <p className="rounded-control bg-danger-surface p-3 text-danger">
          <span aria-hidden="true">× </span>
          {t.error}
        </p>
        <p className="rounded-control bg-info-surface p-3 text-info">
          <span aria-hidden="true">i </span>
          {t.info}
        </p>
      </section>
      <section
        id="identity"
        className="grid min-w-0 gap-4 rounded-region border border-border-default bg-surface-content p-4"
      >
        <h2 className="ui-type-section">{t.brands}</h2>
        <div className="w-48 max-w-full">
          <BrandLogo
            identity={current}
            className="w-full brand-logo-on-light"
          />
          <BrandLogo
            identity={current}
            variant="dark"
            className="w-full brand-logo-on-dark"
          />
        </div>
        <p>{current.name}</p>
        <div className="w-64 max-w-full">
          <BrandLogo
            identity={replacement}
            maxBlockSize="4rem"
            className="w-full"
          />
        </div>
        <p className="break-words" lang="en" dir="ltr">
          {replacement.name}
        </p>
        <BrandLogo identity={replacement} variant="icon" maxBlockSize="4rem" />
        <BrandLogo identity={replacement} src="" />
      </section>
    </main>
  );
}
