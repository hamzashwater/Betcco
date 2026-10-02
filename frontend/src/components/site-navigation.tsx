"use client";

import { CommandPalette } from "@/components/navigation/command-palette";
import { NotificationCenter } from "@/components/navigation/notification-center";
import { BrandLogo } from "@/components/brand-logo";
import { ApiError, api, invalidateCsrfToken } from "@/lib/api";
import {
  publicBrandSettingsQueryKey,
  resolveBrandSettings,
  resolveBrandIdentity,
  type BrandSettings,
} from "@/lib/brand";
import { Action, actionClassName } from "@/components/ui/action";
import { useDialogFocus } from "@/components/navigation/use-dialog-focus";
import {
  WorkspaceNavigation,
  GroupedDestinations,
  type ShellDestination,
  type DestinationGroup,
} from "@/components/navigation/workspace-navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  ShoppingCart,
  X,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  getAlternateLocale,
  getLocaleSwitchPathname,
} from "@/i18n/locale-switch";
import { ThemeToggle } from "./theme-toggle";

type CartSummary = { items: { id: string }[] };
type CurrentUser = { displayName: string; roles: string[] };
type Taxonomy = {
  grades: { id: string; learningTrackId: string; name: string }[];
  specializations: { id: string; learningTrackId: string; name: string }[];
};

export function SiteNavigation() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const nav = useTranslations("navigation");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const mega = useRef<HTMLDivElement>(null);
  const subjectsTrigger = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const alternate = getAlternateLocale(locale);
  const localeSwitchPathname = getLocaleSwitchPathname(
    pathname,
    locale,
    alternate,
  );
  const preserveLocaleSwitchContext = (event: {
    preventDefault: () => void;
  }) => {
    event.preventDefault();
    setDrawerOpen(false);
    setMegaOpen(false);
    const destination = new URL(localeSwitchPathname, window.location.href);
    destination.search = window.location.search;
    destination.hash = window.location.hash;
    router.push(
      `${destination.pathname}${destination.search}${destination.hash}`,
    );
  };
  const workspace = pathname.startsWith(`/${locale}/admin`)
    ? "admin"
    : pathname.startsWith(`/${locale}/teacher`)
      ? "teacher"
      : pathname.startsWith(`/${locale}/support`)
        ? "support"
        : null;
  const isWorkspace = workspace !== null;
  const isAccountArea =
    pathname.startsWith(`/${locale}/admin`) ||
    pathname.startsWith(`/${locale}/teacher`) ||
    pathname.startsWith(`/${locale}/support`) ||
    pathname.startsWith(`/${locale}/student`);
  const user = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api<CurrentUser>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
  const cart = useQuery({
    queryKey: ["cart", locale],
    queryFn: () => api<CartSummary>(`/cart?locale=${locale}`),
    retry: false,
    enabled: !isWorkspace && Boolean(user.data?.roles.includes("Student")),
  });
  const taxonomy = useQuery({
    queryKey: ["navigation-taxonomy", locale],
    queryFn: () => api<Taxonomy>(`/taxonomy?locale=${locale}`),
    enabled: !isWorkspace && (megaOpen || drawerOpen),
    staleTime: 60_000,
  });
  const settings = useQuery({
    queryKey: publicBrandSettingsQueryKey(locale),
    queryFn: () => api<BrandSettings>(`/settings/public?locale=${locale}`),
    staleTime: 60_000,
  });
  const completeLogout = () => {
    setDrawerOpen(false);
    invalidateCsrfToken();
    queryClient.clear();
    router.replace(`/${locale}/login`);
    router.refresh();
  };
  const logout = useMutation({
    mutationFn: () => api<void>("/auth/logout", { method: "POST" }),
    onSuccess: completeLogout,
    onError: (error) => {
      // An expired cookie is already a signed-out session, so clear local data.
      if (error instanceof ApiError && error.status === 401) completeLogout();
    },
  });
  const brand = resolveBrandSettings(locale, settings.data);
  const identity = resolveBrandIdentity(locale, settings.data);
  const isSignedIn = Boolean(user.data);
  const isStudent = user.data?.roles.includes("Student") ?? false;
  const authResolved = !user.isPending;
  const cartItemCount = cart.data?.items.length ?? 0;
  const isLeadVerifier = user.data?.roles.includes("LeadInternalVerifier");
  const canManageEvaluatorSpecialisms = user.data?.roles.some(
    (role) => role === "Admin" || role === "SystemAdmin",
  );
  const isCourseReviewer = user.data?.roles.includes("CourseReviewer") ?? false;
  const isCoordinatorOnly =
    isCourseReviewer && !canManageEvaluatorSpecialisms && !isLeadVerifier;
  const dashboardRole =
    canManageEvaluatorSpecialisms || isLeadVerifier || isCourseReviewer
      ? "admin"
      : user.data?.roles.includes("SupportAdmin")
        ? "support"
        : user.data?.roles.includes("Teacher")
          ? "teacher"
          : "student";
  // Inside a protected workspace, keep both the logo and account shortcut
  // anchored to that workspace even if the browser has a stale profile cache.
  const visibleAccountRole = workspace ?? dashboardRole;
  const accountDestination =
    visibleAccountRole === "support"
      ? `/${locale}/support/accounts`
      : visibleAccountRole === "admin" && isCoordinatorOnly
        ? `/${locale}/admin/evaluations`
        : visibleAccountRole === "admin" &&
            isLeadVerifier &&
            !canManageEvaluatorSpecialisms
          ? `/${locale}/admin/evaluations`
          : `/${locale}/${visibleAccountRole}/dashboard`;
  const brandDestination = isWorkspace
    ? workspace === "support"
      ? `/${locale}/support/accounts`
      : workspace === "admin" && isCoordinatorOnly
        ? `/${locale}/admin/evaluations`
        : `/${locale}/${workspace}/dashboard`
    : `/${locale}`;
  const accountLabel =
    visibleAccountRole === "admin"
      ? isCoordinatorOnly
        ? nav("account.assessmentCoordination")
        : nav("account.admin")
      : visibleAccountRole === "support"
        ? nav("account.support")
        : visibleAccountRole === "teacher"
          ? nav("account.teacher")
          : nav("account.student");
  const publicNavLinks: {
    href: string;
    label: string;
    exact?: boolean;
    compact?: boolean;
  }[] = [
    {
      href: `/${locale}`,
      label: nav("home"),
      exact: true,
    },
    { href: `/${locale}/courses`, label: t("courses") },
    {
      href: `/${locale}/packages`,
      label: nav("packages"),
      compact: true,
    },
    { href: `/${locale}/tracks`, label: t("tracks") },
    {
      href: `/${locale}/memberships`,
      label: nav("memberships"),
    },
    { href: `/${locale}/live`, label: t("live") },
    { href: `/${locale}/blog`, label: t("blog") },
  ];
  const workspaceNavLinks =
    workspace === "admin"
      ? [
          {
            href: `/${locale}/admin`,
            label: nav("admin.overview"),
            exact: true,
          },
          {
            href: `/${locale}/admin/students`,
            label: nav("admin.students"),
          },
          {
            href: `/${locale}/admin/teachers`,
            label: nav("admin.teachers"),
          },
          {
            href: `/${locale}/admin/account-identities`,
            label: nav("admin.accountIdentities"),
          },
          {
            href: `/${locale}/admin/course-approvals`,
            label: nav("admin.courseApprovals"),
          },
          {
            href: `/${locale}/admin/evaluations`,
            label: nav("admin.evaluations"),
          },
          ...(canManageEvaluatorSpecialisms
            ? [
                {
                  href: `/${locale}/admin/evaluator-specialisms`,
                  label: nav("admin.evaluatorSpecialisms"),
                },
              ]
            : []),
          {
            href: `/${locale}/admin/internal-verification`,
            label: nav("admin.internalVerification"),
          },
          {
            href: `/${locale}/admin/evaluation-appeals`,
            label: nav("admin.appeals"),
          },
          {
            href: `/${locale}/admin/qualification-registry`,
            label: nav("admin.qualifications"),
          },
          {
            href: `/${locale}/admin/academic-catalogue`,
            label: t("academicCatalogue.title"),
          },
          {
            href: `/${locale}/admin/delivery-planning`,
            label: t("deliveryPlanning.title"),
          },
          {
            href: `/${locale}/admin/wallet`,
            label: nav("admin.wallet"),
          },
          {
            href: `/${locale}/admin/content`,
            label: nav("admin.content"),
          },
          {
            href: `/${locale}/admin/commerce`,
            label: nav("admin.commerce"),
          },
          {
            href: `/${locale}/admin/audit-logs`,
            label: nav("admin.auditLogs"),
          },
          {
            href: `/${locale}/admin/privacy`,
            label: nav("admin.privacy"),
          },
          {
            href: `/${locale}/admin/security-incidents`,
            label: nav("admin.securityIncidents"),
          },
          {
            href: `/${locale}/admin/ratings`,
            label: nav("admin.platformReviews"),
          },
          {
            href: `/${locale}/admin/support`,
            label: nav("admin.support"),
          },
          {
            href: `/${locale}/admin/integrations`,
            label: nav("admin.integrations"),
          },
          {
            href: `/${locale}/admin/profile`,
            label: nav("admin.profile"),
          },
          {
            href: `/${locale}/admin/security`,
            label: nav("admin.accountSecurity"),
          },
        ]
      : workspace === "support"
        ? [
            {
              href: `/${locale}/support/accounts`,
              label: nav("support.accounts"),
            },
            {
              href: `/${locale}/support/profile`,
              label: nav("support.profile"),
            },
            {
              href: `/${locale}/support/security`,
              label: nav("support.accountSecurity"),
            },
          ]
        : [
            {
              href: `/${locale}/teacher`,
              label: nav("teacher.overview"),
              exact: true,
            },
            {
              href: `/${locale}/teacher/courses`,
              label: nav("teacher.courses"),
            },
            {
              href: `/${locale}/teacher/students`,
              label: t("teacherStudentFollowUp.navigation"),
            },
            {
              href: `/${locale}/teacher/evaluations`,
              label: nav("teacher.evaluations"),
            },
            {
              href: `/${locale}/teacher/wallet`,
              label: nav("teacher.wallet"),
            },
            {
              href: `/${locale}/teacher/profile`,
              label: nav("teacher.profile"),
            },
            {
              href: `/${locale}/teacher/security`,
              label: nav("teacher.accountSecurity"),
            },
          ];
  const navLinks = isWorkspace
    ? isCoordinatorOnly && workspace === "admin"
      ? workspaceNavLinks.filter(
          (link) =>
            link.href === `/${locale}/admin/evaluations` ||
            link.href === `/${locale}/admin/profile` ||
            link.href === `/${locale}/admin/security`,
        )
      : workspaceNavLinks
    : publicNavLinks;
  const workspaceLabel =
    workspace === "admin"
      ? isCoordinatorOnly
        ? nav("workspace.assessmentCoordination")
        : nav("workspace.admin")
      : workspace === "support"
        ? nav("workspace.support")
        : nav("workspace.teacher");

  useEffect(() => {
    if (!isAccountArea || user.isPending || user.data) return;
    router.replace(`/${locale}/login`);
  }, [isAccountArea, locale, router, user.data, user.isPending]);

  useDialogFocus(drawerOpen, drawer, () => setDrawerOpen(false));
  useEffect(() => {
    if (!megaOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMegaOpen(false);
        subjectsTrigger.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !header.current?.contains(target) &&
        !subjectsTrigger.current?.contains(target) &&
        !mega.current?.contains(target)
      )
        setMegaOpen(false);
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", outside);
    };
  }, [megaOpen]);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setDrawerOpen(false);
        window.requestAnimationFrame(() => setPaletteOpen(true));
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);
  const active = (href: string, exact = false) =>
    exact
      ? pathname === href || (isWorkspace && pathname === `${href}/dashboard`)
      : pathname === href || pathname.startsWith(`${href}/`);
  const studentShell = pathname.startsWith(`/${locale}/student`);
  const shellWorkspace = isWorkspace || studentShell;
  const student = useTranslations("studentWorkspace.navigation");
  const studentLinks: ShellDestination[] = [
    { href: `/${locale}/student`, label: student("overview"), exact: true },
    ...[
      "courses",
      "evaluations",
      "planner",
      "notes",
      "bookmarks",
      "certificates",
      "purchases",
      "ai-practice",
      "appeals",
      "account",
      "security",
      "support",
    ].map((segment) => ({
      href: `/${locale}/student/${segment}`,
      label: student(
        segment === "purchases"
          ? "payments"
          : segment === "ai-practice"
            ? "aiPractice"
            : segment,
      ),
    })),
  ];
  const shellLinks = studentShell ? studentLinks : navLinks;
  const shellActive = (href: string, exact = false) =>
    active(href, exact) ||
    (studentShell &&
      href === `/${locale}/student` &&
      pathname === `${href}/dashboard`) ||
    (studentShell &&
      href === `/${locale}/student/courses` &&
      pathname.startsWith(`/${locale}/student/learn/`));
  const pick = (...segments: string[]) =>
    shellLinks.filter((link) =>
      segments.includes(link.href.split("/").at(-1) ?? ""),
    );
  const shellLabel = studentShell
    ? nav("account.student")
    : shellWorkspace
      ? workspaceLabel
      : nav("accessibility.primary");
  let primary: ShellDestination[];
  let groups: DestinationGroup[];
  if (studentShell) {
    primary = studentLinks.slice(0, 4);
    groups = [
      {
        label: nav("accessibility.menuLinks"),
        links: studentLinks.slice(4, 10),
      },
      { label: student("account"), links: studentLinks.slice(10) },
    ];
  } else if (workspace === "admin") {
    primary = shellLinks.filter((link) => link.exact);
    groups = [
      {
        label: nav("admin.students"),
        links: pick("students", "teachers", "account-identities"),
      },
      {
        label: t("academicCatalogue.title"),
        links: pick(
          "course-approvals",
          "qualification-registry",
          "academic-catalogue",
          "delivery-planning",
        ),
      },
      {
        label: nav("admin.evaluations"),
        links: pick(
          "evaluations",
          "evaluator-specialisms",
          "internal-verification",
          "evaluation-appeals",
        ),
      },
      { label: nav("admin.wallet"), links: pick("wallet", "commerce") },
      {
        label: nav("accessibility.menuLinks"),
        links: pick(
          "content",
          "audit-logs",
          "privacy",
          "security-incidents",
          "ratings",
          "support",
          "integrations",
          "profile",
          "security",
        ),
      },
    ];
  } else if (workspace === "teacher") {
    primary = shellLinks.filter(
      (link) =>
        link.exact ||
        ["courses", "students", "evaluations"].includes(
          link.href.split("/").at(-1) ?? "",
        ),
    );
    groups = [
      {
        label: nav("accessibility.menuLinks"),
        links: pick("wallet", "profile", "security"),
      },
    ];
  } else if (workspace === "support") {
    primary = pick("accounts");
    groups = [
      { label: nav("support.profile"), links: pick("profile", "security") },
    ];
  } else {
    primary = publicNavLinks.filter(
      (link) =>
        link.exact ||
        [`/${locale}/courses`, `/${locale}/tracks`].includes(link.href),
    );
    groups = [
      {
        label: nav("accessibility.menuLinks"),
        links: publicNavLinks.filter((link) => !primary.includes(link)),
      },
    ];
  }
  const currentDestination = shellLinks.find((link) =>
    shellActive(link.href, link.exact),
  );
  const drawerGroups = [{ label: shellLabel, links: primary }, ...groups];
  const closeDrawer = () => setDrawerOpen(false);
  const logo = (
    <span className="block w-full max-w-36 text-sm font-bold leading-5 break-words [&_.brand-logo-fallback]:line-clamp-2!">
      <BrandLogo
        identity={identity}
        variant="horizontal"
        priority
        maxBlockSize="2.25rem"
        className="brand-logo-on-light"
      />
      <BrandLogo
        identity={identity}
        variant="dark"
        priority
        maxBlockSize="2.25rem"
        className="brand-logo-on-dark"
      />
    </span>
  );
  return (
    <>
      <header
        ref={header}
        className="sticky top-0 z-50 border-b border-border-default! bg-surface-overlay text-text-primary"
      >
        <div className="shell flex min-h-[4.5rem] items-center justify-between gap-2 py-2">
          <div className="min-w-0 flex-1">
            <Link
              href={brandDestination}
              className="focus-ring inline-flex max-w-full items-center"
              aria-label={
                isWorkspace
                  ? nav("accessibility.brandBack", {
                      brand: brand.BrandName,
                      workspace: workspaceLabel,
                    })
                  : brand.BrandName
              }
            >
              {logo}
            </Link>
            {shellWorkspace && (
              <p className="mt-1 flex min-w-0 items-center gap-2 text-[0.6875rem] leading-4 text-text-muted">
                <span className="truncate" title={shellLabel}>
                  {shellLabel}
                </span>
                {currentDestination && (
                  <>
                    <span aria-hidden="true">/</span>
                    <span
                      className="truncate font-bold text-text-primary"
                      title={currentDestination.label}
                    >
                      {currentDestination.label}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Action
              variant="quiet"
              className="hidden! px-3! sm:inline-flex!"
              onClick={() => setPaletteOpen(true)}
              aria-label={nav("search")}
            >
              <Search size={19} aria-hidden="true" />
              <kbd className="hidden text-[10px] text-text-muted xl:inline">
                Ctrl K
              </kbd>
            </Action>
            <ThemeToggle locale={locale} />
            <Link
              href={localeSwitchPathname}
              onNavigate={preserveLocaleSwitchContext}
              className={actionClassName(
                "quiet",
                "hidden! px-3! text-xs! md:inline-flex!",
              )}
              aria-label={nav("accessibility.switchLanguage")}
            >
              {alternate.toUpperCase()}
            </Link>
            <NotificationCenter locale={locale} enabled={isSignedIn} />
            {!isWorkspace && isStudent && (
              <Link
                href={`/${locale}/cart`}
                className={actionClassName(
                  "quiet",
                  "relative hidden! px-3! md:inline-flex!",
                )}
                aria-label={nav("accessibility.cartItems", {
                  count: cartItemCount,
                })}
              >
                <ShoppingCart size={19} aria-hidden="true" />
                {cartItemCount > 0 && (
                  <span
                    className="absolute end-0 top-0 rounded-control bg-action-danger px-1 text-xs text-action-danger-text"
                    aria-hidden="true"
                  >
                    {cartItemCount > 99 ? "99+" : cartItemCount}
                  </span>
                )}
              </Link>
            )}
            {isSignedIn ? (
              <>
                <Link
                  href={accountDestination}
                  className={actionClassName(
                    "secondary",
                    "hidden! px-3! md:inline-flex!",
                  )}
                  aria-label={accountLabel}
                  title={accountLabel}
                >
                  <LayoutDashboard size={18} aria-hidden="true" />
                  <span className="hidden max-w-32 truncate lg:inline">
                    {user.data?.displayName}
                  </span>
                </Link>
                <Action
                  variant="quiet"
                  onClick={() => logout.mutate()}
                  pending={logout.isPending}
                  pendingLabel={nav("signingOut")}
                  className="hidden! px-3! md:inline-flex!"
                  aria-label={nav("accessibility.logout")}
                >
                  <LogOut size={18} aria-hidden="true" />
                </Action>
              </>
            ) : authResolved && !isAccountArea ? (
              <Link
                href={`/${locale}/login`}
                className={actionClassName(
                  "primary",
                  "hidden! sm:inline-flex!",
                )}
              >
                {t("login")}
              </Link>
            ) : null}
            <Action
              variant="quiet"
              onClick={() => setDrawerOpen(true)}
              className={
                studentShell
                  ? "px-3! hidden! md:inline-flex! lg:hidden!"
                  : "px-3! md:hidden!"
              }
              aria-label={nav("accessibility.openMenu")}
              aria-expanded={drawerOpen}
              aria-controls="shell-drawer"
            >
              <Menu size={21} aria-hidden="true" />
            </Action>
          </div>
        </div>
      </header>
      <div className="relative z-40 border-border-default! bg-surface-overlay md:border-b">
        <WorkspaceNavigation
          label={
            studentShell
              ? student("ariaLabel")
              : shellWorkspace
                ? nav("accessibility.workspace")
                : nav("accessibility.primary")
          }
          primary={primary}
          groups={groups}
          active={shellActive}
          student={studentShell}
          moreLabel={nav("accessibility.openMenu")}
          onMore={() => setDrawerOpen(true)}
          moreExpanded={drawerOpen}
        >
          {!shellWorkspace && (
            <button
              ref={subjectsTrigger}
              type="button"
              className={actionClassName("quiet", "px-3!")}
              onClick={() => setMegaOpen(!megaOpen)}
              aria-expanded={megaOpen}
              aria-controls="subjects-mega-menu"
            >
              {nav("subjects")}
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          )}
        </WorkspaceNavigation>
        {!shellWorkspace && megaOpen && (
          <div
            ref={mega}
            id="subjects-mega-menu"
            className="absolute inset-x-0 top-full border-y border-border-default! bg-surface-overlay shadow-overlay"
          >
            <div className="shell grid gap-6 py-6 md:grid-cols-3">
              <div>
                <p className="text-sm font-bold">{nav("explorePath")}</p>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {nav("exploreDescription")}
                </p>
                <Link
                  href={`/${locale}/tracks`}
                  onClick={() => setMegaOpen(false)}
                  className={actionClassName("quiet", "mt-3 px-0!")}
                >
                  {nav("allTracks")}
                  <BookOpen size={16} aria-hidden="true" />
                </Link>
              </div>
              <TaxonomyColumn
                title={nav("accessibility.grades")}
                items={taxonomy.data?.grades.map((item) => item.name) ?? []}
              />
              <TaxonomyColumn
                title={nav("accessibility.specializations")}
                items={
                  taxonomy.data?.specializations.map((item) => item.name) ?? []
                }
              />
            </div>
          </div>
        )}
      </div>
      {drawerOpen && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/65"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDrawer();
          }}
        >
          <aside
            ref={drawer}
            id="shell-drawer"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={nav("accessibility.navigationMenu")}
            className="absolute inset-y-0 end-0 flex w-[min(90vw,28rem)] flex-col border-s border-border-default! bg-surface-overlay text-text-primary shadow-overlay"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border-subtle! p-4">
              <div className="min-w-0">
                <p className="text-sm font-bold break-words">
                  {identity.shortName}
                </p>
                <p className="mt-1 text-xs text-text-muted">{shellLabel}</p>
              </div>
              <Action
                variant="quiet"
                className="shrink-0 px-3!"
                onClick={closeDrawer}
                aria-label={nav("accessibility.closeMenu")}
              >
                <X size={20} aria-hidden="true" />
              </Action>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              <Action
                variant="secondary"
                className="mb-5 w-full justify-start!"
                onClick={() => {
                  closeDrawer();
                  window.requestAnimationFrame(() => setPaletteOpen(true));
                }}
              >
                <Search size={18} aria-hidden="true" />
                {nav("accessibility.searchCourses")}
              </Action>
              <nav aria-label={nav("accessibility.menuLinks")}>
                <GroupedDestinations
                  groups={drawerGroups}
                  active={shellActive}
                  onNavigate={closeDrawer}
                />
              </nav>
              {!shellWorkspace && (
                <div className="mt-5 border-t border-border-subtle! pt-4">
                  <Link
                    href={`/${locale}/tracks`}
                    onClick={closeDrawer}
                    className={actionClassName("quiet", "px-3!")}
                  >
                    {nav("subjects")}
                  </Link>
                  <TaxonomyColumn
                    title={nav("accessibility.availableSpecializations")}
                    items={
                      taxonomy.data?.specializations.map((item) => item.name) ??
                      []
                    }
                  />
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle! p-4">
              <ThemeToggle locale={locale} />
              <Link
                href={localeSwitchPathname}
                onNavigate={preserveLocaleSwitchContext}
                className={actionClassName("quiet", "px-3!")}
                aria-label={nav("accessibility.switchLanguage")}
              >
                {alternate.toUpperCase()}
              </Link>
              {!isWorkspace && isStudent && (
                <Link
                  href={`/${locale}/cart`}
                  onClick={closeDrawer}
                  className={actionClassName("quiet", "px-3!")}
                  aria-label={nav("accessibility.cartItems", {
                    count: cartItemCount,
                  })}
                >
                  <ShoppingCart size={19} aria-hidden="true" />
                </Link>
              )}
              {isSignedIn ? (
                <>
                  <Link
                    href={accountDestination}
                    onClick={closeDrawer}
                    className={actionClassName("secondary")}
                    aria-label={accountLabel}
                  >
                    <LayoutDashboard size={18} aria-hidden="true" />
                    {nav("dashboard")}
                  </Link>
                  <Action
                    variant="quiet"
                    onClick={() => logout.mutate()}
                    pending={logout.isPending}
                    pendingLabel={nav("signingOut")}
                    aria-label={nav("accessibility.logout")}
                  >
                    <LogOut size={18} aria-hidden="true" />
                    {nav("logoutShort")}
                  </Action>
                </>
              ) : authResolved && !isAccountArea ? (
                <Link
                  href={`/${locale}/login`}
                  onClick={closeDrawer}
                  className={actionClassName("primary")}
                >
                  {t("login")}
                </Link>
              ) : null}
            </div>
          </aside>
        </div>
      )}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </>
  );
}

function TaxonomyColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-sm font-black text-foreground">{title}</p>
      <div className="mt-3 grid gap-2 text-sm text-muted">
        {items.slice(0, 6).map((item) => (
          <span key={item}>{item}</span>
        ))}
        {!items.length && <span>—</span>}
      </div>
    </div>
  );
}
