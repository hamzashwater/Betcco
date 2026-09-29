"use client";

import { CommandPalette } from "@/components/navigation/command-palette";
import { NotificationCenter } from "@/components/navigation/notification-center";
import { BrandLogo } from "@/components/brand-logo";
import { ApiError, api, invalidateCsrfToken } from "@/lib/api";
import {
  publicBrandSettingsQueryKey,
  resolveBrandSettings,
  type BrandSettings,
} from "@/lib/brand";
import { getGsap, motionIsReduced } from "@/lib/gsap";
import { useGSAP } from "@gsap/react";
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

  useGSAP(
    () => {
      if (!megaOpen || !mega.current || motionIsReduced()) return;
      getGsap().from(mega.current, {
        opacity: 0,
        y: -8,
        filter: "blur(5px)",
        duration: 0.22,
        ease: "power2.out",
      });
    },
    { scope: mega, dependencies: [megaOpen] },
  );
  useGSAP(
    () => {
      if (!drawerOpen || !drawer.current || motionIsReduced()) return;
      getGsap().fromTo(
        drawer.current,
        { xPercent: locale === "ar" ? 104 : -104 },
        { xPercent: 0, duration: 0.3, ease: "power3.out" },
      );
    },
    { scope: drawer, dependencies: [drawerOpen, locale] },
  );
  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) =>
      event.key === "Escape" && setDrawerOpen(false);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [drawerOpen]);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);
  const active = (href: string, exact = false) =>
    exact
      ? pathname === href || (isWorkspace && pathname === `${href}/dashboard`)
      : pathname === href || pathname.startsWith(`${href}/`);
  const closeDrawer = () => setDrawerOpen(false);
  return (
    <>
      <header
        className="elevated-surface sticky top-0 z-50 border-b border-border backdrop-blur-xl"
        onMouseLeave={() => setMegaOpen(false)}
      >
        <div className="shell flex min-h-[4.5rem] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={brandDestination}
              className="focus-ring inline-flex shrink-0 items-center"
              aria-label={
                isWorkspace
                  ? nav("accessibility.brandBack", {
                      brand: brand.BrandName,
                      workspace: workspaceLabel,
                    })
                  : brand.BrandName
              }
            >
              <span className="block w-[7.5rem] sm:w-36">
                <BrandLogo
                  variant="horizontal"
                  src={brand.Logo}
                  alt={brand.BrandName}
                  priority
                  className="brand-logo-on-light w-full"
                />
                <BrandLogo
                  variant="dark"
                  src={brand.DarkModeLogo}
                  alt={brand.BrandName}
                  priority
                  className="brand-logo-on-dark w-full"
                />
              </span>
            </Link>
            {isWorkspace && (
              <span className="hidden border-s border-border ps-3 text-sm font-bold text-muted sm:inline">
                {workspaceLabel}
              </span>
            )}
          </div>

          {!isWorkspace && (
            <nav
              aria-label={nav("accessibility.primary")}
              className="hidden items-center gap-1 lg:flex"
            >
              {publicNavLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`focus-ring relative rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${link.compact ? "hidden xl:inline-flex" : ""} ${active(link.href, link.exact) ? "text-primary" : "text-muted hover:text-foreground"}`}
                >
                  {link.label}
                  {active(link.href, link.exact) && (
                    <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />
                  )}
                </Link>
              ))}
              <button
                type="button"
                aria-expanded={megaOpen}
                aria-controls="subjects-mega-menu"
                onClick={() => setMegaOpen((value) => !value)}
                className={`focus-ring inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold ${megaOpen ? "text-primary" : "text-muted hover:text-foreground"}`}
              >
                {nav("subjects")}
                <ChevronDown
                  size={15}
                  className={
                    megaOpen
                      ? "rotate-180 transition-transform"
                      : "transition-transform"
                  }
                  aria-hidden="true"
                />
              </button>
            </nav>
          )}

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="focus-ring hidden items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-white/5 hover:text-foreground sm:inline-flex"
              aria-label={nav("search")}
            >
              <Search size={18} />
              <span className="hidden xl:inline">{nav("search")}</span>
              <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted xl:inline">
                Ctrl K
              </kbd>
            </button>
            <ThemeToggle locale={locale} />
            <Link
              href={localeSwitchPathname}
              onNavigate={preserveLocaleSwitchContext}
              className="focus-ring hidden rounded-lg px-2.5 py-2 text-xs font-black text-muted hover:bg-white/5 hover:text-foreground sm:inline-flex"
              aria-label={nav("accessibility.switchLanguage")}
            >
              {alternate.toUpperCase()}
            </Link>
            <NotificationCenter locale={locale} enabled={isSignedIn} />
            {!isWorkspace && isStudent && (
              <Link
                href={`/${locale}/cart`}
                className="focus-ring relative inline-flex rounded-lg p-2 text-primary hover:bg-white/5"
                aria-label={nav("accessibility.cartItems", {
                  count: cartItemCount,
                })}
              >
                <ShoppingCart size={20} aria-hidden="true" />
                {cartItemCount > 0 && (
                  <span
                    className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-5 text-white"
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
                  className="focus-ring hidden items-center gap-2 rounded-lg bg-primary/15 px-3 py-2 text-sm font-bold text-primary hover:bg-primary/25 sm:inline-flex"
                  title={accountLabel}
                >
                  <LayoutDashboard size={17} aria-hidden="true" />
                  <span className="max-w-32 truncate">
                    {visibleAccountRole === "student"
                      ? `${accountLabel}: ${user.data?.displayName ?? ""}`
                      : user.data?.displayName}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => logout.mutate()}
                  disabled={logout.isPending}
                  aria-busy={logout.isPending}
                  className="focus-ring hidden items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-muted hover:bg-red-500/10 hover:text-red-400 disabled:cursor-wait disabled:opacity-60 md:inline-flex"
                  aria-label={nav("accessibility.logout")}
                  title={nav("accessibility.logout")}
                >
                  <LogOut size={17} aria-hidden="true" />
                  <span className="hidden 2xl:inline">
                    {logout.isPending ? nav("signingOut") : nav("logoutShort")}
                  </span>
                </button>
              </>
            ) : authResolved && !isAccountArea ? (
              <Link
                className="focus-ring hidden rounded-lg bg-primary px-3 py-2 text-sm font-bold text-slate-950 sm:inline-flex"
                href={`/${locale}/login`}
              >
                {t("login")}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="focus-ring rounded-lg p-2 text-foreground lg:hidden"
              aria-label={nav("accessibility.openMenu")}
              aria-expanded={drawerOpen}
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
        {isWorkspace && (
          <nav
            className="hidden border-t border-border bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] lg:block"
            aria-label={nav("accessibility.workspace")}
          >
            <div className="shell flex min-h-12 items-center gap-1 overflow-x-auto py-1">
              {workspaceNavLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`focus-ring shrink-0 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${active(link.href, link.exact) ? "bg-primary/15 text-primary" : "text-muted hover:bg-white/5 hover:text-foreground"}`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        )}
        {!isWorkspace && megaOpen && (
          <div
            ref={mega}
            id="subjects-mega-menu"
            className="elevated-surface absolute inset-x-0 top-full hidden border-y border-border shadow-2xl backdrop-blur-xl lg:block"
          >
            <div className="shell grid gap-8 py-6 md:grid-cols-[0.8fr_1fr_1fr]">
              <div>
                <p className="text-sm font-black text-primary">
                  {nav("explorePath")}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {nav("exploreDescription")}
                </p>
                <Link
                  href={`/${locale}/tracks`}
                  onClick={() => setMegaOpen(false)}
                  className="focus-ring mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary"
                >
                  {nav("allTracks")}
                  <BookOpen size={16} />
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
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden" role="presentation">
          <div
            className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm"
            onMouseDown={closeDrawer}
          />
          <aside
            ref={drawer}
            role="dialog"
            aria-modal="true"
            aria-label={nav("accessibility.navigationMenu")}
            className="glass-panel absolute inset-y-0 end-0 flex w-[min(88vw,23rem)] flex-col overflow-y-auto border-y-0 border-e-0 p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <BrandLogo
                  variant="icon"
                  src={brand.Favicon}
                  alt={brand.BrandName}
                  className="size-9"
                />
                <span className="font-black text-foreground">
                  {brand.BrandShortName}
                </span>
              </span>
              <button
                type="button"
                onClick={closeDrawer}
                className="focus-ring rounded-lg p-2 text-muted hover:text-foreground"
                aria-label={nav("accessibility.closeMenu")}
              >
                <X size={21} />
              </button>
            </div>
            {!isWorkspace && (
              <button
                type="button"
                onClick={() => {
                  setPaletteOpen(true);
                  closeDrawer();
                }}
                className="focus-ring mt-6 flex items-center gap-3 rounded-xl border border-border bg-white/5 px-3 py-3 text-start text-sm text-muted"
              >
                <Search size={18} />
                {nav("accessibility.searchCourses")}
              </button>
            )}
            <nav
              className={`${isWorkspace ? "mt-6" : "mt-5"} grid gap-1`}
              aria-label={nav("accessibility.menuLinks")}
            >
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeDrawer}
                  className={`focus-ring rounded-xl px-3 py-3 text-sm font-bold ${active(link.href, link.exact) ? "bg-primary/15 text-primary" : "text-foreground hover:bg-white/5"}`}
                >
                  {link.label}
                </Link>
              ))}
              {!isWorkspace && (
                <Link
                  href={`/${locale}/tracks`}
                  onClick={closeDrawer}
                  className="focus-ring rounded-xl px-3 py-3 text-sm font-bold text-foreground hover:bg-white/5"
                >
                  {nav("subjects")}
                </Link>
              )}
            </nav>
            {!isWorkspace && (
              <div className="mt-7 border-t border-border pt-5">
                <p className="text-xs font-bold uppercase tracking-wider text-muted">
                  {nav("accessibility.availableSpecializations")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(taxonomy.data?.specializations ?? []).map((item) => (
                    <span
                      key={item.id}
                      className="rounded-full border border-border bg-white/5 px-3 py-1 text-xs text-muted"
                    >
                      {item.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-auto grid gap-3 pt-8">
              {isSignedIn ? (
                <>
                  <Link
                    onClick={closeDrawer}
                    href={accountDestination}
                    className="focus-ring rounded-xl bg-primary px-4 py-3 text-center font-bold text-slate-950"
                  >
                    {nav("dashboard")}
                  </Link>
                  <button
                    type="button"
                    onClick={() => logout.mutate()}
                    disabled={logout.isPending}
                    aria-busy={logout.isPending}
                    className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/35 px-4 py-3 text-sm font-bold text-red-400 hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-60"
                  >
                    <LogOut size={17} aria-hidden="true" />
                    {logout.isPending
                      ? nav("signingOut")
                      : nav("accessibility.logout")}
                  </button>
                </>
              ) : authResolved && !isAccountArea ? (
                <Link
                  onClick={closeDrawer}
                  href={`/${locale}/login`}
                  className="focus-ring rounded-xl bg-primary px-4 py-3 text-center font-bold text-slate-950"
                >
                  {t("login")}
                </Link>
              ) : null}
              <Link
                onClick={closeDrawer}
                href={localeSwitchPathname}
                onNavigate={preserveLocaleSwitchContext}
                className="focus-ring rounded-xl border border-border px-4 py-3 text-center text-sm font-bold"
              >
                {alternate.toUpperCase()}
              </Link>
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
