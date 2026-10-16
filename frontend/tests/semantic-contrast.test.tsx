import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { BookOpen } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ActionCard,
  DashboardHeader,
  MetricCard,
} from "@/components/dashboard/dashboard-ui";
import { SupportCenter } from "@/features/support/support-center";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { supportDetail, supportSummary } from "./helpers/support-fixtures";

const apiMock = vi.hoisted(() =>
  vi.fn<(path: string, options?: RequestInit) => Promise<unknown>>(),
);
vi.mock("@/lib/api", () => ({ api: apiMock }));

afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

describe("semantic contrast adoption", () => {
  it.each(["en", "ar"] as const)(
    "keeps shared dashboard content, tones, links and decorative semantics (%s)",
    (locale) => {
      const copy = (locale === "ar" ? ar : en).teacherWorkspace.dashboard;
      const { container } = render(
        <>
          <DashboardHeader
            eyebrow={copy.eyebrow}
            title={copy.title}
            description={copy.description}
          />
          {(["primary", "secondary", "accent", "warm"] as const).map(
            (tone, index) => (
              <MetricCard
                key={tone}
                label={copy.drafts}
                value={index + 1}
                detail={copy.draftsDetail}
                icon={BookOpen}
                tone={tone}
              />
            ),
          )}
          <ActionCard
            title={copy.myCourses}
            description={copy.myCoursesDescription}
            icon={BookOpen}
          >
            <a href={`/${locale}/teacher/courses`}>{copy.myCourses}</a>
          </ActionCard>
        </>,
      );
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        copy.title,
      );
      expect(screen.getByText(copy.eyebrow)).toHaveClass("text-text-secondary");
      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        `/${locale}/teacher/courses`,
      );
      expect(screen.getAllByText(copy.draftsDetail)).toHaveLength(4);
      const icons = container.querySelectorAll("article svg");
      expect(icons).toHaveLength(5);
      for (const icon of icons) {
        expect(icon).toHaveAttribute("aria-hidden", "true");
        expect(icon.parentElement).toHaveClass("text-text-link");
      }
      for (const [index, tone] of [
        "primary",
        "secondary",
        "accent",
        "warm",
      ].entries()) {
        expect(icons[index].parentElement).toHaveClass(`bg-${tone}/15`);
        expect(screen.getByText(String(index + 1))).toBeVisible();
      }
    },
  );

  for (const mode of ["student", "admin"] as const) {
    it.each(["en", "ar"] as const)(
      `keeps labeled ticket states, neutral unknown values and selection reads (${mode}, %s)`,
      async (locale) => {
        const copy = (locale === "ar" ? ar : en).supportWorkspace.center;
        const items = [
          ["Open", copy.status.open, "bg-info-surface", "text-info"],
          [
            "InProgress",
            copy.status.inProgress,
            "bg-info-surface",
            "text-info",
          ],
          [
            "WaitingForStudent",
            copy.status.waitingForStudent,
            "bg-warning-surface",
            "text-warning",
          ],
          [
            "Resolved",
            copy.status.resolved,
            "bg-success-surface",
            "text-success",
          ],
          [
            "Closed",
            copy.status.closed,
            "bg-surface-muted",
            "text-text-secondary",
          ],
          [
            "RAW unknown حالة",
            "RAW unknown حالة",
            "bg-surface-muted",
            "text-text-secondary",
          ],
        ].map(([status, label, surface, foreground], index) => ({
          ...supportSummary,
          id: `contrast-ticket-${index}`,
          subject: `RAW subject ${index} موضوع`,
          status,
          label,
          surface,
          foreground,
        }));
        apiMock.mockImplementation(async (path) => {
          if (path === "/support/tickets?page=1&pageSize=50")
            return { items, totalCount: items.length, page: 1, pageSize: 50 };
          const selected = items.find(
            (item) => path === `/support/tickets/${item.id}`,
          );
          if (selected) return { ...supportDetail, ...selected };
          throw new Error(`Unexpected contrast-pilot request ${path}`);
        });
        const client = new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        });
        render(
          <NextIntlClientProvider
            locale={locale}
            messages={locale === "ar" ? ar : en}
          >
            <QueryClientProvider client={client}>
              <SupportCenter mode={mode} />
            </QueryClientProvider>
          </NextIntlClientProvider>,
        );
        await screen.findByText(/RAW learner message/u);
        for (const item of items) {
          const button = screen.getByRole("button", {
            name: new RegExp(item.subject),
          });
          expect(button).toHaveAttribute(
            "aria-pressed",
            String(item === items[0]),
          );
          expect(within(button).getByText(item.label)).toHaveClass(
            item.surface,
            item.foreground,
          );
        }
        fireEvent.click(
          screen.getByRole("button", { name: new RegExp(items[1].subject) }),
        );
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith(
            `/support/tickets/${items[1].id}`,
          ),
        );
        expect(
          screen.getByRole("button", { name: new RegExp(items[1].subject) }),
        ).toHaveAttribute("aria-pressed", "true");
        expect(apiMock.mock.calls.some(([, options]) => options?.method)).toBe(
          false,
        );
      },
    );
  }
});
