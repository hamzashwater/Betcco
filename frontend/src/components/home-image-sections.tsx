"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useLocale } from "next-intl";

type LocalizedText = { ar: string; en: string };

type PlatformVisual = {
  image: string;
  title: LocalizedText;
  description: LocalizedText;
};

const platformVisuals: PlatformVisual[] = [
  {
    image: "/images/betcco/pack/platform/it-specialization.webp",
    title: { ar: "تخصصات رقمية واضحة", en: "Clear digital specializations" },
    description: {
      ar: "اختر المسار والتخصص الذي يطابق دراستك وطموحك.",
      en: "Choose the track and specialization that match your studies and goals.",
    },
  },
  {
    image: "/images/betcco/pack/platform/online-courses.webp",
    title: { ar: "دورات منظمة", en: "Structured courses" },
    description: {
      ar: "تعلم من محتوى مرتب يبدأ بالدرس وينتهي بالتطبيق.",
      en: "Learn from structured content that moves from lessons to application.",
    },
  },
  {
    image: "/images/betcco/pack/platform/expert-teacher.webp",
    title: { ar: "معلمون متخصصون", en: "Specialist teachers" },
    description: {
      ar: "تواصل تعليمي واضح ومتابعة مرتبطة بدوراتك.",
      en: "Clear learning communication and follow-up connected to your courses.",
    },
  },
  {
    image: "/images/betcco/pack/platform/btec-projects.webp",
    title: { ar: "مشاريع BTEC", en: "BTEC projects" },
    description: {
      ar: "حوّل المعرفة إلى مهام عملية مرتبطة بالمعايير.",
      en: "Turn knowledge into practical assignments linked to criteria.",
    },
  },
  {
    image: "/images/betcco/pack/platform/assessment-feedback.webp",
    title: { ar: "تغذية راجعة مفيدة", en: "Useful feedback" },
    description: {
      ar: "افهم ما حققته وما تحتاج إلى تطويره في كل مهمة.",
      en: "See what you achieved and what to improve in every assignment.",
    },
  },
  {
    image: "/images/betcco/pack/platform/student-progress.webp",
    title: { ar: "تقدم مرئي", en: "Visible progress" },
    description: {
      ar: "تابع دروسك وإنجازاتك من مكان واحد.",
      en: "Track your lessons and achievements in one place.",
    },
  },
  {
    image: "/images/betcco/pack/platform/certificate-success.webp",
    title: { ar: "إنجازات موثقة", en: "Documented achievements" },
    description: {
      ar: "احتفظ بسجل واضح لتعلمك وشهادات إكمالك.",
      en: "Keep a clear record of your learning and completion certificates.",
    },
  },
  {
    image: "/images/betcco/pack/platform/about-betcco.webp",
    title: { ar: "BETCCO في مكان واحد", en: "BETCCO in one place" },
    description: {
      ar: "دروس ومهام ومعايير وتقييم في تجربة تعليمية واحدة.",
      en: "Lessons, assignments, criteria, and evaluation in one learning experience.",
    },
  },
];

const roleVisuals = [
  {
    image: "/images/betcco/pack/dashboards/student-dashboard.webp",
    title: { ar: "للطالب", en: "For students" },
    description: {
      ar: "تعلم، تقدّم، وقدّم مهامك بثقة.",
      en: "Learn, progress, and submit assignments with confidence.",
    },
  },
  {
    image: "/images/betcco/pack/dashboards/teacher-dashboard.webp",
    title: { ar: "للمعلم", en: "For teachers" },
    description: {
      ar: "أنشئ محتوى منظّمًا وتابع طلابك وتقييماتهم.",
      en: "Create structured content and follow your students and evaluations.",
    },
  },
  {
    image: "/images/betcco/pack/dashboards/admin-dashboard.webp",
    title: { ar: "للإدارة", en: "For administrators" },
    description: {
      ar: "إدارة المنصة والدورات والمستخدمين من لوحة واحدة.",
      en: "Manage the platform, courses, and users from one dashboard.",
    },
  },
] as const;

export function HomeImageSections() {
  const locale = useLocale();
  const isArabic = locale === "ar";
  const text = (value: LocalizedText) => value[isArabic ? "ar" : "en"];

  return (
    <>
      <section className="shell py-14 md:py-20">
        <div className="max-w-3xl">
          <p className="text-sm font-bold text-primary">
            {isArabic ? "تجربة BETCCO" : "The BETCCO experience"}
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            {isArabic
              ? "كل ما تحتاجه لتتعلم وتطبّق وتحقق المعايير"
              : "Everything you need to learn, apply, and achieve"}
          </h2>
          <p className="mt-3 leading-7 text-muted">
            {isArabic
              ? "من اختيار التخصص إلى التقييم والمتابعة، صُممت الأدوات لتخدم رحلة الطالب التعليمية كاملة."
              : "From choosing a specialization to assessment and follow-up, every tool supports the complete learner journey."}
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {platformVisuals.map((visual) => (
            <article
              key={visual.image}
              className="card group relative min-h-72 overflow-hidden p-5"
            >
              <Image
                src={visual.image}
                alt={text(visual.title)}
                fill
                sizes="(max-width: 640px) calc(100vw - 2rem), (max-width: 1280px) calc(50vw - 2rem), 25vw"
                className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,10,25,.08),rgba(5,10,25,.9))]" />
              <div className="relative flex min-h-60 flex-col justify-end">
                <h3 className="text-lg font-black text-white">
                  {text(visual.title)}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  {text(visual.description)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="shell py-14 md:py-20">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-sm font-bold text-primary">
              {isArabic ? "مساحة مناسبة لكل دور" : "A space for every role"}
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              {isArabic
                ? "منصة واحدة، وتجربة مخصصة لكل مستخدم"
                : "One platform, tailored to every user"}
            </h2>
          </div>
          <Link
            href={`/${locale}/register`}
            className="focus-ring inline-flex items-center gap-2 text-sm font-bold text-primary"
          >
            {isArabic ? "ابدأ كطالب" : "Start as a student"}
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {roleVisuals.map((visual) => (
            <article key={visual.image} className="card overflow-hidden">
              <div className="relative aspect-[16/9] overflow-hidden border-b border-border">
                <Image
                  src={visual.image}
                  alt={text(visual.title)}
                  fill
                  sizes="(max-width: 1024px) calc(100vw - 2rem), 33vw"
                  className="object-cover"
                />
              </div>
              <div className="p-5">
                <h3 className="font-black text-foreground">
                  {text(visual.title)}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {text(visual.description)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="shell pb-20 pt-8 md:pb-28">
        <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-[var(--surface-solid)] px-6 py-10 shadow-[var(--shadow)] sm:px-10 md:py-14">
          <Image
            src="/images/betcco/pack/cta/join-betcco-cta.webp"
            alt=""
            fill
            sizes="(max-width: 1180px) calc(100vw - 2rem), 1180px"
            className="object-cover opacity-45"
          />
          <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(5,10,25,.94),rgba(5,10,25,.52))]" />
          <Image
            src="/images/betcco/pack/transparent-elements/digital-book.png"
            alt=""
            width={300}
            height={300}
            className="absolute -bottom-24 -end-12 hidden size-72 object-contain opacity-80 lg:block"
          />
          <div className="relative max-w-2xl">
            <p className="text-sm font-black text-secondary">BETCCO</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl">
              {isArabic
                ? "ابدأ رحلتك التعليمية بطريقة أكثر وضوحًا"
                : "Start your learning journey with more clarity"}
            </h2>
            <p className="mt-4 max-w-xl leading-7 text-slate-200">
              {isArabic
                ? "استكشف الدورات أو أنشئ حساب طالب لتتابع التعلم والمهام والتقييم من مكان واحد."
                : "Explore courses or create a student account to manage learning, assignments, and assessment in one place."}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={`/${locale}/courses`}
                className="premium-button focus-ring inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-white"
              >
                {isArabic ? "تصفح الدورات" : "Browse courses"}
                <ArrowLeft size={18} className="rtl:rotate-180" />
              </Link>
              <Link
                href={`/${locale}/register`}
                className="focus-ring rounded-xl border border-white/35 bg-white/10 px-5 py-3 font-bold text-white hover:bg-white/15"
              >
                {isArabic ? "إنشاء حساب" : "Create an account"}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
