"use client";

import { api } from "@/lib/api";
import { formatLocalizedCurrency } from "@/i18n/number-format";
import { StudentPurchaseAccess } from "@/features/cart/cart-view";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  LockKeyhole,
  TicketPercent,
  WalletCards,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

type CheckoutResult = {
  paymentId: string;
  status: string;
  provider: string;
  checkoutReference: string;
  redirectUrl: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  paymentMethod: string;
};

export function Checkout() {
  const copy = useTranslations("publicPurchase.checkout");
  const locale = useLocale();
  const router = useRouter();
  const [coupon, setCoupon] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Card");
  const user = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api<{ roles: string[] }>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
  const isStudent = user.data?.roles.includes("Student") ?? false;
  const checkout = useMutation({
    mutationFn: () =>
      api<CheckoutResult>("/cart/checkout", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          couponCode: coupon || null,
          paymentMethod,
        }),
      }),
    onSuccess: (payment) => {
      if (payment.redirectUrl) window.location.assign(payment.redirectUrl);
    },
  });
  const confirm = useMutation({
    mutationFn: (payment: CheckoutResult) =>
      api("/payments/fake/confirm", {
        method: "POST",
        body: JSON.stringify({
          paymentId: payment.paymentId,
          providerEventId: `test_${crypto.randomUUID()}`,
        }),
      }),
    onSuccess: () => router.push(`/${locale}/student/courses`),
  });
  const activeError = checkout.error ?? confirm.error;
  function confirmPayment() {
    if (checkout.data) confirm.mutate(checkout.data);
  }
  if (user.isPending)
    return (
      <div className="card p-6" aria-busy>
        …
      </div>
    );
  if (!isStudent) return <StudentPurchaseAccess locale={locale} />;
  return (
    <div className="card mx-auto max-w-2xl overflow-hidden p-0">
      <div className="border-b border-border bg-[radial-gradient(circle_at_85%_15%,color-mix(in_srgb,var(--primary)_25%,transparent),transparent_36%),linear-gradient(135deg,color-mix(in_srgb,var(--surface)_94%,transparent),color-mix(in_srgb,var(--surface-solid)_78%,transparent))] p-6 sm:p-8">
        <span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary">
          <WalletCards size={22} aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-3xl font-black tracking-tight">
          {copy("title")}
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted">
          {copy("description")}
        </p>
      </div>
      <div className="p-6 sm:p-8">
        <label className="mt-5 grid gap-1 text-sm font-semibold">
          <span className="inline-flex items-center gap-2 text-muted">
            <TicketPercent
              size={16}
              className="text-primary"
              aria-hidden="true"
            />
            {copy("coupon")}
          </span>
          <input
            value={coupon}
            onChange={(event) => setCoupon(event.target.value)}
            className="focus-ring rounded-xl border border-border bg-transparent px-3 py-3"
          />
        </label>
        <fieldset className="mt-6 grid gap-3">
          <legend className="text-sm font-semibold">{copy("method")}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              {
                value: "Card",
                ar: copy("card"),
                en: copy("card"),
              },
              {
                value: "BankTransfer",
                ar: copy("bankTransfer"),
                en: copy("bankTransfer"),
              },
              {
                value: "EWallet",
                ar: copy("wallet"),
                en: copy("wallet"),
              },
            ].map((method) => (
              <label
                key={method.value}
                className={`focus-within:ring-2 focus-within:ring-primary flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-bold ${paymentMethod === method.value ? "border-primary bg-primary/10" : "border-border bg-white/5"}`}
              >
                <input
                  type="radio"
                  name="payment-method"
                  value={method.value}
                  checked={paymentMethod === method.value}
                  onChange={() => setPaymentMethod(method.value)}
                />
                {locale === "ar" ? method.ar : method.en}
              </label>
            ))}
          </div>
        </fieldset>
        <button
          disabled={checkout.isPending}
          onClick={() => checkout.mutate()}
          className="focus-ring mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-black text-slate-950 disabled:opacity-60"
        >
          <LockKeyhole size={18} aria-hidden="true" />
          {copy("create")}
        </button>
        {checkout.data?.provider.startsWith("Fake") && (
          <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/10 p-5">
            <dl className="grid gap-2 text-sm text-muted">
              <div className="flex items-center justify-between gap-4">
                <dt>{copy("subtotal")}</dt>
                <dd>
                  {formatLocalizedCurrency(
                    checkout.data.subtotal,
                    checkout.data.currency,
                    locale,
                  )}
                </dd>
              </div>
              {checkout.data.discount > 0 ? (
                <div className="flex items-center justify-between gap-4">
                  <dt>{copy("discount")}</dt>
                  <dd>
                    {formatLocalizedCurrency(
                      -checkout.data.discount,
                      checkout.data.currency,
                      locale,
                    )}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-4">
                <dt>{copy("tax")}</dt>
                <dd>
                  {formatLocalizedCurrency(
                    checkout.data.tax,
                    checkout.data.currency,
                    locale,
                  )}
                </dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-primary/25 pt-3 text-lg font-black text-foreground">
              {copy("total")}
              {formatLocalizedCurrency(
                checkout.data.total,
                checkout.data.currency,
                locale,
              )}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              {copy("developmentNotice")}
            </p>
            <button
              disabled={confirm.isPending}
              onClick={confirmPayment}
              className="focus-ring mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-slate-950"
            >
              <BadgeCheck size={17} aria-hidden="true" />
              {copy("confirmTest")}
            </button>
          </div>
        )}
        {(checkout.isError || confirm.isError) && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {activeError instanceof Error
              ? activeError.message
              : copy("requestFailed")}
          </p>
        )}
      </div>
    </div>
  );
}
