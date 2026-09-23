import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import enMessages from "../messages/en.json";
import arMessages from "../messages/ar.json";
import { ApiError } from "@/lib/api";
import { EligibleEvaluatorAssignment } from "@/features/admin/eligible-evaluator-assignment";
import { EvaluatorSpecialismManagement } from "@/features/admin/evaluator-specialism-management";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: apiMock,
}));

function renderWithProviders(
  node: React.ReactNode,
  locale: "en" | "ar" = "en",
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ar" ? arMessages : enMessages}
    >
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        {node}
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const evaluation = {
  id: "request-1",
  status: "PendingAssignment",
  studentComment: "",
  filesCount: 1,
  criteria: ["A.P1"],
};

afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

describe("Evaluator Unit specialisms", () => {
  it("offers an Assessor-only server candidate and posts its ID", async () => {
    const assigned = vi.fn();
    apiMock.mockImplementation((path: string) =>
      path.endsWith("eligible-evaluators")
        ? Promise.resolve([{ id: "assessor-1", displayName: "Assessor One" }])
        : Promise.resolve(undefined),
    );
    renderWithProviders(
      <EligibleEvaluatorAssignment
        evaluation={evaluation}
        onAssigned={assigned}
      />,
    );
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByLabelText("Select eligible evaluator"),
      "assessor-1",
    );
    await user.click(screen.getByRole("button", { name: "Assign" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/evaluations/request-1/assign",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ teacherUserId: "assessor-1" }),
        }),
      ),
    );
    await waitFor(() => expect(assigned).toHaveBeenCalledOnce());
  });

  it("blocks a legacy request with a localized academic mapping state", async () => {
    apiMock.mockRejectedValue(
      new ApiError(409, "server error", "ACADEMIC_MAPPING_REQUIRED"),
    );
    renderWithProviders(
      <EligibleEvaluatorAssignment
        evaluation={evaluation}
        onAssigned={vi.fn()}
      />,
      "ar",
    );
    expect(await screen.findByText(/وحدته الأكاديمية/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "إسناد" }),
    ).not.toBeInTheDocument();
  });

  it("shows an empty candidate state without assignment controls", async () => {
    apiMock.mockResolvedValue([]);
    renderWithProviders(
      <EligibleEvaluatorAssignment
        evaluation={evaluation}
        onAssigned={vi.fn()}
      />,
    );
    expect(
      await screen.findByText("No eligible evaluators for this Unit."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Assign" }),
    ).not.toBeInTheDocument();
  });

  it("shows a safe stale-candidate error after server rejection", async () => {
    apiMock.mockImplementation((path: string) =>
      path.endsWith("eligible-evaluators")
        ? Promise.resolve([{ id: "assessor-1", displayName: "Assessor One" }])
        : Promise.reject(
            new ApiError(409, "server error", "UNIT_SPECIALISM_REQUIRED"),
          ),
    );
    renderWithProviders(
      <EligibleEvaluatorAssignment
        evaluation={evaluation}
        onAssigned={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByLabelText("Select eligible evaluator"),
      "assessor-1",
    );
    await user.click(screen.getByRole("button", { name: "Assign" }));
    expect(await screen.findByText(/no longer eligible/)).toBeVisible();
    expect(screen.queryByText("server error")).not.toBeInTheDocument();
  });

  it("grants and revokes while showing history in Arabic", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path.endsWith("/staff"))
        return Promise.resolve([
          { id: "assessor-1", displayName: "Assessor One" },
        ]);
      if (path.endsWith("/units"))
        return Promise.resolve([
          {
            id: "unit-1",
            code: "U1",
            englishTitle: "Unit",
            arabicTitle: "وحدة",
            qualificationVersionId: "version-1",
            qualificationCode: "Q",
            qualificationVersionCode: "V1",
          },
        ]);
      if (path.includes("page="))
        return Promise.resolve({
          items: [
            {
              id: "grant-1",
              evaluatorUserId: "assessor-1",
              evaluatorName: "Assessor One",
              unitDefinitionId: "unit-1",
              unitCode: "U1",
              unitEnglishTitle: "Unit",
              unitArabicTitle: "وحدة",
              qualificationVersionId: "version-1",
              grantedAtUtc: "2026-09-23T00:00:00Z",
              revokedAtUtc: null,
            },
          ],
          page: 1,
          pageSize: 25,
          totalCount: 1,
        });
      return Promise.resolve(undefined);
    });
    renderWithProviders(<EvaluatorSpecialismManagement />, "ar");
    const user = userEvent.setup();
    await screen.findByRole("option", { name: "Assessor One" });
    await screen.findByRole("option", { name: "Q V1 · U1 — وحدة" });
    await user.selectOptions(
      await screen.findByLabelText("المقيم"),
      "assessor-1",
    );
    await user.selectOptions(
      screen.getByLabelText("الوحدة الأكاديمية"),
      "unit-1",
    );
    await user.click(screen.getByRole("button", { name: "منح الاختصاص" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/admin/evaluator-specialisms",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            evaluatorUserId: "assessor-1",
            unitDefinitionId: "unit-1",
          }),
        }),
      ),
    );
    await user.click(
      await screen.findByRole("button", { name: "إلغاء الاختصاص" }),
    );
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/admin/evaluator-specialisms/grant-1/revoke",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});
