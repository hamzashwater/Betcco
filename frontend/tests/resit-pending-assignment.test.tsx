import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import enMessages from "../messages/en.json";
import arMessages from "../messages/ar.json";
import { EligibleEvaluatorAssignment } from "@/features/admin/eligible-evaluator-assignment";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: apiMock,
}));
afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

it.each(["en", "ar"] as const)(
  "marks a pending Resit in %s and preserves evaluator selection",
  async (locale) => {
    apiMock.mockResolvedValue([
      { id: "assessor", displayName: "Qualified assessor" },
    ]);
    render(
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? arMessages : enMessages}
      >
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <EligibleEvaluatorAssignment
            evaluation={{
              id: "resit",
              status: "PendingAssignment",
              filesCount: 1,
              criteria: ["A.P1"],
              isResit: true,
              resitOfEvaluationRequestId:
                "ABCD1234-1111-2222-3333-444444444444",
            }}
            onAssigned={vi.fn()}
          />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );
    expect(
      await screen.findByText(
        locale === "ar" ? "إعادة تقييم استثنائية" : "Resit",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        locale === "ar"
          ? "الطلب الأصلي: ABCD1234"
          : "Original request: ABCD1234",
      ),
    ).toBeVisible();
    expect(
      await screen.findByRole("option", { name: "Qualified assessor" }),
    ).toBeInTheDocument();
  },
);
