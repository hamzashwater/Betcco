import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminArea } from "@/features/admin/admin-area";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import dashboard from "./fixtures/admin-dashboard.json";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api,
}));
const clients: QueryClient[] = [];
function mount(locale: "en" | "ar") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? ar : en}
      >
        <AdminArea segment={[]} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue(dashboard);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
});
describe.each(["en", "ar"] as const)(
  "%s Admin operational launch surface",
  (locale) => {
    const m = locale === "ar" ? ar : en,
      p = m.adminHomePresentation,
      t = m.adminWorkspace;
    it("prioritizes only the four supplied operations; keeps current and period metrics distinct and original destinations discoverable", async () => {
      mount(locale);
      await screen.findByRole("heading", { name: t.dashboard.title });
      const ops = screen.getByRole("region", { name: p.operations }),
        context = screen.getByRole("region", { name: p.currentContext }),
        period = screen.getByRole("region", { name: p.periodActivity });
      expect(
        ops.compareDocumentPosition(context) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        context.compareDocumentPosition(period) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      const links = within(ops).getAllByRole("link");
      expect(links.map((l) => l.getAttribute("href"))).toEqual(
        ["course-approvals", "evaluations", "evaluations", "gradebook"].map(
          (h) => `/${locale}/admin/${h}`,
        ),
      );
      [3, 4, 5, 9].forEach((v, i) =>
        expect(
          within(links[i]).getByText(String(v), { exact: true }),
        ).toBeVisible(),
      );
      expect(
        within(ops).getByText(t.dashboard.metrics.pendingReviews),
      ).toBeVisible();
      expect(
        within(context).queryByText(t.dashboard.metrics.activeStudents),
      ).not.toBeInTheDocument();
      expect(
        within(period).getByText(t.dashboard.metrics.activeStudents),
      ).toBeVisible();
      expect(
        within(context).getByText(t.dashboard.metrics.activeTeachers),
      ).toBeVisible();
      expect(
        within(period).queryByText(t.dashboard.metrics.activeTeachers),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: new RegExp(p.legacyRetakes) }),
      ).toHaveAttribute("href", `/${locale}/admin/retakes`);
      expect(
        within(ops).queryByText(m.navigation.admin.support),
      ).not.toBeInTheDocument();
      expect(api).toHaveBeenCalledExactlyOnceWith(
        "/admin/dashboard?period=30d",
      );
    });
    it("preserves every preset period request and selection while retaining supplied current counts", async () => {
      mount(locale);
      await screen.findByRole("heading", { name: t.dashboard.title });
      for (const [value, label] of [
        ["today", t.dashboard.periods.today],
        ["7d", t.dashboard.periods.sevenDays],
        ["30d", t.dashboard.periods.thirtyDays],
        ["3m", t.dashboard.periods.threeMonths],
        ["year", t.dashboard.periods.year],
        ["all", t.dashboard.periods.all],
      ]) {
        fireEvent.click(screen.getByRole("button", { name: label }));
        await waitFor(() =>
          expect(api).toHaveBeenCalledWith(`/admin/dashboard?period=${value}`),
        );
        const button = await screen.findByRole("button", { name: label });
        expect(button).toHaveAttribute("aria-pressed", "true");
        const links = within(
          screen.getByRole("region", { name: p.operations }),
        ).getAllByRole("link");
        [3, 4, 5, 9].forEach((v, i) =>
          expect(
            within(links[i]).getByText(String(v), { exact: true }),
          ).toBeVisible(),
        );
      }
      expect(
        api.mock.calls.every(
          ([path, options]) =>
            path.startsWith("/admin/dashboard?period=") && !options?.method,
        ),
      ).toBe(true);
    });
    it("renders successful supplied zero values and empty trend without manufacturing a support/backlog count", async () => {
      const zero = { ...dashboard, trend: [] };
      for (const key of Object.keys(zero) as (keyof typeof zero)[])
        if (typeof zero[key] === "number") Object.assign(zero, { [key]: 0 });
      api.mockResolvedValue(zero);
      mount(locale);
      await screen.findByRole("heading", { name: t.dashboard.title });
      const ops = screen.getByRole("region", { name: p.operations });
      for (const link of within(ops).getAllByRole("link"))
        expect(within(link).getByText("0", { exact: true })).toBeVisible();
      expect(screen.getByText(t.analytics.empty)).toBeVisible();
      expect(api.mock.calls.map((c) => c[0])).toEqual([
        "/admin/dashboard?period=30d",
      ]);
    });
  },
);
