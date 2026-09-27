import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import enMessages from "../messages/en.json";
import { ResitCoordinationPanel } from "@/features/admin/resit-coordination-panel";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));

afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

it("shows authorized, activated and revoked records with staff reasons and bounded paging", async () => {
  const base = {
    originalEvaluationRequestId: "ABCD1234-1111-2222-3333-444444444444",
    authorizedAtUtc: "2026-09-23T10:00:00Z",
    reason: "Private staff rationale",
    activatedAtUtc: null,
    revokedAtUtc: null,
    revocationReason: null,
    resitEvaluationRequestId: null,
  };
  apiMock.mockImplementation((path: string) =>
    Promise.resolve(
      path.includes("page=2")
        ? {
            items: [
              {
                ...base,
                authorizationId: "4",
                revokedAtUtc: "2026-09-24T10:00:00Z",
                revocationReason: "Revoked internally",
              },
            ],
            page: 2,
            pageSize: 10,
            hasNextPage: false,
          }
        : {
            items: [
              { ...base, authorizationId: "1" },
              {
                ...base,
                authorizationId: "2",
                activatedAtUtc: "2026-09-24T10:00:00Z",
                resitEvaluationRequestId:
                  "EFGH5678-1111-2222-3333-444444444444",
              },
              {
                ...base,
                authorizationId: "3",
                revokedAtUtc: "2026-09-24T10:00:00Z",
                revocationReason: "Revoked internally",
              },
            ],
            page: 1,
            pageSize: 10,
            hasNextPage: true,
          },
    ),
  );
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ResitCoordinationPanel />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  expect(await screen.findByText("Authorized")).toBeVisible();
  expect(screen.getByText("Activated")).toBeVisible();
  expect(screen.getByText("Revoked")).toBeVisible();
  expect(screen.getAllByText("Private staff rationale")).toHaveLength(3);
  expect(screen.getByText("Resit request: EFGH5678")).toBeVisible();
  expect(screen.getAllByText("Original request: ABCD1234")).toHaveLength(3);
  expect(screen.getByText("Revoked internally")).toBeVisible();
  for (const name of ["Authorize", "Revoke", "Activate"]) {
    expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  }
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(apiMock).toHaveBeenCalledWith(
      "/resits/authorizations?page=2&pageSize=10",
    ),
  );
  await user.click(screen.getByRole("button", { name: "Previous" }));
  await waitFor(() =>
    expect(apiMock).toHaveBeenCalledWith(
      "/resits/authorizations?page=1&pageSize=10",
    ),
  );
});
