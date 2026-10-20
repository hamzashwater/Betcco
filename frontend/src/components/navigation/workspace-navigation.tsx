"use client";

import { Action } from "@/components/ui/action";
import {
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Home,
  Library,
  Menu,
  PanelLeftClose,
  Check,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

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
      className={`focus-ring ui-type-label flex min-h-11 min-w-0 items-center border-s-2 px-3 py-2 break-words transition-colors duration-120 motion-reduce:transition-none ${current ? "border-selection-marker! bg-selection-surface text-selection-text font-semibold!" : "border-transparent! text-text-secondary hover:bg-surface-row-hover active:bg-surface-row-pressed"} ${className}`}
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
  const current = group.links.some((link) => active(link.href, link.exact));
  const [open, setOpen] = useState(current);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
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
        aria-current={current ? "true" : undefined}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={`focus-ring ui-type-label flex min-h-12 w-full items-center justify-center gap-2 border-b-2 px-3 py-2 break-words ${current ? "border-selection-marker! text-text-primary font-semibold!" : "border-transparent! text-text-secondary hover:bg-surface-row-hover"}`}
      >
        {group.label}
        <ChevronDown
          size={18}
          strokeWidth={2}
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
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-5">
      {groups
        .filter((group) => group.links.length)
        .map((group) => (
          <section key={group.label}>
            <h3 className="ui-type-meta mb-2 px-3 text-text-muted">
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

function SidebarGroup({
  group,
  active,
}: {
  group: DestinationGroup;
  active: Active;
}) {
  const current = group.links.some((link) => active(link.href, link.exact));
  const [open, setOpen] = useState(current);
  const id = useId();
  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-current={current ? "true" : undefined}
        onClick={() => setOpen(!open)}
        className="focus-ring ui-type-label flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-text-secondary hover:bg-surface-row-hover"
      >
        <span className="min-w-0 flex-1 break-words">{group.label}</span>
        {current && (
          <Check
            size={18}
            strokeWidth={2}
            aria-hidden="true"
            className="shrink-0 text-selection-marker"
          />
        )}
        <ChevronDown
          size={18}
          strokeWidth={2}
          aria-hidden="true"
          className={`shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div id={id} hidden={!open}>
        {group.links.map((link) => (
          <DestinationLink key={link.href} link={link} active={active} />
        ))}
      </div>
    </section>
  );
}

export function StaffWorkspaceNavigation({
  role,
  label,
  navigationLabel,
  primary,
  groups,
  active,
  onHide,
  hideLabel,
  container,
  hidden,
}: {
  role: "teacher" | "admin";
  label: string;
  navigationLabel: string;
  primary: ShellDestination[];
  groups: DestinationGroup[];
  active: Active;
  onHide: () => void;
  hideLabel: string;
  container: RefObject<HTMLElement | null>;
  hidden: boolean;
}) {
  const workGroups = groups.slice(0, -1).filter((group) => group.links.length);
  const account = groups.at(-1);
  return (
    <aside
      ref={container}
      id="staff-workspace-navigation"
      hidden={hidden}
      aria-label={label}
      className={`fixed inset-y-0 start-0 top-20 z-40 hidden overflow-y-auto overscroll-contain border-e border-border-subtle! bg-surface-panel p-3 text-text-primary ${hidden ? "" : "lg:block"} ${role === "teacher" ? "w-60" : "w-64"}`}
    >
      <div className="mb-3 flex min-w-0 items-start justify-between gap-1">
        <p className="ui-type-meta min-w-0 break-words px-3 py-3 text-text-muted">
          {label}
        </p>
        <Action
          variant="quiet"
          onClick={onHide}
          aria-label={hideLabel}
          className="shrink-0 px-3!"
        >
          <PanelLeftClose
            size={20}
            strokeWidth={2}
            aria-hidden="true"
            className="rtl:rotate-180"
          />
        </Action>
      </div>
      <nav aria-label={navigationLabel}>
        {primary.length > 0 && (
          <div className="mb-3 border-b border-border-subtle! pb-3">
            {primary.map((link) => (
              <DestinationLink key={link.href} link={link} active={active} />
            ))}
          </div>
        )}
        <div className="space-y-2">
          {role === "admin" ? (
            workGroups.map((group) => (
              <SidebarGroup
                key={`${group.label}:${group.links.some((link) => active(link.href, link.exact))}`}
                group={group}
                active={active}
              />
            ))
          ) : (
            <GroupedDestinations groups={workGroups} active={active} />
          )}
        </div>
        {account && account.links.length > 0 && (
          <div className="mt-4 border-t border-border-subtle! pt-4">
            <GroupedDestinations groups={[account]} active={active} />
          </div>
        )}
      </nav>
    </aside>
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
        <div className="shell flex flex-wrap items-stretch gap-1 py-2">
          {primary.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active(link.href, link.exact) ? "page" : undefined}
              className={`focus-ring ui-type-label flex min-h-12 min-w-0 items-center border-b-2 px-3 py-2 break-words ${active(link.href, link.exact) ? "border-selection-marker! bg-selection-surface text-selection-text font-semibold!" : "border-transparent! text-text-secondary hover:bg-surface-row-hover"}`}
            >
              {link.label}
            </Link>
          ))}
          {groups
            .filter((group) => group.links.length)
            .map((group) => (
              <DestinationDisclosure
                key={`${group.label}:${group.links.some((link) => active(link.href, link.exact))}`}
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
                className={`focus-ring ui-type-meta flex min-h-20 min-w-0 flex-col items-center justify-center gap-1 border-t-2 px-1 py-2 text-center break-words ${current ? "border-selection-marker! bg-selection-surface text-selection-text font-semibold!" : "border-transparent! text-text-secondary"}`}
              >
                <Icon size={20} strokeWidth={2} aria-hidden="true" />
                {link.label}
              </Link>
            );
          })}
          <Action
            variant="quiet"
            className="min-h-20! flex-col rounded-none! px-1! ui-type-meta!"
            aria-controls="shell-drawer"
            aria-expanded={moreExpanded}
            onClick={onMore}
          >
            <Menu size={20} strokeWidth={2} aria-hidden="true" />
            {moreLabel}
          </Action>
        </nav>
      )}
    </>
  );
}
