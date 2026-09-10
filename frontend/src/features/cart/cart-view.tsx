"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ShoppingBag, Trash2, WalletCards } from "lucide-react";
import Link from "next/link";
import { useLocale } from "next-intl";

type Cart = {
  id: string;
  items: {
    id: string;
    referenceId: string;
    itemType: string;
    title: string;
    price: number;
  }[];
  subtotal: number;
  discount: number;
  total: number;
  currency: string;
};

type CurrentUser = { roles: string[] };

export function StudentPurchaseAccess({ locale }: { locale: string }) {
  return (
    <div className="card mx-auto max-w-2xl p-6 text-center sm:p-8">
      <h1 className="text-2xl font-black">
        {locale === "ar"
          ? "يلزم حساب طالب للشراء"
          : "A student account is required"}
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-muted">
        {locale === "ar"
          ? "يمكنك متابعة استكشاف الموقع كضيف، لكن السلة والدفع ومتابعة الدورات تتطلب تسجيل الدخول بحساب طالب."
          : "You can keep exploring as a guest, but the cart, payment, and course learning require a signed-in student account."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href={`/${locale}/login`}
          className="focus-ring rounded-xl bg-primary px-4 py-3 font-black text-slate-950"
        >
          {locale === "ar" ? "تسجيل الدخول" : "Sign in"}
        </Link>
        <Link
          href={`/${locale}/courses`}
          className="focus-ring rounded-xl border border-border px-4 py-3 font-black"
        >
          {locale === "ar" ? "المتابعة كضيف" : "Continue as guest"}
        </Link>
      </div>
    </div>
  );
}

export function CartView() {
  const locale = useLocale();
  const client = useQueryClient();
  const user = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api<CurrentUser>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
  const isStudent = user.data?.roles.includes("Student") ?? false;
  const cart = useQuery({
    queryKey: ["cart", locale],
    queryFn: () => api<Cart>(`/cart?locale=${locale}`),
    enabled: isStudent,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/cart/items/${id}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["cart"] }),
  });
  if (user.isPending)
    return (
      <div className="card p-6" aria-busy>
        …
      </div>
    );
  if (!isStudent) return <StudentPurchaseAccess locale={locale} />;
  if (cart.isPending)
    return (
      <div className="card p-6" aria-busy>
        …
      </div>
    );
  if (cart.isError)
    return (
      <p role="alert" className="card p-6">
        {locale === "ar" ? "تعذر تحميل السلة." : "Unable to load cart."}
      </p>
    );
  return (
    <div>
      <header className="relative overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_85%_15%,color-mix(in_srgb,var(--primary)_26%,transparent),transparent_35%),linear-gradient(135deg,color-mix(in_srgb,var(--surface)_94%,transparent),color-mix(in_srgb,var(--surface-solid)_75%,transparent))] p-6 shadow-[var(--shadow)] sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
          BETCCO Checkout
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
          {locale === "ar" ? "سلة التعلّم" : "Learning cart"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
          {locale === "ar"
            ? "راجع الدورات التي اخترتها قبل إنشاء جلسة الدفع الآمنة. الأسعار تحسب من الخادم."
            : "Review the courses you selected before creating a secure checkout session. Prices are calculated on the server."}
        </p>
      </header>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card divide-y divide-border overflow-hidden">
          {cart.data.items.length ? (
            cart.data.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 p-5"
              >
                <div className="min-w-0">
                  <p className="font-bold">{item.title}</p>
                  <p className="mt-1 text-xs text-muted">{item.itemType}</p>
                </div>
                <div className="flex items-center gap-4">
                  <strong>{item.price.toFixed(3)} JOD</strong>
                  <button
                    className="focus-ring rounded-lg p-2 text-red-400 hover:bg-red-400/10"
                    aria-label={locale === "ar" ? "حذف العنصر" : "Remove item"}
                    onClick={() => remove.mutate(item.id)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center">
              <ShoppingBag
                className="mx-auto text-primary"
                size={28}
                aria-hidden="true"
              />
              <p className="mt-4 text-muted">
                {locale === "ar" ? "سلتك فارغة." : "Your cart is empty."}
              </p>
              <Link
                href={`/${locale}/courses`}
                className="focus-ring mt-4 inline-flex items-center gap-1 text-sm font-black text-primary"
              >
                {locale === "ar" ? "استكشف الدورات" : "Explore courses"}
                <ArrowLeft
                  size={16}
                  className="rtl:rotate-180"
                  aria-hidden="true"
                />
              </Link>
            </div>
          )}
        </div>
        <aside className="card h-fit p-5 lg:sticky lg:top-24">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
              <WalletCards size={18} aria-hidden="true" />
            </span>
            <h2 className="text-xl font-black">
              {locale === "ar" ? "ملخص الطلب" : "Order summary"}
            </h2>
          </div>
          <div className="mt-5 flex justify-between text-sm">
            <span>{locale === "ar" ? "الإجمالي" : "Subtotal"}</span>
            <span>
              {cart.data.subtotal.toFixed(3)} {cart.data.currency}
            </span>
          </div>
          <div className="mt-3 flex justify-between border-t pt-3 text-lg font-black">
            <span>{locale === "ar" ? "المجموع" : "Total"}</span>
            <span>
              {cart.data.total.toFixed(3)} {cart.data.currency}
            </span>
          </div>
          <Link
            className={`focus-ring mt-5 block rounded-xl bg-primary px-4 py-3 text-center font-black text-slate-950 ${cart.data.items.length ? "" : "pointer-events-none opacity-50"}`}
            href={`/${locale}/checkout`}
          >
            {locale === "ar" ? "الانتقال للدفع" : "Proceed to checkout"}
          </Link>
        </aside>
      </div>
    </div>
  );
}
