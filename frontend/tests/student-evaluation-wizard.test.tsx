import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudentArea } from "@/features/student/student-area";
import { invalidateCsrfToken } from "@/lib/api";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const scope = {
  assessmentScopeId: "00000000-0000-0000-0000-000000000001",
  qualificationCode: "Q",
  qualificationArabicName: "مؤهل",
  qualificationEnglishName: "Qualification",
  qualificationVersionCode: "V1",
  gradeCode: "g",
  gradeArabicName: "صف",
  gradeEnglishName: "Grade",
  specializationCode: "s",
  specializationArabicName: "تخصص",
  specializationEnglishName: "Specialization",
  unitCode: "U1",
  unitArabicTitle: "وحدة",
  unitEnglishTitle: "Unit",
  assessmentCode: "ASSIGNMENT",
  assessmentVersion: 1,
  assessmentArabicTitle: "مهمة",
  assessmentEnglishTitle: "Assignment",
  scopeVersion: 1,
  learningAimCodes: ["A"],
  criteria: [{ code: "A.P1", band: "Pass" }],
};

function renderWizard(locale: "en" | "ar" = "en") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? arMessages : enMessages}
      >
        <StudentArea segment={["evaluations", "new"]} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function mockFetch(scopes: (typeof scope)[] = [scope], fail = false) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const path = String(input);
    if (path.endsWith("/evaluations/assessment-scopes"))
      return fail
        ? Response.json({ message: "Unavailable" }, { status: 503 })
        : Response.json(scopes);
    if (path.endsWith("/security/antiforgery"))
      return Response.json({ token: "csrf" });
    if (path.endsWith("/evaluations/scoped"))
      return Response.json({ id: "request-1", criteria: ["A.P1"] });
    return Response.json({ message: "Unexpected request" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Student scoped evaluation wizard", () => {
  afterEach(() => {
    cleanup();
    invalidateCsrfToken();
    vi.unstubAllGlobals();
  });

  it("shows loading, empty and error states", async () => {
    mockFetch([], false);
    const { container } = renderWizard();
    expect(container.querySelector("[aria-busy]")).toBeInTheDocument();
    expect(await screen.findByText(/No published assessments/)).toBeVisible();
    cleanup();
    mockFetch([], true);
    renderWizard();
    expect(
      await screen.findByText(/Unable to load available assessments/),
    ).toBeVisible();
  });

  it.each(["en", "ar"] as const)(
    "filters the %s hierarchy, clears children and submits only scope identity",
    async (locale) => {
      const other = {
        ...scope,
        assessmentScopeId: "00000000-0000-0000-0000-000000000002",
        qualificationCode: "OTHER",
        qualificationEnglishName: "Other qualification",
        qualificationArabicName: "مؤهل آخر",
        gradeCode: "other-grade",
        gradeEnglishName: "Other grade",
        gradeArabicName: "صف آخر",
        unitCode: "U2",
        unitEnglishTitle: "Other unit",
        unitArabicTitle: "وحدة أخرى",
      };
      const fetchMock = mockFetch([scope, other]);
      const user = userEvent.setup();
      renderWizard(locale);
      const label = (english: string, arabic: string) =>
        locale === "ar" ? arabic : english;
      const qualification = await screen.findByLabelText(
        label("Qualification and version", "المؤهل والإصدار"),
      );
      const grade = screen.getByLabelText(label("Grade", "الصف"));
      const specialization = screen.getByLabelText(
        label("Specialization", "التخصص"),
      );
      const unit = screen.getByLabelText(label("Unit", "الوحدة"));
      const assessment = screen.getByLabelText(
        label("Assessment or assignment", "التقييم أو المهمة"),
      );
      expect(screen.queryByLabelText("Rubric")).not.toBeInTheDocument();
      expect(grade).toBeDisabled();
      await user.selectOptions(qualification, "Q:V1");
      await user.selectOptions(grade, "g");
      await user.selectOptions(specialization, "s");
      await user.selectOptions(unit, "U1");
      await user.selectOptions(assessment, scope.assessmentScopeId);
      expect(screen.getByText(/A\.P1 \(Pass\)/)).toBeVisible();
      await user.selectOptions(qualification, "OTHER:V1");
      expect(grade).toHaveValue("");
      expect(specialization).toHaveValue("");
      expect(unit).toHaveValue("");
      expect(assessment).toHaveValue("");
      await user.selectOptions(grade, "other-grade");
      await user.selectOptions(specialization, "s");
      await user.selectOptions(unit, "U2");
      await user.selectOptions(assessment, other.assessmentScopeId);
      await user.click(
        screen.getByRole("button", {
          name: label("Save and review", "حفظ ومراجعة الطلب"),
        }),
      );
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/v1/evaluations/scoped",
          expect.objectContaining({
            body: JSON.stringify({
              assessmentScopeId: other.assessmentScopeId,
              studentComment: "",
            }),
          }),
        ),
      );
      expect(
        screen.getByLabelText(label("Assignment files", "ملفات المهمة")),
      ).toBeInTheDocument();
    },
  );
});
