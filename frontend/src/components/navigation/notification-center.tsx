"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Notification = {
  id: string;
  title: string;
  body: string;
  type: string;
  deepLink?: string;
  readAtUtc?: string;
  createdAtUtc: string;
};

export function NotificationCenter({
  locale,
  enabled,
}: {
  locale: string;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const popover = useRef<HTMLDivElement>(null);
  const client = useQueryClient();
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<Notification[]>("/notifications"),
    enabled,
    retry: false,
    staleTime: 30_000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) =>
      api(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAllRead = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });
  useEffect(() => {
    if (!open) return;
    const dismissOnOutsidePress = (event: PointerEvent) => {
      if (!popover.current?.contains(event.target as Node)) setOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOnOutsidePress);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOnOutsidePress);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);
  if (!enabled) return null;
  const items = notifications.data ?? [];
  const unread = items.filter((item) => !item.readAtUtc).length;
  return (
    <div ref={popover} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="focus-ring relative inline-flex rounded-lg p-2 text-muted hover:bg-white/5 hover:text-foreground"
        aria-label={
          locale === "ar"
            ? `الإشعارات، ${unread} غير مقروءة`
            : `Notifications, ${unread} unread`
        }
        aria-expanded={open}
        aria-controls="notification-center"
      >
        <Bell size={19} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute end-1 top-1 size-2 rounded-full bg-red-500 ring-2 ring-[var(--background-elevated)]" />
        )}
      </button>
      {open && (
        <div
          id="notification-center"
          role="dialog"
          aria-label={locale === "ar" ? "الإشعارات" : "Notifications"}
          className="glass-panel navigation-popover absolute end-0 top-[calc(100%+0.6rem)] z-[80] w-[min(23rem,calc(100vw-2rem))] overflow-hidden shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <p className="font-black text-foreground">
                {locale === "ar" ? "الإشعارات" : "Notifications"}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {unread
                  ? locale === "ar"
                    ? `${unread} غير مقروءة`
                    : `${unread} unread`
                  : locale === "ar"
                    ? "أنت على اطلاع"
                    : "You are up to date"}
              </p>
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                <CheckCheck size={15} aria-hidden="true" />
                {locale === "ar" ? "قراءة الكل" : "Read all"}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {notifications.isPending && (
              <div className="p-4 text-sm text-muted">…</div>
            )}
            {items.map((notification) => {
              const destination = notification.deepLink?.startsWith("/")
                ? notification.deepLink
                : undefined;
              // Deep links are stored by the API without a locale so the same
              // notification works for Arabic and English. Keep an explicitly
              // localized path intact, then add the active locale otherwise.
              const localizedDestination = destination
                ? destination === `/${locale}` ||
                  destination.startsWith(`/${locale}/`)
                  ? destination
                  : `/${locale}${destination}`
                : undefined;
              const content = (
                <>
                  <p className="font-bold text-foreground">
                    {notification.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                    {notification.body}
                  </p>
                </>
              );
              return localizedDestination ? (
                <Link
                  key={notification.id}
                  href={localizedDestination}
                  onClick={() => {
                    if (!notification.readAtUtc)
                      markRead.mutate(notification.id);
                    setOpen(false);
                  }}
                  className={`focus-ring block rounded-xl p-3 ${notification.readAtUtc ? "hover:bg-white/5" : "bg-primary/10 hover:bg-primary/15"}`}
                >
                  {content}
                </Link>
              ) : (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() =>
                    !notification.readAtUtc && markRead.mutate(notification.id)
                  }
                  className={`focus-ring block w-full rounded-xl p-3 text-start ${notification.readAtUtc ? "hover:bg-white/5" : "bg-primary/10 hover:bg-primary/15"}`}
                >
                  {content}
                </button>
              );
            })}
            {!notifications.isPending && !items.length && (
              <div className="p-7 text-center">
                <Inbox
                  className="mx-auto text-primary"
                  size={25}
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm text-muted">
                  {locale === "ar"
                    ? "لا توجد إشعارات حتى الآن."
                    : "There are no notifications yet."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
