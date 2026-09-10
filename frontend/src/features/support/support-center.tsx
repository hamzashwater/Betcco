"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Headphones,
  MessageCircleMore,
  MessageSquareText,
  Plus,
  Send,
} from "lucide-react";
import { useLocale } from "next-intl";
import { useState } from "react";

type TicketSummary = {
  id: string;
  subject: string;
  category: string;
  status: string;
  createdAtUtc: string;
  updatedAtUtc: string;
};

type TicketList = {
  items: TicketSummary[];
  page: number;
  pageSize: number;
  totalCount: number;
};

type TicketDetail = TicketSummary & {
  messages: {
    id: string;
    body: string;
    createdAtUtc: string;
    isFromCurrentUser: boolean;
  }[];
};

type CreatedTicket = { id: string; status: string };
type ManagedTicketStatus = "InProgress" | "Resolved" | "Closed";

function statusLabel(status: string, locale: string) {
  const labels: Record<string, [string, string]> = {
    Open: ["مفتوحة", "Open"],
    InProgress: ["قيد المعالجة", "In progress"],
    WaitingForStudent: ["بانتظار ردك", "Waiting for you"],
    Resolved: ["تم الحل", "Resolved"],
    Closed: ["مغلقة", "Closed"],
  };
  return labels[status]?.[locale === "ar" ? 0 : 1] ?? status;
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-JO" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SupportCenter({ mode }: { mode: "student" | "admin" }) {
  const locale = useLocale();
  const isAdmin = mode === "admin";
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("General");
  const [openingMessage, setOpeningMessage] = useState("");
  const [reply, setReply] = useState("");
  const tickets = useQuery({
    queryKey: ["support-tickets", mode],
    queryFn: () => api<TicketList>("/support/tickets?page=1&pageSize=50"),
  });
  const activeTicketId = selectedId ?? tickets.data?.items[0]?.id ?? null;
  const ticket = useQuery({
    queryKey: ["support-ticket", activeTicketId],
    queryFn: () => api<TicketDetail>(`/support/tickets/${activeTicketId}`),
    enabled: Boolean(activeTicketId),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["support-tickets", mode] });
    if (activeTicketId)
      void client.invalidateQueries({
        queryKey: ["support-ticket", activeTicketId],
      });
  };
  const create = useMutation({
    mutationFn: () =>
      api<CreatedTicket>("/support/tickets", {
        method: "POST",
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          message: openingMessage.trim(),
        }),
      }),
    onSuccess: (created) => {
      setSubject("");
      setCategory("General");
      setOpeningMessage("");
      setSelectedId(created.id);
      void client.invalidateQueries({ queryKey: ["support-tickets", mode] });
    },
  });
  const sendReply = useMutation({
    mutationFn: () =>
      api(`/support/tickets/${activeTicketId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: reply.trim() }),
      }),
    onSuccess: () => {
      setReply("");
      refresh();
    },
  });
  const changeStatus = useMutation({
    mutationFn: (status: ManagedTicketStatus) =>
      api(`/support/tickets/${activeTicketId}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    onSuccess: refresh,
  });
  const title = isAdmin
    ? locale === "ar"
      ? "صندوق دعم BETCCO"
      : "BETCCO support inbox"
    : locale === "ar"
      ? "مركز الدعم"
      : "Support centre";
  const description = isAdmin
    ? locale === "ar"
      ? "راجع الطلبات الواردة وردّ عليها من داخل المنصة؛ كل طالب يرى تذاكره فقط."
      : "Review incoming requests and reply in the platform; each learner can see only their own tickets."
    : locale === "ar"
      ? "افتح تذكرة وتابع الردود في نفس المحادثة. تظل المراسلات مرتبطة بحسابك فقط."
      : "Open a ticket and follow replies in the same conversation. Messages remain scoped to your account.";
  return (
    <section className="shell py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
            BETCCO SUPPORT
          </p>
          <h1 className="mt-2 text-3xl font-black">{title}</h1>
          <p className="mt-3 max-w-3xl leading-7 text-muted">{description}</p>
        </div>
        <span className="grid size-12 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Headphones size={24} aria-hidden="true" />
        </span>
      </header>
      <div
        className={`mt-7 grid gap-5 ${isAdmin ? "lg:grid-cols-[minmax(17rem,0.7fr)_minmax(0,1.3fr)]" : "lg:grid-cols-[minmax(17rem,0.7fr)_minmax(0,1.3fr)_minmax(17rem,0.7fr)]"}`}
      >
        <aside className="card min-h-72 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-black">
                {isAdmin
                  ? locale === "ar"
                    ? "كل التذاكر"
                    : "All tickets"
                  : locale === "ar"
                    ? "تذاكري"
                    : "My tickets"}
              </h2>
              <p className="mt-1 text-xs text-muted">
                {tickets.data?.totalCount ?? 0}{" "}
                {locale === "ar" ? "تذكرة" : "tickets"}
              </p>
            </div>
            <MessageSquareText
              size={19}
              className="text-primary"
              aria-hidden="true"
            />
          </div>
          {tickets.isPending ? (
            <p className="mt-6 text-sm text-muted" aria-busy>
              …
            </p>
          ) : tickets.isError ? (
            <p role="alert" className="mt-6 text-sm text-red-600">
              {locale === "ar"
                ? "تعذر تحميل التذاكر."
                : "Tickets could not be loaded."}
            </p>
          ) : tickets.data?.items.length ? (
            <div className="mt-5 grid gap-2">
              {tickets.data.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  aria-pressed={activeTicketId === item.id}
                  className={`focus-ring rounded-xl border p-3 text-start transition-colors ${activeTicketId === item.id ? "border-primary/55 bg-primary/10" : "border-border hover:bg-muted/35"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 font-bold">{item.subject}</p>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted">
                      {statusLabel(item.status, locale)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {formatDate(item.updatedAtUtc, locale)}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-border p-4 text-center text-sm leading-6 text-muted">
              <MessageCircleMore
                className="mx-auto text-primary"
                aria-hidden="true"
              />
              <p className="mt-3">
                {isAdmin
                  ? locale === "ar"
                    ? "لا توجد تذاكر واردة بعد."
                    : "There are no incoming tickets yet."
                  : locale === "ar"
                    ? "لا توجد تذاكر في حسابك بعد."
                    : "There are no tickets in your account yet."}
              </p>
            </div>
          )}
        </aside>

        <section className="card flex min-h-72 flex-col p-4 sm:p-6">
          {ticket.isPending && activeTicketId ? (
            <p className="text-sm text-muted" aria-busy>
              …
            </p>
          ) : ticket.isError ? (
            <p role="alert" className="text-sm text-red-600">
              {locale === "ar"
                ? "تعذر فتح هذه المحادثة."
                : "This conversation could not be opened."}
            </p>
          ) : ticket.data ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.15em] text-primary">
                    {ticket.data.category}
                  </p>
                  <h2 className="mt-1 text-xl font-black">
                    {ticket.data.subject}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-black text-primary">
                    {statusLabel(ticket.data.status, locale)}
                  </span>
                  {isAdmin ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      {ticket.data.status !== "InProgress" &&
                      ticket.data.status !== "Closed" ? (
                        <button
                          type="button"
                          disabled={changeStatus.isPending}
                          onClick={() => changeStatus.mutate("InProgress")}
                          className="focus-ring rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold hover:bg-muted disabled:opacity-60"
                        >
                          {locale === "ar" ? "بدء المعالجة" : "Start work"}
                        </button>
                      ) : null}
                      {ticket.data.status !== "Resolved" &&
                      ticket.data.status !== "Closed" ? (
                        <button
                          type="button"
                          disabled={changeStatus.isPending}
                          onClick={() => changeStatus.mutate("Resolved")}
                          className="focus-ring rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-500/20 disabled:opacity-60 dark:text-emerald-300"
                        >
                          {locale === "ar" ? "تم الحل" : "Resolve"}
                        </button>
                      ) : null}
                      {ticket.data.status !== "Closed" ? (
                        <button
                          type="button"
                          disabled={changeStatus.isPending}
                          onClick={() => changeStatus.mutate("Closed")}
                          className="focus-ring rounded-lg border border-red-500/35 px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-500/10 disabled:opacity-60 dark:text-red-300"
                        >
                          {locale === "ar" ? "إغلاق" : "Close"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              {changeStatus.isError ? (
                <p role="alert" className="mt-3 text-sm text-red-600">
                  {changeStatus.error instanceof Error
                    ? changeStatus.error.message
                    : locale === "ar"
                      ? "تعذر تحديث حالة التذكرة."
                      : "The ticket status could not be updated."}
                </p>
              ) : null}
              <div className="mt-5 flex-1 space-y-3">
                {ticket.data.messages.map((message) => (
                  <article
                    key={message.id}
                    className={`max-w-[88%] rounded-2xl p-3 text-sm leading-6 ${message.isFromCurrentUser ? "ms-auto bg-primary text-slate-950" : "bg-muted/45 text-foreground"}`}
                  >
                    <p className="whitespace-pre-wrap">{message.body}</p>
                    <p
                      className={`mt-2 text-[11px] ${message.isFromCurrentUser ? "text-slate-900/75" : "text-muted"}`}
                    >
                      {formatDate(message.createdAtUtc, locale)}
                    </p>
                  </article>
                ))}
              </div>
              <form
                className="mt-5 border-t border-border pt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (reply.trim()) sendReply.mutate();
                }}
              >
                <label className="sr-only">
                  {locale === "ar" ? "ردك" : "Your reply"}
                </label>
                <div className="flex gap-2">
                  <textarea
                    value={reply}
                    maxLength={4000}
                    disabled={
                      ticket.data.status === "Closed" || sendReply.isPending
                    }
                    onChange={(event) => setReply(event.target.value)}
                    placeholder={
                      ticket.data.status === "Closed"
                        ? locale === "ar"
                          ? "هذه التذكرة مغلقة."
                          : "This ticket is closed."
                        : locale === "ar"
                          ? "اكتب ردك…"
                          : "Write your reply…"
                    }
                    className="focus-ring min-h-20 flex-1 rounded-xl border border-border bg-transparent p-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={
                      !reply.trim() ||
                      ticket.data.status === "Closed" ||
                      sendReply.isPending
                    }
                    className="focus-ring self-end rounded-xl bg-primary p-3 text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={locale === "ar" ? "إرسال الرد" : "Send reply"}
                  >
                    <Send size={19} aria-hidden="true" />
                  </button>
                </div>
                {sendReply.isError ? (
                  <p role="alert" className="mt-2 text-sm text-red-600">
                    {sendReply.error instanceof Error
                      ? sendReply.error.message
                      : locale === "ar"
                        ? "تعذر إرسال الرد."
                        : "The reply could not be sent."}
                  </p>
                ) : null}
              </form>
            </>
          ) : (
            <div className="m-auto max-w-sm text-center">
              <MessageCircleMore
                className="mx-auto size-9 text-primary"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm leading-6 text-muted">
                {locale === "ar"
                  ? "اختر تذكرة لعرض المحادثة."
                  : "Choose a ticket to view its conversation."}
              </p>
            </div>
          )}
        </section>

        {!isAdmin ? (
          <form
            className="card h-fit p-4 sm:p-5"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
                <Plus size={20} aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-black">
                  {locale === "ar" ? "تذكرة جديدة" : "New ticket"}
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {locale === "ar"
                    ? "صف المشكلة بوضوح وتجنب إرسال كلمات المرور أو بيانات الدفع."
                    : "Describe the issue clearly and never send passwords or payment details."}
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3">
              <label className="grid gap-1 text-sm font-bold">
                <span>{locale === "ar" ? "الموضوع" : "Subject"}</span>
                <input
                  required
                  maxLength={200}
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  className="focus-ring rounded-xl border border-border bg-transparent px-3 py-2.5"
                />
              </label>
              <label className="grid gap-1 text-sm font-bold">
                <span>{locale === "ar" ? "التصنيف" : "Category"}</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="focus-ring rounded-xl border border-border bg-transparent px-3 py-2.5"
                >
                  <option value="General">
                    {locale === "ar" ? "عام" : "General"}
                  </option>
                  <option value="Technical">
                    {locale === "ar" ? "تقني" : "Technical"}
                  </option>
                  <option value="Payment">
                    {locale === "ar" ? "دفع" : "Payment"}
                  </option>
                  <option value="Course">
                    {locale === "ar" ? "دورة" : "Course"}
                  </option>
                  <option value="Safety">
                    {locale === "ar" ? "سلامة" : "Safety"}
                  </option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-bold">
                <span>{locale === "ar" ? "الرسالة" : "Message"}</span>
                <textarea
                  required
                  maxLength={4000}
                  value={openingMessage}
                  onChange={(event) => setOpeningMessage(event.target.value)}
                  className="focus-ring min-h-32 rounded-xl border border-border bg-transparent p-3"
                />
              </label>
              <button
                type="submit"
                disabled={
                  create.isPending || !subject.trim() || !openingMessage.trim()
                }
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-slate-950 disabled:cursor-wait disabled:opacity-60"
              >
                <Send size={17} aria-hidden="true" />
                {create.isPending
                  ? locale === "ar"
                    ? "جارٍ الإرسال…"
                    : "Sending…"
                  : locale === "ar"
                    ? "فتح التذكرة"
                    : "Open ticket"}
              </button>
              {create.isError ? (
                <p role="alert" className="text-sm text-red-600">
                  {create.error instanceof Error
                    ? create.error.message
                    : locale === "ar"
                      ? "تعذر فتح التذكرة."
                      : "The ticket could not be opened."}
                </p>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}
