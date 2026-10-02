"use client";

import { Action } from "@/components/ui/action";
import {
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Home,
  Library,
  Menu,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type ShellDestination = { href: string; label: string; exact?: boolean };
export type DestinationGroup = { label: string; links: ShellDestination[] };
type Active = (href: string, exact?: boolean) => boolean;

export function DestinationLink({
  link,
  active,
  onNavigate,
  className = "",
}: {
  link: ShellDestination;
  active: Active;
  onNavigate?: () => void;
  className?: string;
}) {
  const current = active(link.href, link.exact);
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      className={`focus-ring flex min-h-11 min-w-0 items-center border-s-2 px-3 py-2 text-sm leading-6 break-words transition-colors duration-150 motion-reduce:transition-none ${current ? "border-text-link! bg-surface-muted font-bold text-text-primary" : "border-transparent! text-text-secondary hover:bg-surface-muted"} ${className}`}
    >
      {link.label}
    </Link>
  );
}

function DestinationDisclosure({
  group,
  active,
}: {
  group: DestinationGroup;
  active: Active;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const current = group.links.some((link) => active(link.href, link.exact));
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div ref={root} className="relative min-w-0">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={`focus-ring flex min-h-12 w-full items-center justify-center gap-2 border-b-2 px-3 py-2 text-sm leading-6 font-bold break-words ${current ? "border-text-link! text-text-primary" : "border-transparent! text-text-secondary hover:bg-surface-muted"}`}
      >
        {group.label}
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          id={id}
          className="absolute start-0 top-full z-20 max-h-[65vh] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto border border-border-default! bg-surface-overlay p-2 shadow-overlay"
        >
          {group.links.map((link) => (
            <DestinationLink
              key={link.href}
              link={link}
              active={active}
              onNavigate={() => setOpen(false)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function GroupedDestinations({
  groups,
  active,
  onNavigate,
}: {
  groups: DestinationGroup[];
  active: Active;
  onNavigate: () => void;
}) {
  return (
    <div className="space-y-5">
      {groups
        .filter((group) => group.links.length)
        .map((group) => (
          <section key={group.label}>
            <h3 className="mb-2 px-3 text-xs leading-5 font-bold text-text-muted">
              {group.label}
            </h3>
            <div>
              {group.links.map((link) => (
                <DestinationLink
                  key={link.href}
                  link={link}
                  active={active}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}

export function WorkspaceNavigation({
  label,
  primary,
  groups,
  active,
  student,
  moreLabel,
  onMore,
  moreExpanded,
  children,
}: {
  label: string;
  primary: ShellDestination[];
  groups: DestinationGroup[];
  active: Active;
  student: boolean;
  moreLabel: string;
  onMore: () => void;
  moreExpanded: boolean;
  children?: ReactNode;
}) {
  const icons = [Home, Library, ClipboardList, CalendarDays];
  return (
    <>
      <nav
        aria-label={label}
        className="hidden border-t border-border-subtle! md:block"
      >
        <div className="shell flex flex-wrap items-stretch gap-1">
          {primary.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active(link.href, link.exact) ? "page" : undefined}
              className={`focus-ring flex min-h-12 min-w-0 items-center border-b-2 px-3 py-2 text-sm leading-6 font-bold break-words ${active(link.href, link.exact) ? "border-text-link! text-text-primary" : "border-transparent! text-text-secondary hover:bg-surface-muted"}`}
            >
              {link.label}
            </Link>
          ))}
          {groups
            .filter((group) => group.links.length)
            .map((group) => (
              <DestinationDisclosure
                key={group.label}
                group={group}
                active={active}
              />
            ))}
          {children}
        </div>
      </nav>
      {student && (
        <nav
          aria-label={label}
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border-default! bg-surface-overlay pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          {primary.map((link, index) => {
            const Icon = icons[index];
            const current = active(link.href, link.exact);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={`focus-ring flex min-h-20 min-w-0 flex-col items-center justify-center gap-1 border-t-2 px-1 py-2 text-center text-[0.6875rem] leading-4 font-bold break-words ${current ? "border-text-link! bg-surface-muted text-text-primary" : "border-transparent! text-text-secondary"}`}
              >
                <Icon size={19} aria-hidden="true" />
                {link.label}
              </Link>
            );
          })}
          <Action
            variant="quiet"
            className="min-h-20! flex-col rounded-none! px-1! text-[0.6875rem]! leading-4!"
            aria-controls="shell-drawer"
            aria-expanded={moreExpanded}
            onClick={onMore}
          >
            <Menu size={19} aria-hidden="true" />
            {moreLabel}
          </Action>
        </nav>
      )}
    </>
  );
}
