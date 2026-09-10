"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgePercent, CalendarClock, Crown, Pencil, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type CourseOption = {
  id: string;
  arabicTitle: string;
  englishTitle: string;
  price: number;
  currency: string;
};
type MembershipPlan = {
  id: string;
  slug: string;
  arabicTitle: string;
  englishTitle: string;
  arabicDescription: string;
  englishDescription: string;
  arabicFeaturesJson?: string;
  englishFeaturesJson?: string;
  price: number;
  interval: string;
  isPublished: boolean;
  courseIds: string[];
};
type SubscriptionPlan = {
  id: string;
  courseId: string;
  arabicTitle: string;
  englishTitle: string;
  price: number;
  interval: string;
  isPublished: boolean;
};
type Coupon = {
  id: string;
  code: string;
  percentageOff: number;
  fixedAmountOff?: number;
  startsAtUtc?: string;
  endsAtUtc?: string;
  maxRedemptions?: number;
  maxRedemptionsPerUser?: number;
  minimumPurchaseAmount?: number;
  redemptionCount: number;
  isActive: boolean;
  courseIds: string[];
};
type MembershipForm = Omit<
  MembershipPlan,
  "id" | "price" | "arabicFeaturesJson" | "englishFeaturesJson"
> & {
  id?: string;
  price: string;
  arabicFeatures: string;
  englishFeatures: string;
};
type SubscriptionForm = Omit<SubscriptionPlan, "id" | "price"> & {
  id?: string;
  price: string;
};
type CouponForm = Omit<
  Coupon,
  | "id"
  | "percentageOff"
  | "fixedAmountOff"
  | "startsAtUtc"
  | "endsAtUtc"
  | "maxRedemptions"
  | "maxRedemptionsPerUser"
  | "minimumPurchaseAmount"
  | "redemptionCount"
> & {
  id?: string;
  percentageOff: string;
  fixedAmountOff: string;
  startsAtUtc: string;
  endsAtUtc: string;
  maxRedemptions: string;
  maxRedemptionsPerUser: string;
  minimumPurchaseAmount: string;
};

const inputClass =
  "focus-ring w-full rounded-xl border border-border bg-transparent px-3 py-2.5 text-sm text-foreground";
const emptyMembership = (): MembershipForm => ({
  slug: "",
  arabicTitle: "",
  englishTitle: "",
  arabicDescription: "",
  englishDescription: "",
  arabicFeatures: "",
  englishFeatures: "",
  price: "",
  interval: "Monthly",
  isPublished: false,
  courseIds: [],
});
const emptySubscription = (): SubscriptionForm => ({
  courseId: "",
  arabicTitle: "",
  englishTitle: "",
  price: "",
  interval: "Monthly",
  isPublished: false,
});
const emptyCoupon = (): CouponForm => ({
  code: "",
  percentageOff: "",
  fixedAmountOff: "",
  startsAtUtc: "",
  endsAtUtc: "",
  maxRedemptions: "",
  maxRedemptionsPerUser: "",
  minimumPurchaseAmount: "",
  isActive: true,
  courseIds: [],
});

function toLocalInput(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const offset = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}
function parseFeatures(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}
function optionalNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

export function CommerceCatalogManager() {
  const locale = useLocale();
  const t = useTranslations("commerceCatalog");
  const client = useQueryClient();
  const [notice, setNotice] = useState<string>();
  const [membership, setMembership] = useState<MembershipForm>(emptyMembership);
  const [subscription, setSubscription] =
    useState<SubscriptionForm>(emptySubscription);
  const [coupon, setCoupon] = useState<CouponForm>(emptyCoupon);
  const courses = useQuery({
    queryKey: ["commerce-catalog-courses"],
    queryFn: () => api<CourseOption[]>("/admin/content/courses"),
  });
  const memberships = useQuery({
    queryKey: ["commerce-catalog-memberships"],
    queryFn: () => api<MembershipPlan[]>("/admin/commerce-catalog/memberships"),
  });
  const subscriptions = useQuery({
    queryKey: ["commerce-catalog-subscriptions"],
    queryFn: () =>
      api<SubscriptionPlan[]>("/admin/commerce-catalog/course-subscriptions"),
  });
  const coupons = useQuery({
    queryKey: ["commerce-catalog-coupons"],
    queryFn: () => api<Coupon[]>("/admin/commerce-catalog/coupons"),
  });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ["commerce-catalog-memberships"] });
    client.invalidateQueries({ queryKey: ["commerce-catalog-subscriptions"] });
    client.invalidateQueries({ queryKey: ["commerce-catalog-coupons"] });
    client.invalidateQueries({ queryKey: ["public-memberships"] });
    client.invalidateQueries({ queryKey: ["public-course-subscriptions"] });
  };
  const failure = (error: unknown) =>
    setNotice(error instanceof Error ? error.message : t("requestFailed"));
  const saveMembership = useMutation({
    mutationFn: () => {
      const payload = {
        slug: membership.slug,
        arabicTitle: membership.arabicTitle,
        englishTitle: membership.englishTitle,
        arabicDescription: membership.arabicDescription,
        englishDescription: membership.englishDescription,
        arabicFeatures: parseFeatures(membership.arabicFeatures),
        englishFeatures: parseFeatures(membership.englishFeatures),
        price: Number(membership.price),
        interval: membership.interval,
        isPublished: membership.isPublished,
        courseIds: membership.courseIds,
      };
      return api(
        membership.id
          ? `/admin/commerce-catalog/memberships/${membership.id}`
          : "/admin/commerce-catalog/memberships",
        {
          method: membership.id ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      );
    },
    onSuccess: () => {
      setMembership(emptyMembership());
      setNotice(t("saved"));
      refresh();
    },
    onError: failure,
  });
  const saveSubscription = useMutation({
    mutationFn: () =>
      api(
        subscription.id
          ? `/admin/commerce-catalog/course-subscriptions/${subscription.id}`
          : "/admin/commerce-catalog/course-subscriptions",
        {
          method: subscription.id ? "PUT" : "POST",
          body: JSON.stringify({
            courseId: subscription.courseId,
            arabicTitle: subscription.arabicTitle,
            englishTitle: subscription.englishTitle,
            price: Number(subscription.price),
            interval: subscription.interval,
            isPublished: subscription.isPublished,
          }),
        },
      ),
    onSuccess: () => {
      setSubscription(emptySubscription());
      setNotice(t("saved"));
      refresh();
    },
    onError: failure,
  });
  const saveCoupon = useMutation({
    mutationFn: () =>
      api(
        coupon.id
          ? `/admin/commerce-catalog/coupons/${coupon.id}`
          : "/admin/commerce-catalog/coupons",
        {
          method: coupon.id ? "PUT" : "POST",
          body: JSON.stringify({
            code: coupon.code,
            percentageOff: optionalNumber(coupon.percentageOff) ?? 0,
            fixedAmountOff: optionalNumber(coupon.fixedAmountOff),
            startsAtUtc: coupon.startsAtUtc
              ? new Date(coupon.startsAtUtc).toISOString()
              : null,
            endsAtUtc: coupon.endsAtUtc
              ? new Date(coupon.endsAtUtc).toISOString()
              : null,
            maxRedemptions: optionalNumber(coupon.maxRedemptions),
            maxRedemptionsPerUser: optionalNumber(coupon.maxRedemptionsPerUser),
            minimumPurchaseAmount: optionalNumber(coupon.minimumPurchaseAmount),
            isActive: coupon.isActive,
            courseIds: coupon.courseIds,
          }),
        },
      ),
    onSuccess: () => {
      setCoupon(emptyCoupon());
      setNotice(t("saved"));
      refresh();
    },
    onError: failure,
  });
  const courseName = (course: CourseOption) =>
    locale === "ar" ? course.arabicTitle : course.englishTitle;
  return (
    <section className="shell py-10">
      <header className="relative overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_85%_15%,color-mix(in_srgb,var(--primary)_24%,transparent),transparent_38%),linear-gradient(125deg,color-mix(in_srgb,var(--surface)_92%,transparent),color-mix(in_srgb,var(--surface-solid)_72%,transparent))] p-6 shadow-[var(--shadow)] sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
          {t("eyebrow")}
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
          {t("description")}
        </p>
      </header>
      {notice ? (
        <p
          role="status"
          className="mt-5 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-primary"
        >
          {notice}
        </p>
      ) : null}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <form
          className="card grid gap-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            saveMembership.mutate();
          }}
        >
          <Heading icon={Crown} title={t("membership")} />
          <ExistingSelect
            label={t("editExisting")}
            value={membership.id ?? ""}
            onChange={(id) => {
              const value = memberships.data?.find((item) => item.id === id);
              setMembership(
                value
                  ? {
                      ...value,
                      price: String(value.price),
                      arabicFeatures: JSON.parse(
                        value.arabicFeaturesJson ?? "[]",
                      ).join("\n"),
                      englishFeatures: JSON.parse(
                        value.englishFeaturesJson ?? "[]",
                      ).join("\n"),
                    }
                  : emptyMembership(),
              );
            }}
            options={(memberships.data ?? []).map((item) => ({
              value: item.id,
              label: `${locale === "ar" ? item.arabicTitle : item.englishTitle} · ${item.price.toFixed(3)} JOD`,
            }))}
            placeholder={t("newMembership")}
          />
          <Field label={t("slug")}>
            <input
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={membership.slug}
              onChange={(event) =>
                setMembership({ ...membership, slug: event.target.value })
              }
              className={inputClass}
              dir="ltr"
            />
          </Field>
          <BilingualFields value={membership} onChange={setMembership} t={t} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("arabicFeatures")}>
              <textarea
                value={membership.arabicFeatures}
                onChange={(event) =>
                  setMembership({
                    ...membership,
                    arabicFeatures: event.target.value,
                  })
                }
                className={`${inputClass} min-h-28`}
              />
            </Field>
            <Field label={t("englishFeatures")}>
              <textarea
                value={membership.englishFeatures}
                onChange={(event) =>
                  setMembership({
                    ...membership,
                    englishFeatures: event.target.value,
                  })
                }
                className={`${inputClass} min-h-28`}
                dir="ltr"
              />
            </Field>
          </div>
          <PlanSettings
            price={membership.price}
            interval={membership.interval}
            published={membership.isPublished}
            onPrice={(price) => setMembership({ ...membership, price })}
            onInterval={(interval) =>
              setMembership({ ...membership, interval })
            }
            onPublished={(isPublished) =>
              setMembership({ ...membership, isPublished })
            }
            t={t}
          />
          <CourseChooser
            label={t("includedCourses")}
            courses={courses.data ?? []}
            selected={membership.courseIds}
            onChange={(courseIds) =>
              setMembership({ ...membership, courseIds })
            }
            name={courseName}
          />
          <SaveButton
            busy={saveMembership.isPending}
            label={membership.id ? t("update") : t("create")}
            busyLabel={t("saving")}
          />
        </form>

        <form
          className="card grid gap-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            saveSubscription.mutate();
          }}
        >
          <Heading icon={CalendarClock} title={t("subscription")} />
          <ExistingSelect
            label={t("editExisting")}
            value={subscription.id ?? ""}
            onChange={(id) => {
              const value = subscriptions.data?.find((item) => item.id === id);
              setSubscription(
                value
                  ? { ...value, price: String(value.price) }
                  : emptySubscription(),
              );
            }}
            options={(subscriptions.data ?? []).map((item) => ({
              value: item.id,
              label: `${item.arabicTitle} · ${item.price.toFixed(3)} JOD`,
            }))}
            placeholder={t("newSubscription")}
          />
          <Field label={t("course")}>
            <select
              required
              value={subscription.courseId}
              onChange={(event) =>
                setSubscription({
                  ...subscription,
                  courseId: event.target.value,
                })
              }
              className={inputClass}
            >
              <option value="">—</option>
              {(courses.data ?? []).map((course) => (
                <option key={course.id} value={course.id}>
                  {courseName(course)}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("arabicTitle")}>
              <input
                required
                value={subscription.arabicTitle}
                onChange={(event) =>
                  setSubscription({
                    ...subscription,
                    arabicTitle: event.target.value,
                  })
                }
                className={inputClass}
              />
            </Field>
            <Field label={t("englishTitle")}>
              <input
                required
                value={subscription.englishTitle}
                onChange={(event) =>
                  setSubscription({
                    ...subscription,
                    englishTitle: event.target.value,
                  })
                }
                className={inputClass}
                dir="ltr"
              />
            </Field>
          </div>
          <PlanSettings
            price={subscription.price}
            interval={subscription.interval}
            published={subscription.isPublished}
            onPrice={(price) => setSubscription({ ...subscription, price })}
            onInterval={(interval) =>
              setSubscription({ ...subscription, interval })
            }
            onPublished={(isPublished) =>
              setSubscription({ ...subscription, isPublished })
            }
            t={t}
          />
          <SaveButton
            busy={saveSubscription.isPending}
            label={subscription.id ? t("update") : t("create")}
            busyLabel={t("saving")}
          />
        </form>

        <form
          className="card grid gap-4 p-6 xl:col-span-2"
          onSubmit={(event) => {
            event.preventDefault();
            saveCoupon.mutate();
          }}
        >
          <Heading icon={BadgePercent} title={t("coupon")} />
          <ExistingSelect
            label={t("editExisting")}
            value={coupon.id ?? ""}
            onChange={(id) => {
              const value = coupons.data?.find((item) => item.id === id);
              setCoupon(
                value
                  ? {
                      ...value,
                      percentageOff: value.percentageOff
                        ? String(value.percentageOff)
                        : "",
                      fixedAmountOff: value.fixedAmountOff
                        ? String(value.fixedAmountOff)
                        : "",
                      startsAtUtc: toLocalInput(value.startsAtUtc),
                      endsAtUtc: toLocalInput(value.endsAtUtc),
                      maxRedemptions: value.maxRedemptions
                        ? String(value.maxRedemptions)
                        : "",
                      maxRedemptionsPerUser: value.maxRedemptionsPerUser
                        ? String(value.maxRedemptionsPerUser)
                        : "",
                      minimumPurchaseAmount: value.minimumPurchaseAmount
                        ? String(value.minimumPurchaseAmount)
                        : "",
                    }
                  : emptyCoupon(),
              );
            }}
            options={(coupons.data ?? []).map((item) => ({
              value: item.id,
              label: `${item.code} · ${item.redemptionCount}`,
            }))}
            placeholder={t("newCoupon")}
          />
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t("couponCode")}>
              <input
                required
                pattern="[A-Za-z0-9-]+"
                value={coupon.code}
                onChange={(event) =>
                  setCoupon({
                    ...coupon,
                    code: event.target.value.toUpperCase(),
                  })
                }
                className={inputClass}
                dir="ltr"
              />
            </Field>
            <Field label={t("percentageOff")}>
              <input
                disabled={Boolean(coupon.fixedAmountOff)}
                min="0.001"
                max="100"
                step="0.001"
                type="number"
                value={coupon.percentageOff}
                onChange={(event) =>
                  setCoupon({ ...coupon, percentageOff: event.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label={t("fixedAmountOff")}>
              <input
                disabled={Boolean(coupon.percentageOff)}
                min="0.001"
                step="0.001"
                type="number"
                value={coupon.fixedAmountOff}
                onChange={(event) =>
                  setCoupon({ ...coupon, fixedAmountOff: event.target.value })
                }
                className={inputClass}
              />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t("startsAt")}>
              <input
                type="datetime-local"
                value={coupon.startsAtUtc}
                onChange={(event) =>
                  setCoupon({ ...coupon, startsAtUtc: event.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label={t("endsAt")}>
              <input
                type="datetime-local"
                value={coupon.endsAtUtc}
                onChange={(event) =>
                  setCoupon({ ...coupon, endsAtUtc: event.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label={t("minimumPurchase")}>
              <input
                min="0"
                step="0.001"
                type="number"
                value={coupon.minimumPurchaseAmount}
                onChange={(event) =>
                  setCoupon({
                    ...coupon,
                    minimumPurchaseAmount: event.target.value,
                  })
                }
                className={inputClass}
              />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t("maximumUses")}>
              <input
                min="1"
                step="1"
                type="number"
                value={coupon.maxRedemptions}
                onChange={(event) =>
                  setCoupon({ ...coupon, maxRedemptions: event.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label={t("maximumUsesPerUser")}>
              <input
                min="1"
                step="1"
                type="number"
                value={coupon.maxRedemptionsPerUser}
                onChange={(event) =>
                  setCoupon({
                    ...coupon,
                    maxRedemptionsPerUser: event.target.value,
                  })
                }
                className={inputClass}
              />
            </Field>
            <Toggle
              checked={coupon.isActive}
              onChange={(isActive) => setCoupon({ ...coupon, isActive })}
              label={t("active")}
            />
          </div>
          <CourseChooser
            label={t("applicableCourses")}
            help={t("applicableCoursesHelp")}
            courses={courses.data ?? []}
            selected={coupon.courseIds}
            onChange={(courseIds) => setCoupon({ ...coupon, courseIds })}
            name={courseName}
          />
          <SaveButton
            busy={saveCoupon.isPending}
            label={coupon.id ? t("update") : t("create")}
            busyLabel={t("saving")}
          />
        </form>
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-bold text-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Heading({ icon: Icon, title }: { icon: typeof Crown; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-xl font-black">
      <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
        <Icon size={18} aria-hidden="true" />
      </span>
      {title}
    </h2>
  );
}

function ExistingSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function BilingualFields({
  value,
  onChange,
  t,
}: {
  value: MembershipForm;
  onChange: (value: MembershipForm) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("arabicTitle")}>
          <input
            required
            value={value.arabicTitle}
            onChange={(event) =>
              onChange({ ...value, arabicTitle: event.target.value })
            }
            className={inputClass}
          />
        </Field>
        <Field label={t("englishTitle")}>
          <input
            required
            value={value.englishTitle}
            onChange={(event) =>
              onChange({ ...value, englishTitle: event.target.value })
            }
            className={inputClass}
            dir="ltr"
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("arabicDescription")}>
          <textarea
            required
            value={value.arabicDescription}
            onChange={(event) =>
              onChange({ ...value, arabicDescription: event.target.value })
            }
            className={`${inputClass} min-h-24`}
          />
        </Field>
        <Field label={t("englishDescription")}>
          <textarea
            required
            value={value.englishDescription}
            onChange={(event) =>
              onChange({ ...value, englishDescription: event.target.value })
            }
            className={`${inputClass} min-h-24`}
            dir="ltr"
          />
        </Field>
      </div>
    </>
  );
}

function PlanSettings({
  price,
  interval,
  published,
  onPrice,
  onInterval,
  onPublished,
  t,
}: {
  price: string;
  interval: string;
  published: boolean;
  onPrice: (value: string) => void;
  onInterval: (value: string) => void;
  onPublished: (value: boolean) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label={t("price")}>
        <input
          required
          min="0"
          step="0.001"
          type="number"
          value={price}
          onChange={(event) => onPrice(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label={t("interval")}>
        <select
          value={interval}
          onChange={(event) => onInterval(event.target.value)}
          className={inputClass}
        >
          <option value="Monthly">{t("monthly")}</option>
          <option value="Quarterly">{t("quarterly")}</option>
          <option value="Yearly">{t("yearly")}</option>
        </select>
      </Field>
      <Toggle
        checked={published}
        onChange={onPublished}
        label={t("published")}
      />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 self-end pb-3 text-sm font-bold text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function CourseChooser({
  label,
  help,
  courses,
  selected,
  onChange,
  name,
}: {
  label: string;
  help?: string;
  courses: CourseOption[];
  selected: string[];
  onChange: (value: string[]) => void;
  name: (course: CourseOption) => string;
}) {
  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id],
    );
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-bold text-foreground">{label}</legend>
      {help ? <p className="text-xs text-muted">{help}</p> : null}
      <div className="grid max-h-48 gap-2 overflow-y-auto rounded-xl border border-border p-3">
        {courses.map((course) => (
          <label
            key={course.id}
            className="flex items-center gap-2 text-sm text-foreground"
          >
            <input
              type="checkbox"
              checked={selected.includes(course.id)}
              onChange={() => toggle(course.id)}
            />
            <span>{name(course)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SaveButton({
  busy,
  label,
  busyLabel,
}: {
  busy: boolean;
  label: string;
  busyLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="focus-ring inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-60"
    >
      {busy ? (
        <Save size={17} aria-hidden="true" />
      ) : (
        <Pencil size={17} aria-hidden="true" />
      )}
      {busy ? busyLabel : label}
    </button>
  );
}
