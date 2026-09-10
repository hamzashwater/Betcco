"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenCheck,
  CalendarClock,
  Clock3,
  GraduationCap,
  Newspaper,
  PackageCheck,
  ShoppingCart,
  UsersRound,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

type BlogSummary = {
  slug: string;
  title: string;
  excerpt: string;
  publishedAtUtc: string;
};
type BlogPost = BlogSummary & { body: string };
type Teacher = {
  id: string;
  displayName: string;
  bio?: string;
  specializations?: string;
  courses: { slug: string; title: string }[];
};
type LearningPackage = {
  id: string;
  slug: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  originalPrice: number;
  discountAmount: number;
  courses: { slug: string; title: string }[];
};
type LiveSession = {
  id: string;
  title: string;
  description?: string;
  provider: string;
  startsAtUtc: string;
  endsAtUtc: string;
  capacity?: number;
  course?: { slug: string; title: string };
};
type CurrentUser = { roles: string[] };
type CheckoutResult = {
  paymentId: string;
  provider: string;
  total: number;
  currency: string;
};

function PublicHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon: typeof Newspaper;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_86%_16%,color-mix(in_srgb,var(--primary)_28%,transparent),transparent_35%),linear-gradient(135deg,color-mix(in_srgb,var(--surface)_94%,transparent),color-mix(in_srgb,var(--surface-solid)_75%,transparent))] p-7 shadow-[var(--shadow)] sm:p-10">
      <span className="grid size-12 place-items-center rounded-2xl bg-primary/15 text-primary">
        <Icon size={23} aria-hidden="true" />
      </span>
      <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-primary">
        {eyebrow}
      </p>
      <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 max-w-2xl leading-7 text-muted">{description}</p>
    </header>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="card mt-7 p-6 text-center text-muted">{text}</p>;
}

export function MembershipDirectory() {
  const locale = useLocale();
  const router = useRouter();
  const [coupon, setCoupon] = useState("");
  const memberships = useQuery({
    queryKey: ["public-memberships", locale],
    queryFn: () =>
      api<
        {
          id: string;
          title: string;
          description: string;
          features: string[];
          price: number;
          currency: string;
          interval: string;
          courses: { title: string }[];
        }[]
      >(`/memberships?locale=${locale}`),
  });
  const subscriptions = useQuery({
    queryKey: ["public-course-subscriptions", locale],
    queryFn: () =>
      api<
        {
          id: string;
          title: string;
          courseTitle: string;
          price: number;
          currency: string;
          interval: string;
        }[]
      >(`/course-subscriptions?locale=${locale}`),
  });
  const user = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api<CurrentUser>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
  const checkout = useMutation({
    mutationFn: ({
      kind,
      id,
    }: {
      kind: "membership" | "subscription";
      id: string;
    }) =>
      api<CheckoutResult>(
        `/${kind === "membership" ? "memberships" : "course-subscriptions"}/${id}/checkout`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            couponCode: coupon || null,
            paymentMethod: "Card",
          }),
        },
      ),
  });
  const confirm = useMutation({
    mutationFn: (payment: CheckoutResult) =>
      api("/payments/fake/confirm", {
        method: "POST",
        body: JSON.stringify({
          paymentId: payment.paymentId,
          providerEventId: `membership_test_${crypto.randomUUID()}`,
        }),
      }),
    onSuccess: () => router.push(`/${locale}/student/courses`),
  });
  const isStudent = user.data?.roles.includes("Student") ?? false;
  const start = (kind: "membership" | "subscription", id: string) => {
    if (!isStudent) {
      router.push(`/${locale}/login`);
      return;
    }
    checkout.mutate({ kind, id });
  };
  const heading =
    locale === "ar"
      ? "عضويات BETCCO والاشتراكات"
      : "BETCCO memberships & subscriptions";
  return (
    <section className="shell py-12">
      <PublicHeader
        icon={UsersRound}
        eyebrow="BETCCO"
        title={heading}
        description={
          locale === "ar"
            ? "اختر وصولًا شهريًا أو ربع سنويًا أو سنويًا. لا يبدأ الوصول إلا بعد تأكيد الدفع من الخادم."
            : "Choose monthly, quarterly, or yearly access. Learning access begins only after server-side payment confirmation."
        }
      />
      <label className="mt-6 grid max-w-sm gap-1 text-sm font-bold text-muted">
        {locale === "ar" ? "كود خصم اختياري" : "Optional coupon code"}
        <input
          value={coupon}
          onChange={(event) => setCoupon(event.target.value)}
          className="rounded-xl border border-border bg-transparent px-3 py-2.5 text-foreground"
        />
      </label>
      <h2 className="mt-8 text-2xl font-black">
        {locale === "ar" ? "العضويات" : "Membership plans"}
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {memberships.data?.map((plan) => (
          <article key={plan.id} className="card flex flex-col p-6">
            <p className="text-xs font-black text-primary">{plan.interval}</p>
            <h3 className="mt-2 text-xl font-black">{plan.title}</h3>
            <p className="mt-3 text-sm leading-6 text-muted">
              {plan.description}
            </p>
            <ul className="mt-4 grid gap-1 text-sm text-muted">
              {plan.features.map((feature) => (
                <li key={feature}>• {feature}</li>
              ))}
            </ul>
            <p className="mt-5 text-xl font-black">
              {plan.price.toFixed(3)} {plan.currency}
            </p>
            <button
              type="button"
              onClick={() => start("membership", plan.id)}
              disabled={checkout.isPending}
              className="focus-ring mt-5 rounded-xl bg-primary px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-50"
            >
              {isStudent
                ? locale === "ar"
                  ? "بدء الدفع"
                  : "Start checkout"
                : locale === "ar"
                  ? "سجّل للدفع"
                  : "Sign in to checkout"}
            </button>
          </article>
        ))}
      </div>
      {!memberships.isPending && !memberships.data?.length ? (
        <EmptyState
          text={
            locale === "ar"
              ? "لا توجد عضويات منشورة الآن."
              : "No memberships are published yet."
          }
        />
      ) : null}
      <h2 className="mt-10 text-2xl font-black">
        {locale === "ar" ? "اشتراكات الدورات" : "Course subscriptions"}
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {subscriptions.data?.map((plan) => (
          <article key={plan.id} className="card p-6">
            <p className="text-xs font-black text-primary">{plan.interval}</p>
            <h3 className="mt-2 text-xl font-black">{plan.title}</h3>
            <p className="mt-2 text-sm text-muted">{plan.courseTitle}</p>
            <p className="mt-5 text-xl font-black">
              {plan.price.toFixed(3)} {plan.currency}
            </p>
            <button
              type="button"
              onClick={() => start("subscription", plan.id)}
              disabled={checkout.isPending}
              className="focus-ring mt-5 rounded-xl border border-primary/50 px-4 py-3 text-sm font-black text-primary disabled:opacity-50"
            >
              {locale === "ar" ? "بدء الدفع" : "Start checkout"}
            </button>
          </article>
        ))}
      </div>
      {checkout.data?.provider.startsWith("Fake") ? (
        <div className="card mt-7 max-w-xl p-5">
          <p className="font-black">
            {checkout.data.total.toFixed(3)} {checkout.data.currency}
          </p>
          <p className="mt-2 text-sm text-muted">
            {locale === "ar"
              ? "اختبار محلي فقط: أتمم الدفع الاختباري لحسابك. الإنتاج يحتاج تأكيدًا من مزود دفع فعلي."
              : "Local test only: complete the test payment for your account. Production needs confirmation from a real payment provider."}
          </p>
          <button
            type="button"
            onClick={() => confirm.mutate(checkout.data!)}
            disabled={confirm.isPending}
            className="focus-ring mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950"
          >
            {locale === "ar"
              ? "إتمام الدفع الاختباري"
              : "Complete test payment"}
          </button>
        </div>
      ) : null}
      {checkout.error || confirm.error ? (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {(checkout.error ?? confirm.error) instanceof Error
            ? (checkout.error ?? (confirm.error as Error)).message
            : "Request failed."}
        </p>
      ) : null}
    </section>
  );
}

function FormatDate({ value }: { value: string }) {
  const locale = useLocale();
  return (
    <time dateTime={value}>
      {new Intl.DateTimeFormat(locale === "ar" ? "ar-JO" : "en", {
        dateStyle: "medium",
      }).format(new Date(value))}
    </time>
  );
}

export function PublicBlog({ slug }: { slug?: string }) {
  const locale = useLocale();
  const t = useTranslations("publicContent.blog");
  const article = useQuery({
    queryKey: ["public-blog-post", slug, locale],
    queryFn: () => api<BlogPost>(`/public/blog/${slug}?locale=${locale}`),
    enabled: Boolean(slug),
  });
  const listing = useQuery({
    queryKey: ["public-blog", locale],
    queryFn: () =>
      api<{ items: BlogSummary[] }>(`/public/blog?locale=${locale}`),
    enabled: !slug,
  });
  if (slug) {
    if (article.isPending) return <section className="shell py-12" aria-busy />;
    if (article.isError || !article.data)
      return (
        <section className="shell py-12">
          <EmptyState text={t("empty")} />
        </section>
      );
    return (
      <article className="shell max-w-4xl py-12">
        <Link
          href={`/${locale}/blog`}
          className="focus-ring inline-flex items-center gap-2 text-sm font-black text-primary"
        >
          <ArrowLeft size={16} className="rtl:rotate-180" aria-hidden="true" />
          {t("back")}
        </Link>
        <p className="mt-8 text-xs font-black uppercase tracking-[0.18em] text-primary">
          {t("label")}
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
          {article.data.title}
        </h1>
        <p className="mt-4 text-sm text-muted">
          {t("published")} <FormatDate value={article.data.publishedAtUtc} />
        </p>
        <p className="mt-7 text-lg leading-8 text-muted">
          {article.data.excerpt}
        </p>
        <div className="card mt-8 whitespace-pre-line p-6 leading-8 text-foreground sm:p-9">
          {article.data.body}
        </div>
      </article>
    );
  }
  return (
    <section className="shell py-12">
      <PublicHeader
        icon={Newspaper}
        eyebrow={t("label")}
        title={t("title")}
        description={t("description")}
      />
      {listing.isPending ? (
        <div
          className="mt-7 h-64 animate-pulse rounded-3xl bg-white/5"
          aria-busy
        />
      ) : null}
      {!listing.isPending && !listing.data?.items.length ? (
        <EmptyState text={t("empty")} />
      ) : null}
      <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {listing.data?.items.map((post) => (
          <article key={post.slug} className="card flex flex-col p-6">
            <p className="text-xs text-muted">
              <FormatDate value={post.publishedAtUtc} />
            </p>
            <h2 className="mt-3 text-xl font-black leading-7">{post.title}</h2>
            <p className="mt-3 flex-1 text-sm leading-6 text-muted">
              {post.excerpt}
            </p>
            <Link
              className="focus-ring mt-5 inline-flex items-center gap-1 self-start text-sm font-black text-primary"
              href={`/${locale}/blog/${post.slug}`}
            >
              {t("readMore")}
              <ArrowLeft
                size={16}
                className="rtl:rotate-180"
                aria-hidden="true"
              />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

export function TeacherDirectory() {
  const locale = useLocale();
  const t = useTranslations("publicContent.teachers");
  const teachers = useQuery({
    queryKey: ["public-teachers", locale],
    queryFn: () => api<Teacher[]>(`/public/teachers?locale=${locale}`),
  });
  return (
    <section className="shell py-12">
      <PublicHeader
        icon={UsersRound}
        eyebrow={t("label")}
        title={t("title")}
        description={t("description")}
      />
      {teachers.isPending ? (
        <div
          className="mt-7 h-64 animate-pulse rounded-3xl bg-white/5"
          aria-busy
        />
      ) : null}
      {!teachers.isPending && !teachers.data?.length ? (
        <EmptyState text={t("empty")} />
      ) : null}
      <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {teachers.data?.map((teacher) => (
          <article key={teacher.id} className="card p-6">
            <span className="grid size-12 place-items-center rounded-2xl bg-secondary/15 text-secondary">
              <GraduationCap size={23} aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-xl font-black">{teacher.displayName}</h2>
            {teacher.specializations ? (
              <p className="mt-2 text-sm font-bold text-primary">
                {teacher.specializations}
              </p>
            ) : null}
            {teacher.bio ? (
              <p className="mt-3 text-sm leading-6 text-muted">{teacher.bio}</p>
            ) : null}
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-xs font-black uppercase tracking-wide text-muted">
                {t("courses")}
              </p>
              <div className="mt-3 grid gap-2">
                {teacher.courses.map((course) => (
                  <Link
                    key={course.slug}
                    href={`/${locale}/courses/${course.slug}`}
                    className="focus-ring text-sm font-bold text-primary hover:underline"
                  >
                    {course.title}
                  </Link>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PackageDirectory() {
  const locale = useLocale();
  const router = useRouter();
  const client = useQueryClient();
  const t = useTranslations("publicContent.packages");
  const [notice, setNotice] = useState<string>();
  const packages = useQuery({
    queryKey: ["public-packages", locale],
    queryFn: () => api<LearningPackage[]>(`/public/packages?locale=${locale}`),
  });
  const user = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api<CurrentUser>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
  const add = useMutation({
    mutationFn: (slug: string) =>
      api(`/cart/packages/${slug}?locale=${locale}`, { method: "POST" }),
    onSuccess: () => {
      setNotice(t("added"));
      client.invalidateQueries({ queryKey: ["cart"] });
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : t("studentOnly")),
  });
  function addToCart(packageItem: LearningPackage) {
    if (!user.data) return router.push(`/${locale}/login`);
    if (!user.data.roles.includes("Student"))
      return setNotice(t("studentOnly"));
    add.mutate(packageItem.id);
  }
  return (
    <section className="shell py-12">
      <PublicHeader
        icon={PackageCheck}
        eyebrow={t("label")}
        title={t("title")}
        description={t("description")}
      />
      {packages.isPending ? (
        <div
          className="mt-7 h-64 animate-pulse rounded-3xl bg-white/5"
          aria-busy
        />
      ) : null}
      {!packages.isPending && !packages.data?.length ? (
        <div className="card mt-7 p-6 text-center">
          <p className="text-muted">{t("empty")}</p>
          <Link
            href={`/${locale}/courses`}
            className="focus-ring mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950"
          >
            <BookOpenCheck size={17} aria-hidden="true" />
            {locale === "ar"
              ? "استكشف الدورات المتاحة"
              : "Browse available courses"}
          </Link>
        </div>
      ) : null}
      <div className="mt-7 grid gap-4 lg:grid-cols-3">
        {packages.data?.map((packageItem) => (
          <article key={packageItem.slug} className="card flex flex-col p-6">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary">
              <PackageCheck size={21} aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-2xl font-black">{packageItem.title}</h2>
            <p className="mt-3 flex-1 text-sm leading-6 text-muted">
              {packageItem.description}
            </p>
            <p className="mt-5 text-sm font-black text-muted">{t("courses")}</p>
            <ul className="mt-3 grid gap-2 text-sm">
              {packageItem.courses.map((course) => (
                <li key={course.slug} className="flex gap-2">
                  <BookOpenCheck
                    size={16}
                    className="mt-0.5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  {course.title}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-5">
              <div className="grid gap-0.5">
                {packageItem.discountAmount > 0 ? (
                  <span className="text-xs text-muted line-through">
                    {packageItem.originalPrice.toFixed(3)}{" "}
                    {packageItem.currency}
                  </span>
                ) : null}
                <strong>
                  {packageItem.price.toFixed(3)} {packageItem.currency}
                </strong>
                {packageItem.discountAmount > 0 ? (
                  <span className="text-xs font-bold text-primary">
                    {t("saving", {
                      amount: packageItem.discountAmount.toFixed(3),
                      currency: packageItem.currency,
                    })}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => addToCart(packageItem)}
                disabled={add.isPending || user.isPending}
                className="focus-ring inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-black text-slate-950 disabled:opacity-60"
              >
                <ShoppingCart size={16} aria-hidden="true" />
                {user.data ? t("add") : t("login")}
              </button>
            </div>
          </article>
        ))}
      </div>
      {notice ? (
        <p role="status" className="mt-5 text-sm text-primary">
          {notice}{" "}
          {add.isSuccess ? (
            <Link
              href={`/${locale}/cart`}
              className="focus-ring font-black underline"
            >
              {t("viewCart")}
            </Link>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}

export function LiveSessionDirectory() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("publicContent.live");
  const [notice, setNotice] = useState<string>();
  const sessions = useQuery({
    queryKey: ["public-live-sessions", locale],
    queryFn: () => api<LiveSession[]>(`/public/live-sessions?locale=${locale}`),
  });
  const user = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api<CurrentUser>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
  const join = useMutation({
    mutationFn: (id: string) =>
      api<{ joinUrl: string }>(`/public/live-sessions/${id}/join`),
    onSuccess: ({ joinUrl }) =>
      window.open(joinUrl, "_blank", "noopener,noreferrer"),
    onError: () => setNotice(t("unavailable")),
  });
  function requestJoin(session: LiveSession) {
    if (!user.data) return router.push(`/${locale}/login`);
    if (!user.data.roles.includes("Student"))
      return setNotice(t("studentOnly"));
    join.mutate(session.id);
  }
  return (
    <section className="shell py-12">
      <PublicHeader
        icon={Video}
        eyebrow={t("label")}
        title={t("title")}
        description={t("description")}
      />
      {sessions.isPending ? (
        <div
          className="mt-7 h-64 animate-pulse rounded-3xl bg-white/5"
          aria-busy
        />
      ) : null}
      {!sessions.isPending && !sessions.data?.length ? (
        <EmptyState text={t("empty")} />
      ) : null}
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        {sessions.data?.map((session) => (
          <article key={session.id} className="card p-6">
            <div className="flex items-start justify-between gap-4">
              <span className="grid size-11 place-items-center rounded-2xl bg-secondary/15 text-secondary">
                <CalendarClock size={21} aria-hidden="true" />
              </span>
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-muted">
                {session.provider}
              </span>
            </div>
            <h2 className="mt-5 text-2xl font-black">{session.title}</h2>
            {session.description ? (
              <p className="mt-3 text-sm leading-6 text-muted">
                {session.description}
              </p>
            ) : null}
            {session.course ? (
              <Link
                href={`/${locale}/courses/${session.course.slug}`}
                className="focus-ring mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary"
              >
                <BookOpenCheck size={16} aria-hidden="true" />
                {t("course")}: {session.course.title}
              </Link>
            ) : null}
            <div className="mt-5 grid gap-2 border-y border-border py-4 text-sm text-muted">
              <p className="flex items-center gap-2">
                <Clock3 size={16} aria-hidden="true" />
                {t("starts")}: <FormatDate value={session.startsAtUtc} />
              </p>
              <p>
                {t("ends")}: <FormatDate value={session.endsAtUtc} />
              </p>
            </div>
            <button
              type="button"
              onClick={() => requestJoin(session)}
              disabled={join.isPending || user.isPending}
              className="focus-ring mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 font-black text-slate-950 disabled:opacity-60"
            >
              <Video size={17} aria-hidden="true" />
              {user.data ? t("join") : t("login")}
            </button>
          </article>
        ))}
      </div>
      {notice ? (
        <p role="status" className="mt-5 text-sm text-amber-400">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
