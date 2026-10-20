import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteNavigation } from "@/components/site-navigation";
import { ApiError } from "@/lib/api";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import {
  roleNavigationFixtures,
  studentDestinations,
} from "./fixtures/role-navigation";

const { apiMock, route, router } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  route: { path: "/en/teacher/courses" },
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
const clients: QueryClient[] = [];
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});
function mount(locale: "en" | "ar", roles: string[], path: string) {
  route.path = `/${locale}/${path}`;
  apiMock.mockImplementation((url: string) => {
    if (url === "/auth/me")
      return roles.length
        ? Promise.resolve({ displayName: "Synthetic account", roles })
        : Promise.reject(new ApiError(401, "Unauthenticated"));
    if (url.startsWith("/settings/public")) return Promise.resolve({});
    if (url.startsWith("/taxonomy"))
      return Promise.resolve({ grades: [], specializations: [] });
    if (url === "/notifications") return Promise.resolve([]);
    if (url.startsWith("/cart") || url.startsWith("/catalog/courses"))
      return Promise.resolve({ items: [] });
    throw new Error(`Unexpected query ${url}`);
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ar" ? ar : en}
    >
      <QueryClientProvider client={client}>
        <div>
          <SiteNavigation />
          <main data-testid="background">
            <button>Outside action</button>
          </main>
        </div>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return client;
}
describe.each(["en", "ar"] as const)("role navigation IA in %s", (locale) => {
  const m = locale === "ar" ? ar : en;
  const menu = m.navigation.accessibility.openMenu;
  const opener = () => screen.getAllByRole("button", { name: menu }).at(-1)!;
  it.each(roleNavigationFixtures)(
    "keeps the exact $name route set in drawer and local palette",
    async (fixture) => {
      const client = mount(locale, fixture.roles, fixture.path);
      await waitFor(() => expect(client.isFetching()).toBe(0));
      const root = `/${locale}${fixture.section ? "/" + fixture.section : ""}`;
      const expected = fixture.destinations
        .map((x) => root + (x ? "/" + x : ""))
        .sort();
      const sidebar = document.getElementById("staff-workspace-navigation");
      if (["admin", "teacher"].includes(fixture.section)) {
        expect(sidebar).toBeInTheDocument();
        expect(
          [...sidebar!.querySelectorAll("nav a")]
            .map((a) => a.getAttribute("href"))
            .sort(),
        ).toEqual(expected);
      } else expect(sidebar).not.toBeInTheDocument();
      const u = userEvent.setup();
      await u.click(opener());
      const dialog = screen.getByRole("dialog");
      const navigation = within(dialog).getByRole("navigation");
      const links = within(navigation).getAllByRole("link");
      expect(links.map((a) => a.getAttribute("href")).sort()).toEqual(expected);
      const labels = links.map((a) => a.textContent);
      if (fixture.name === "Student") {
        expect(links.map((a) => a.getAttribute("href"))).toEqual(
          studentDestinations.map((x) => root + (x ? "/" + x : "")),
        );
        expect(
          within(navigation).getByRole("link", {
            name: m.studentWorkspace.navigation.aiPractice,
          }),
        ).toHaveAttribute("href", `/${locale}/student/ai-practice`);
      }
      await u.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      const before = apiMock.mock.calls.map(([url]) => url);
      await u.keyboard("{Control>}k{/Control}");
      const palette = await screen.findByRole("dialog", {
        name: m.navigation.commandPalette.label,
      });
      const choices = within(palette)
        .getAllByRole("button")
        .filter(
          (button) =>
            button.getAttribute("aria-label") !==
            m.navigation.commandPalette.close,
        );
      const localCount = fixture.roles.length ? expected.length : 0;
      expect(choices).toHaveLength(localCount + 3);
      if (localCount)
        expect(
          choices.slice(0, localCount).map((button) => button.textContent),
        ).toEqual(labels);
      expect(apiMock.mock.calls.map(([url]) => url)).toEqual(before);
      expect(router.replace).not.toHaveBeenCalled();
    },
  );

  it("keeps a nested Admin destination and its containing group current, without opening every group", async () => {
    mount(locale, ["Admin"], "admin/evaluations/request-raw");
    const sidebar = await screen.findByRole("complementary");
    const work = within(sidebar).getByRole("button", {
      name: m.navigation.roleShell.work,
    });
    expect(work).toHaveAttribute("aria-current", "true");
    expect(work).toHaveAttribute("aria-expanded", "true");
    expect(
      within(sidebar).getByRole("link", {
        name: m.navigation.admin.evaluations,
      }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(sidebar).getByRole("button", {
        name: m.navigation.roleShell.academic,
      }),
    ).toHaveAttribute("aria-expanded", "false");
    await userEvent.setup().click(work);
    expect(work).toHaveAttribute("aria-expanded", "false");
    expect(work).toHaveAttribute("aria-current", "true");
  });

  it("hides and reopens the full labeled staff sidebar with focus and layout marker restoration", async () => {
    mount(locale, ["Teacher"], "teacher/courses/course-raw");
    const u = userEvent.setup();
    const hide = await screen.findByRole("button", {
      name: m.navigation.roleShell.hideNavigation,
    });
    await u.click(hide);
    const show = screen.getByRole("button", {
      name: m.navigation.roleShell.showNavigation,
    });
    await waitFor(() => expect(show).toHaveFocus());
    expect(document.querySelector("header")).not.toHaveAttribute(
      "data-staff-shell",
    );
    expect(
      document.getElementById("staff-workspace-navigation"),
    ).toHaveAttribute("hidden");
    await u.click(show);
    await waitFor(() => expect(hide).toHaveFocus());
    expect(document.querySelector("header")).toHaveAttribute(
      "data-staff-shell",
      "teacher",
    );
    expect(
      document.getElementById("staff-workspace-navigation"),
    ).not.toHaveAttribute("hidden");
  });

  it("keeps modal initial focus, Tab/Shift+Tab, Escape, return focus and inert background", async () => {
    mount(locale, ["Teacher"], "teacher/courses");
    await screen.findByRole("link", { name: m.navigation.account.teacher });
    const u = userEvent.setup(),
      trigger = opener();
    await u.click(trigger);
    const dialog = screen.getByRole("dialog");
    const close = within(dialog).getByRole("button", {
      name: m.navigation.accessibility.closeMenu,
    });
    expect(close).toHaveFocus();
    expect(screen.getByTestId("background")).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");
    await u.tab({ shift: true });
    expect(
      within(dialog).getByRole("button", {
        name: m.navigation.accessibility.logout,
      }),
    ).toHaveFocus();
    await u.tab();
    expect(close).toHaveFocus();
    await u.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(screen.getByTestId("background")).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps eligible local destinations usable while the unchanged public catalogue search is pending", async () => {
    const client = mount(locale, ["Teacher"], "teacher/courses");
    await waitFor(() => expect(client.isFetching()).toBe(0));
    const delegate = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((url: string) =>
      url.startsWith("/catalog/courses")
        ? new Promise(() => {})
        : delegate(url),
    );
    const u = userEvent.setup(),
      trigger = screen.getByRole("button", {
        name: m.navigation.search,
      });
    const before = apiMock.mock.calls.length;
    await u.click(trigger);
    const dialog = screen.getByRole("dialog", {
      name: m.navigation.commandPalette.label,
    });
    expect(apiMock.mock.calls).toHaveLength(before);
    const term = locale === "ar" ? "طل" : "st";
    await u.type(within(dialog).getByRole("textbox"), term);
    expect(apiMock.mock.calls).toHaveLength(before + 1);
    expect(apiMock).toHaveBeenCalledWith(
      `/catalog/courses?${new URLSearchParams({ locale, search: term, pageSize: "5" })}`,
    );
    expect(
      within(dialog)
        .getAllByRole("status")
        .some((state) => state.getAttribute("aria-busy") === "true"),
    ).toBe(true);
    expect(
      within(dialog).getByRole("button", {
        name: m.teacherStudentFollowUp.navigation,
      }),
    ).toBeInTheDocument();
    await u.keyboard("{Enter}");
    expect(router.push).toHaveBeenCalledWith(`/${locale}/teacher/students`);
    expect(trigger).toHaveFocus();
  });

  it("restores a pre-existing inert background without making it interactive", async () => {
    mount(locale, ["Teacher"], "teacher/courses");
    await screen.findByRole("link", { name: m.navigation.account.teacher });
    const background = screen.getByTestId("background");
    background.setAttribute("inert", "");
    const u = userEvent.setup();
    await u.click(opener());
    await u.keyboard("{Escape}");
    expect(background).toHaveAttribute("inert");
  });
});
