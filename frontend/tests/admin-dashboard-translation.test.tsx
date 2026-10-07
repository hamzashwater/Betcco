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
import { formatLocalizedDate } from "@/i18n/date-time";
import {
  formatLocalizedCurrency,
  formatLocalizedNumber,
  formatLocalizedPercentage,
} from "@/i18n/number-format";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import dashboard from "./fixtures/admin-dashboard.json";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/en/admin/dashboard",
}));
const clients: QueryClient[] = [];
const now = new Date("2026-10-01T12:00:00.000Z");
const from = "2026-09-01";
const to = "2026-10-01";

function renderDashboard(locale: "ar" | "en", seedInvalidRange = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  // Disabled queries can display validation alongside existing cached data.
  if (seedInvalidRange)
    client.setQueryData(
      ["admin-dashboard", "custom", "2026-10-02", to],
      dashboard,
    );
  const messages = locale === "ar" ? ar : en;
  const view = render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <AdminArea segment={[]} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { ...view, client, messages, copy: messages.adminWorkspace };
}
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now.getTime());
  const RealDate = Date;
  vi.stubGlobal(
    "Date",
    class extends RealDate {
      constructor(value?: string | number | Date) {
        super(
          value === undefined
            ? now.getTime()
            : value instanceof RealDate
              ? value.getTime()
              : value,
        );
      }
      static now() {
        return now.getTime();
      }
    },
  );
  apiMock.mockReset().mockResolvedValue(dashboard);
});
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(["ar", "en"] as const)(
  "Admin Dashboard %s — mocked UI-contract evidence",
  (locale) => {
    it("renders headers, every period, raw metric values, formatter output and all 18 navigation cards", async () => {
      const { copy, client, container, messages } = renderDashboard(locale);
      await screen.findByRole("heading", { name: copy.dashboard.title });
      expect(screen.getByText(copy.dashboard.description)).toBeVisible();
      expect(screen.getByText(copy.dashboard.eyebrow)).toBeVisible();
      expect(screen.getByText(copy.dashboard.periodExplanation)).toBeVisible();
      for (const label of Object.values(copy.dashboard.periods))
        expect(screen.getByRole("button", { name: label })).toBeVisible();
      expect(apiMock).toHaveBeenCalledExactlyOnceWith(
        "/admin/dashboard?period=30d",
      );
      expect(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      ).toEqual([["admin-dashboard", "30d", from, to]]);
      const values = [
        101,
        92,
        13,
        12,
        24,
        21,
        37,
        150,
        48,
        9,
        formatLocalizedPercentage(36.5, locale),
        3,
        5,
        4,
        formatLocalizedCurrency(1234.125, "JOD", locale),
        17,
        16,
        2,
      ];
      Object.values(copy.dashboard.metrics).forEach((label, i) => {
        const card = screen
          .getAllByText(label, { exact: true })
          .find((el) => el.closest("article")?.querySelector("p.mt-2"));
        expect(card).toBeDefined();
        expect(
          card!.closest("article")!.querySelector("p.mt-2")?.textContent,
        ).toBe(String(values[i]));
      });
      for (const [key, entry] of Object.entries(copy.navigation)) {
        const href = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
        const link = container.querySelector(
          `a[href="/${locale}/admin/${href}"]`,
        )!;
        expect(
          within(link as HTMLElement).getByRole("heading", {
            name: entry.title,
          }),
        ).toBeVisible();
        expect(
          within(link as HTMLElement).getByText(entry.description),
        ).toBeVisible();
        expect(
          within(link as HTMLElement).getByText(copy.shared.open),
        ).toBeVisible();
      }
      for (const [href, entry] of [
        ["academic-catalogue", messages.academicCatalogue],
        ["delivery-planning", messages.deliveryPlanning],
      ] as const) {
        const link = container.querySelector(
          `a[href="/${locale}/admin/${href}"]`,
        )!;
        expect(
          within(link as HTMLElement).getByText(entry.title),
        ).toBeVisible();
        expect(
          within(link as HTMLElement).getByText(entry.description),
        ).toBeVisible();
      }
      expect(container.querySelectorAll("a")).toHaveLength(18);
    });
    it("localizes sign-in/error and loading states", async () => {
      apiMock.mockRejectedValue(new Error("RAW backend error"));
      const { copy } = renderDashboard(locale);
      expect(screen.getByText(copy.shared.loadingIndicator)).toBeVisible();
      expect(await screen.findByText(copy.dashboard.signIn)).toBeVisible();
      expect(screen.queryByText("RAW backend error")).not.toBeInTheDocument();
    });
    it("keeps the 7d period value and exact request", async () => {
      const { copy, client } = renderDashboard(locale);
      await screen.findByRole("heading", { name: copy.dashboard.title });
      fireEvent.click(
        screen.getByRole("button", { name: copy.dashboard.periods.sevenDays }),
      );
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith("/admin/dashboard?period=7d"),
      );
      expect(
        client
          .getQueryCache()
          .find({ queryKey: ["admin-dashboard", "7d", from, to], exact: true }),
      ).toBeDefined();
      expect(
        await screen.findByRole("button", {
          name: copy.dashboard.periods.sevenDays,
        }),
      ).toHaveAttribute("aria-pressed", "true");
    });
    it("preserves encoded UTC bounds, initialization and input constraints for custom dates", async () => {
      const { copy } = renderDashboard(locale);
      await screen.findByRole("heading", { name: copy.dashboard.title });
      fireEvent.click(
        screen.getByRole("button", { name: copy.dashboard.periods.custom }),
      );
      const start = await screen.findByLabelText(copy.dashboard.from);
      const end = screen.getByLabelText(copy.dashboard.to);
      expect(start).toHaveValue(from);
      expect(end).toHaveValue(to);
      expect(start).toHaveAttribute("max", to);
      expect(end).toHaveAttribute("min", from);
      expect(end).toHaveAttribute("max", to);
      expect(apiMock).toHaveBeenCalledWith(
        "/admin/dashboard?period=custom&fromUtc=2026-09-01T00%3A00%3A00.000Z&toUtc=2026-10-01T23%3A59%3A59.999Z",
      );
      fireEvent.change(start, { target: { value: "2026-09-15" } });
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/admin/dashboard?period=custom&fromUtc=2026-09-15T00%3A00%3A00.000Z&toUtc=2026-10-01T23%3A59%3A59.999Z",
        ),
      );
    });
    it("disables invalid custom requests and translates validation when cached data exists", async () => {
      const { copy, client } = renderDashboard(locale, true);
      await screen.findByRole("heading", { name: copy.dashboard.title });
      fireEvent.click(
        screen.getByRole("button", { name: copy.dashboard.periods.custom }),
      );
      const start = await screen.findByLabelText(copy.dashboard.from);
      apiMock.mockClear();
      fireEvent.change(start, { target: { value: "2026-10-02" } });
      expect(await screen.findByRole("alert")).toHaveTextContent(
        copy.dashboard.invalidRange,
      );
      expect(apiMock).not.toHaveBeenCalled();
      expect(
        client
          .getQueryCache()
          .find({
            queryKey: ["admin-dashboard", "custom", "2026-10-02", to],
            exact: true,
          })
          ?.isDisabled(),
      ).toBe(true);
    });
    it("preserves the existing pending state for an uncached invalid range without making a request", async () => {
      const { copy, client, container } = renderDashboard(locale);
      await screen.findByRole("heading", { name: copy.dashboard.title });
      fireEvent.click(
        screen.getByRole("button", { name: copy.dashboard.periods.custom }),
      );
      const start = await screen.findByLabelText(copy.dashboard.from);
      apiMock.mockClear();
      fireEvent.change(start, { target: { value: "2026-10-02" } });
      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
      expect(apiMock).not.toHaveBeenCalled();
      expect(
        client
          .getQueryCache()
          .find({
            queryKey: ["admin-dashboard", "custom", "2026-10-02", to],
            exact: true,
          })
          ?.isDisabled(),
      ).toBe(true);
    });
    it("localizes analytics and preserves totals, date tooltips and bar calculations", async () => {
      const { copy } = renderDashboard(locale);
      const heading = await screen.findByRole("heading", {
        name: copy.analytics.title,
      });
      const section = within(heading.closest("section")!);
      expect(section.getByText(copy.analytics.description)).toBeVisible();
      for (const [key, label, total] of [
        ["revenue", copy.analytics.revenue, 25.125],
        ["paidOrders", copy.analytics.paidOrders, 2],
        ["lessonActivity", copy.analytics.lessonActivity, 8],
      ] as const) {
        const chart = section.getByLabelText(label);
        expect(section.getByRole("heading", { name: label })).toBeVisible();
        const formatted =
          key === "revenue"
            ? formatLocalizedCurrency(total, "JOD", locale)
            : formatLocalizedNumber(total, locale);
        expect(
          chart.closest("article")!.querySelector("span.text-xs")?.textContent,
        ).toBe(formatted);
        const day = formatLocalizedDate(dashboard.trend[0].dateUtc, locale, {
          month: "short",
          day: "numeric",
        });
        const bar = chart.children[0];
        expect(bar).toHaveAttribute("title", `${day}: ${formatted}`);
        expect(bar.firstElementChild).toHaveStyle({ height: "100%" });
        expect(chart.children[1].firstElementChild).toHaveStyle({
          height: "3%",
        });
      }
      expect(section.getAllByText(copy.analytics.hint)).toHaveLength(3);
    });
    it("localizes an empty analytics trend", async () => {
      apiMock.mockResolvedValue({ ...dashboard, trend: [] });
      const { copy } = renderDashboard(locale);
      expect(await screen.findByText(copy.analytics.empty)).toBeVisible();
      expect(screen.queryByText(copy.analytics.hint)).not.toBeInTheDocument();
    });
  },
);
