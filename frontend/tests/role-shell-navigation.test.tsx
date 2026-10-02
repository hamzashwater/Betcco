import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteNavigation } from "@/components/site-navigation";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
const { apiMock, route, router } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  route: { path: "/en/student/courses" },
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => route.path,
  useRouter: () => router,
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: apiMock,
}));
function setup(role = "Student", path = "/en/student/courses", settings = {}) {
  route.path = path;
  const locale = path.split("/")[1];
  apiMock.mockImplementation((url: string) => {
    if (url === "/auth/me")
      return Promise.resolve({ displayName: "Test account", roles: [role] });
    if (url.startsWith("/settings/public")) return Promise.resolve(settings);
    if (url === "/notifications") return Promise.resolve([]);
    if (url.startsWith("/taxonomy"))
      return Promise.resolve({ grades: [], specializations: [] });
    return Promise.resolve({ items: [] });
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ar" ? ar : en}
    >
      <QueryClientProvider client={client}>
        <SiteNavigation />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  apiMock.mockReset();
  vi.clearAllMocks();
});
describe("role shell destinations", () => {
  it.each([
    ["en", "Student workspace navigation", "My courses", "Open menu"],
    [
      "ar",
      "تنقل مساحة الطالب",
      ar.studentWorkspace.navigation.courses,
      ar.navigation.accessibility.openMenu,
    ],
  ])(
    "groups Student navigation in %s",
    async (locale, label, courses, menu) => {
      setup("Student", `/${locale}/student/courses`);
      await screen.findByRole("link", {
        name:
          locale === "ar"
            ? ar.navigation.account.student
            : en.navigation.account.student,
      });
      // Desktop and bounded mobile landmarks share the same four real URLs.
      const navs = screen.getAllByRole("navigation", {
        name:
          locale === "ar" ? ar.studentWorkspace.navigation.ariaLabel : label,
      });
      for (const nav of navs) {
        const links = within(nav).getAllByRole("link");
        expect(links).toHaveLength(4);
        expect(links.map((a) => a.getAttribute("href"))).toEqual(
          ["", "/courses", "/evaluations", "/planner"].map(
            (s) => `/${locale}/student${s}`,
          ),
        );
        expect(
          within(nav).getByRole("link", { name: courses }),
        ).toHaveAttribute("aria-current", "page");
      }
      expect(
        screen.queryByRole("link", {
          name:
            locale === "ar"
              ? ar.studentWorkspace.navigation.notes
              : en.studentWorkspace.navigation.notes,
        }),
      ).not.toBeInTheDocument();
      const u = userEvent.setup();
      await u.click(screen.getAllByRole("button", { name: menu }).at(-1)!);
      const drawer = screen.getByRole("dialog");
      expect(
        within(drawer).getByRole("link", {
          name:
            locale === "ar"
              ? ar.studentWorkspace.navigation.notes
              : en.studentWorkspace.navigation.notes,
        }),
      ).toHaveAttribute("href", `/${locale}/student/notes`);
      const destinations = within(
        within(drawer).getByRole("navigation"),
      ).getAllByRole("link");
      expect(destinations).toHaveLength(13);
      expect(
        destinations.every((a) =>
          a.getAttribute("href")?.startsWith(`/${locale}/student`),
        ),
      ).toBe(true);
    },
  );
  it.each([
    "/en/student/dashboard",
    "/en/student/learn/course/lesson",
    "/en/student/evaluations/new",
  ])("identifies current destination at %s", async (path) => {
    setup("Student", path);
    await screen.findByRole("link", { name: "Student account" });
    const expected = path.includes("/learn/")
      ? "My courses"
      : path.includes("/evaluations/")
        ? "My evaluations"
        : "Overview";
    for (const nav of screen.getAllByRole("navigation", {
      name: "Student workspace navigation",
    }))
      expect(within(nav).getByRole("link", { name: expected })).toHaveAttribute(
        "aria-current",
        "page",
      );
  });
  it.each([
    [
      "Teacher",
      "/en/teacher/students",
      "Teacher account",
      "Student follow-up",
      "/en/teacher/wallet",
    ],
    [
      "Admin",
      "/en/admin/evaluations",
      "Admin account",
      "Evaluations",
      "/en/admin/account-identities",
    ],
    [
      "SupportAdmin",
      "/en/support/accounts",
      "Support administrator account",
      "Accounts",
      "/en/support/security",
    ],
  ])(
    "preserves %s destinations",
    async (role, path, account, primary, secondary) => {
      setup(role, path);
      await screen.findByRole("link", { name: account });
      const u = userEvent.setup();
      await u.click(screen.getByRole("button", { name: "Open menu" }));
      const drawer = screen.getByRole("dialog");
      expect(
        within(drawer).getByRole("link", { name: primary }),
      ).toHaveAttribute("aria-current", "page");
      expect(
        within(drawer)
          .getAllByRole("link")
          .some((a) => a.getAttribute("href") === secondary),
      ).toBe(true);
    },
  );
  it("keeps the existing coordinator-only destination filter", async () => {
    setup("CourseReviewer", "/en/admin/evaluations");
    await screen.findByRole("link", { name: "Assessment coordination" });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Open menu" }));
    const nav = within(screen.getByRole("dialog")).getByRole("navigation");
    expect(
      within(nav)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual([
      "/en/admin/evaluations",
      "/en/admin/profile",
      "/en/admin/security",
    ]);
  });
  it("closes the drawer on Escape, traps Tab, restores the opener and scroll", async () => {
    setup();
    const u = userEvent.setup();
    await screen.findByRole("link", { name: "Student account" });
    const opener = screen.getAllByRole("button", { name: "Open menu" }).at(-1)!;
    await u.click(opener);
    const dialog = screen.getByRole("dialog");
    const close = within(dialog).getByRole("button", { name: "Close menu" });
    expect(close).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    await u.tab({ shift: true });
    expect(
      within(dialog).getByRole("button", { name: "Log out" }),
    ).toHaveFocus();
    await u.tab();
    expect(close).toHaveFocus();
    await u.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });
  it("uses configured text identity instead of the default brand", async () => {
    setup("Student", "/en/student/courses", {
      BrandName: "North Coast International Learning Academy",
      Logo: "",
      DarkModeLogo: "",
    });
    expect(
      await screen.findByRole("link", {
        name: "North Coast International Learning Academy",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("North Coast International Learning Academy").length,
    ).toBeGreaterThan(0);
  });
  it("keeps logout pending disabled", async () => {
    setup();
    await screen.findByRole("link", { name: "Student account" });
    apiMock.mockImplementation((path: string) =>
      path === "/auth/logout"
        ? new Promise(() => {})
        : Promise.resolve({ items: [] }),
    );
    const button = screen.getByRole("button", { name: "Log out" });
    await userEvent.setup().click(button);
    await waitFor(() => expect(button).toBeDisabled());
    expect(
      apiMock.mock.calls.filter(([path]) => path === "/auth/logout"),
    ).toHaveLength(1);
  });
});
