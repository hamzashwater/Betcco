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

const { apiMock, route, router } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  route: { path: "/en/teachers" },
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

function mount(locale: "en" | "ar", section: string, student = false) {
  route.path = `/${locale}/${section}`;
  apiMock.mockImplementation((path: string) => {
    if (path === "/auth/me")
      return student
        ? Promise.resolve({
            displayName: "Synthetic student",
            roles: ["Student"],
          })
        : Promise.reject(new ApiError(401, "Unauthenticated"));
    if (path.startsWith("/settings/public")) return Promise.resolve({});
    if (path.startsWith("/taxonomy"))
      return Promise.resolve({ grades: [], specializations: [] });
    if (path.startsWith("/cart")) return Promise.resolve({ items: [] });
    if (path === "/notifications") return Promise.resolve([]);
    throw new Error(`Unexpected query: ${path}`);
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
        <SiteNavigation />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return client;
}

describe.each(["en", "ar"] as const)(
  "Teacher section boundary in %s",
  (locale) => {
    const copy = locale === "ar" ? ar : en;

    it.each([
      "teacher",
      "teacher/",
      "teacher/courses",
      "teacher/students",
      "teacher/evaluations",
      "teacher/wallet",
      "teacher/profile",
      "teacher/security",
      "teacher/courses/course-raw",
    ])(
      "keeps resolved guests in protected Teacher workspace for /%s",
      async (section) => {
        mount(locale, section);
        await waitFor(() =>
          expect(router.replace).toHaveBeenCalledWith(`/${locale}/login`),
        );
        expect(document.querySelector("header a")).toHaveAttribute(
          "href",
          `/${locale}/teacher/dashboard`,
        );
        expect(
          screen.getByRole("navigation", {
            name: copy.navigation.accessibility.workspace,
          }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole("navigation", {
            name: copy.navigation.accessibility.primary,
          }),
        ).not.toBeInTheDocument();
        expect(
          apiMock.mock.calls.some(
            ([path]) =>
              path.startsWith("/taxonomy") || path.startsWith("/cart"),
          ),
        ).toBe(false);
      },
    );

    // Collision descendants are classification inputs, not new production routes.
    it.each([
      "teachers",
      "teachers/example",
      "teachers/example/details",
      "teacherish",
      "teacher-other",
    ])(
      "keeps /%s public, without the Teacher account redirect",
      async (section) => {
        mount(locale, section);
        expect(
          await screen.findByRole("link", { name: copy.login }),
        ).toHaveAttribute("href", `/${locale}/login`);
        expect(router.replace).not.toHaveBeenCalled();
        expect(document.querySelector("header a")).toHaveAttribute(
          "href",
          `/${locale}`,
        );
        const navigation = screen.getByRole("navigation", {
          name: copy.navigation.accessibility.primary,
        });
        expect(
          within(navigation)
            .getAllByRole("link")
            .map((link) => link.getAttribute("href")),
        ).toEqual([`/${locale}`, `/${locale}/courses`, `/${locale}/tracks`]);
        expect(
          screen.queryByRole("navigation", {
            name: copy.navigation.accessibility.workspace,
          }),
        ).not.toBeInTheDocument();
        await userEvent.setup().click(
          screen.getByRole("button", {
            name: copy.navigation.accessibility.openMenu,
          }),
        );
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith(`/taxonomy?locale=${locale}`),
        );
        expect(
          within(screen.getByRole("dialog"))
            .getAllByRole("link")
            .some((link) =>
              link.getAttribute("href")?.startsWith(`/${locale}/teacher/`),
            ),
        ).toBe(false);
        expect(router.replace).not.toHaveBeenCalled();
        expect(
          apiMock.mock.calls.some(([path]) => path.startsWith("/cart")),
        ).toBe(false);
      },
    );

    it("retains public cart and taxonomy eligibility for a signed-in Student on /teachers", async () => {
      const client = mount(locale, "teachers", true);
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(`/cart?locale=${locale}`),
      );
      expect(client.getQueryState(["current-user"])?.status).toBe("success");
      expect(document.querySelector("header a")).toHaveAttribute(
        "href",
        `/${locale}`,
      );
      expect(
        document.querySelector(`header a[href="/${locale}/student/dashboard"]`),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("navigation", {
          name: copy.navigation.accessibility.primary,
        }),
      ).toBeInTheDocument();
      await userEvent.setup().click(
        screen.getByRole("button", {
          name: copy.navigation.accessibility.openMenu,
        }),
      );
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(`/taxonomy?locale=${locale}`),
      );
      expect(router.replace).not.toHaveBeenCalled();
    });

    it.each([
      "admin",
      "admin/evaluations",
      "support",
      "support/accounts",
      "student",
      "student/courses",
    ])("preserves resolved-guest account behavior for /%s", async (section) => {
      mount(locale, section);
      await waitFor(() =>
        expect(router.replace).toHaveBeenCalledWith(`/${locale}/login`),
      );
      expect(
        screen.queryByRole("link", { name: copy.login }),
      ).not.toBeInTheDocument();
    });
  },
);
