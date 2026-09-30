import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { StudentArea } from "@/features/student/student-area";
import { TeacherArea } from "@/features/teacher/teacher-area";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));

const revisionRequestId = "evaluation-revision-1";
const revisionListPath = "/evaluations/mine?page=1&pageSize=20";

function revisionRequestPage() {
  return {
    items: [
      {
        id: revisionRequestId,
        status: "NeedsRevision",
        price: 5,
        currency: "JOD",
        isRetake: false,
        isResit: false,
        resitOfEvaluationRequestId: null,
        retakeOfEvaluationRequestId: null,
        criteria: ["A.P1"],
        academic: null,
        selectedCriteria: ["A.P1"],
        submissionAttemptNumber: 1,
        revisionDueAtUtc: null,
        effectiveRevisionDueAtUtc: null,
        calculatedGrade: "Pass",
        sectionResults: [],
        results: [
          {
            criterionCode: "A.P1",
            achievement: "Achieved",
            evidence: "Current evidence",
            comment: "Please revise this evidence.",
          },
        ],
        evidence: [],
        feedback: [],
      },
    ],
    page: 1,
    pageSize: 20,
    totalCount: 1,
    hasNextPage: false,
  };
}

function renderWithProviders(
  node: React.ReactNode,
  locale: "en" | "ar" = "en",
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ar" ? arMessages : enMessages}
    >
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

describe("BETCCO assignment review flow", () => {
  it("labels a Resit in the assigned list", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/evaluations/assigned"
          ? [
              {
                id: "evaluation-1",
                status: "Assigned",
                isRetake: false,
                isResit: true,
                resitOfEvaluationRequestId:
                  "ABCD1234-1111-2222-3333-444444444444",
                filesCount: 0,
                criteria: [],
                selectedCriteria: [],
                submissionAttemptNumber: 1,
              },
            ]
          : [],
      ),
    );
    renderWithProviders(<TeacherArea segment={["evaluations"]} />);
    expect(await screen.findByText("Resit final review")).toBeVisible();
    expect(screen.getByText("Original request: ABCD1234")).toBeVisible();
    expect(screen.queryByText("Assigned evaluation")).not.toBeInTheDocument();
    expect(screen.queryByText("Retake")).not.toBeInTheDocument();
  });

  it("submits a Resit final review without revision controls", async () => {
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/evaluations/evaluation-1" && !options?.method)
        return Promise.resolve({
          id: "evaluation-1",
          status: "Assigned",
          isRetake: false,
          isResit: true,
          resitOfEvaluationRequestId: "ABCD1234-1111-2222-3333-444444444444",
          studentComment: "Review",
          criteria: ["A.P1"],
          selectedCriteria: ["A.P1"],
          submissionAttemptNumber: 1,
          calculatedGrade: null,
          sectionResults: [],
          files: [],
          results: [],
          evidence: [],
          feedback: [],
        });
      return Promise.resolve(undefined);
    });
    renderWithProviders(
      <TeacherArea segment={["evaluations", "evaluation-1"]} />,
    );
    expect(
      await screen.findByText("Final Resit advisory review"),
    ).toBeVisible();
    expect(screen.getByText("Original request: ABCD1234")).toBeVisible();
    expect(
      screen.queryByRole("checkbox", { name: /revision check/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Revision check deadline"),
    ).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Outcome"), "Achieved");
    await user.type(
      screen.getByLabelText("Teacher feedback"),
      "Final advisory feedback",
    );
    await user.click(
      screen.getByRole("button", { name: "Send review and feedback" }),
    );
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/evaluations/evaluation-1/review",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining(
            '"requestRevision":false,"revisionDueAtUtc":null',
          ),
        }),
      ),
    );
  });
  it("shows the learner an advisory estimate and one revision check", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path !== "/evaluations/mine?page=1&pageSize=20")
        return Promise.resolve([]);
      return Promise.resolve({
        items: [
          {
            id: "evaluation-1",
            status: "NeedsRevision",
            price: 5,
            currency: "JOD",
            isRetake: false,
            retakeOfEvaluationRequestId: null,
            criteria: ["A.P1"],
            academic: null,
            selectedCriteria: ["A.P1"],
            submissionAttemptNumber: 1,
            calculatedGrade: "Pass",
            sectionResults: [{ section: "A", grade: "Pass" }],
            results: [
              {
                criterionCode: "A.P1",
                achievement: "Achieved",
                evidence: "Current evidence",
                comment: "Strengthen the example",
              },
            ],
            evidence: [],
            feedback: [
              {
                body: "Add one clearer example before your school submission.",
                requestsResubmission: true,
                createdAtUtc: "2026-09-25T17:00:00Z",
              },
            ],
          },
        ],
        page: 1,
        pageSize: 20,
        totalCount: 1,
        hasNextPage: false,
      });
    });

    renderWithProviders(<StudentArea segment={["evaluations"]} />);
    expect(
      await screen.findByText("Current BETCCO estimated result"),
    ).toBeVisible();
    expect(screen.getByText("Teacher feedback")).toBeVisible();
    expect(
      screen.getByText(
        "This is BETCCO guidance to help before your official school submission; it is not an official grade.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Submit revised assignment for checking"),
    ).toBeVisible();
  });

  it.each(["en", "ar"] as const)(
    "localizes revised submission copy and button guards in %s",
    async (locale) => {
      const copy =
        locale === "ar"
          ? {
              title: "إرسال النسخة المعدلة للفحص",
              description:
                "عدّل المهمة بناءً على ملاحظات المعلم، ثم أرسل النسخة الجديدة لاستخدام فرصة الفحص الثانية والأخيرة.",
              fileLabel: "النسخة المعدلة",
              choose: "اختيار ملفات محدثة",
              help: "يمكنك اختيار أكثر من ملف، بحد أقصى 100MB لكل ملف.",
              authenticityTitle: "إقرار أصالة النسخة المعدلة",
              authenticityDescription:
                "أقر بأن النسخة المعدلة والأدلة المرفقة تخصني وأنني أوضحت أي مصادر أو مساعدة مسموح بها.",
              submit: "إرسال النسخة المعدلة",
              inputLabel: "اختيار النسخة المعدلة",
            }
          : {
              title: "Submit revised assignment for checking",
              description:
                "Revise the assignment using the teacher feedback, then send the updated version for your second and final review check.",
              fileLabel: "Updated files",
              choose: "Choose updated files",
              help: "You can select multiple files, up to 100MB per file.",
              authenticityTitle: "Updated-work originality declaration",
              authenticityDescription:
                "I declare that this revised work and its evidence are my own and that I have acknowledged any permitted sources or assistance.",
              submit: "Submit revised assignment",
              inputLabel: "Choose Updated files",
            };
      apiMock.mockImplementation((path: string) =>
        path === revisionListPath
          ? Promise.resolve(revisionRequestPage())
          : Promise.resolve([]),
      );
      renderWithProviders(<StudentArea segment={["evaluations"]} />, locale);

      expect(
        await screen.findByRole("heading", { name: copy.title }),
      ).toBeVisible();
      expect(screen.getByText(copy.description)).toBeVisible();
      expect(screen.getByText(copy.fileLabel)).toBeVisible();
      expect(screen.getByRole("button", { name: copy.choose })).toBeVisible();
      expect(screen.getByText(copy.help)).toBeVisible();
      expect(screen.getByText(copy.authenticityTitle)).toBeVisible();
      expect(screen.getByText(copy.authenticityDescription)).toBeVisible();

      const submit = screen.getByRole("button", { name: copy.submit });
      expect(submit).toBeDisabled();
      const user = userEvent.setup();
      const fileInput = await screen.findByLabelText(copy.inputLabel);
      expect(fileInput).toHaveAttribute(
        "accept",
        ".pdf,.docx,.xlsx,.txt,.jpg,.jpeg,.png,.webp",
      );
      expect(fileInput).toHaveAttribute("multiple");
      await user.upload(
        fileInput,
        new File(["updated work"], "updated.pdf", {
          type: "application/pdf",
        }),
      );
      expect(submit).toBeDisabled();
      await user.click(screen.getByRole("checkbox"));
      expect(submit).toBeEnabled();
    },
  );

  it.each(["en", "ar"] as const)(
    "rejects a revised file over the per-file limit in %s",
    async (locale) => {
      apiMock.mockImplementation((path: string) =>
        path === revisionListPath
          ? Promise.resolve(revisionRequestPage())
          : Promise.resolve([]),
      );
      renderWithProviders(<StudentArea segment={["evaluations"]} />, locale);
      const input = await screen.findByLabelText(
        locale === "ar" ? "اختيار النسخة المعدلة" : "Choose Updated files",
      );
      const oversized = new File(["large"], "large.pdf", {
        type: "application/pdf",
      });
      Object.defineProperty(oversized, "size", {
        value: 100 * 1024 * 1024 + 1,
      });
      await userEvent.setup().upload(input, oversized);

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("100.00 MB");
      expect(
        screen.getByRole("button", {
          name:
            locale === "ar"
              ? "إرسال النسخة المعدلة"
              : "Submit revised assignment",
        }),
      ).toBeDisabled();
      expect(
        apiMock.mock.calls.some(([path]) =>
          String(path).endsWith(`/evaluations/${revisionRequestId}/files`),
        ),
      ).toBe(false);
    },
  );

  it("uploads multiple revision files sequentially, declares authenticity, resubmits the same request, and invalidates evaluations", async () => {
    let releaseFirstUpload!: () => void;
    let releaseSecondUpload!: () => void;
    let releaseAuthenticity!: () => void;
    let releaseResubmit!: () => void;
    const firstUpload = new Promise<void>((resolve) => {
      releaseFirstUpload = resolve;
    });
    const secondUpload = new Promise<void>((resolve) => {
      releaseSecondUpload = resolve;
    });
    const authenticity = new Promise<void>((resolve) => {
      releaseAuthenticity = resolve;
    });
    const finalResubmit = new Promise<void>((resolve) => {
      releaseResubmit = resolve;
    });
    let uploadCount = 0;
    apiMock.mockImplementation((path: string) => {
      if (path === revisionListPath)
        return Promise.resolve(revisionRequestPage());
      if (path === `/evaluations/${revisionRequestId}/files`) {
        uploadCount += 1;
        return uploadCount === 1 ? firstUpload : secondUpload;
      }
      if (path === `/evaluations/${revisionRequestId}/authenticity-declaration`)
        return authenticity;
      if (path === `/evaluations/${revisionRequestId}/resubmit`)
        return finalResubmit;
      return Promise.resolve([]);
    });
    renderWithProviders(<StudentArea segment={["evaluations"]} />);
    const user = userEvent.setup();
    const firstFile = new File(["first"], "first.pdf", {
      type: "application/pdf",
    });
    const secondFile = new File(["second"], "second.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    await user.upload(await screen.findByLabelText("Choose Updated files"), [
      firstFile,
      secondFile,
    ]);
    await user.click(screen.getByRole("checkbox"));
    const submit = screen.getByRole("button", {
      name: "Submit revised assignment",
    });
    expect(submit).toBeEnabled();
    await user.click(submit);

    const requestPath = `/evaluations/${revisionRequestId}`;
    const revisionPaths = () =>
      apiMock.mock.calls
        .map(([path]) => String(path))
        .filter((path) => path.startsWith(`${requestPath}/`));
    await waitFor(() =>
      expect(revisionPaths()).toEqual([`${requestPath}/files`]),
    );
    releaseFirstUpload();
    await waitFor(() =>
      expect(revisionPaths()).toEqual([
        `${requestPath}/files`,
        `${requestPath}/files`,
      ]),
    );
    releaseSecondUpload();
    await waitFor(() =>
      expect(revisionPaths()).toEqual([
        `${requestPath}/files`,
        `${requestPath}/files`,
        `${requestPath}/authenticity-declaration`,
      ]),
    );
    releaseAuthenticity();
    await waitFor(() =>
      expect(revisionPaths()).toEqual([
        `${requestPath}/files`,
        `${requestPath}/files`,
        `${requestPath}/authenticity-declaration`,
        `${requestPath}/resubmit`,
      ]),
    );
    expect(submit).toBeDisabled();

    const uploadCalls = apiMock.mock.calls.filter(
      ([path]) => path === `${requestPath}/files`,
    );
    expect(uploadCalls).toHaveLength(2);
    expect((uploadCalls[0]?.[1]?.body as FormData).get("file")).toBe(firstFile);
    expect((uploadCalls[1]?.[1]?.body as FormData).get("file")).toBe(
      secondFile,
    );
    expect(uploadCalls.map(([, options]) => options?.method)).toEqual([
      "POST",
      "POST",
    ]);
    const authenticityCall = apiMock.mock.calls.find(
      ([path]) => path === `${requestPath}/authenticity-declaration`,
    );
    const resubmitCall = apiMock.mock.calls.find(
      ([path]) => path === `${requestPath}/resubmit`,
    );
    expect(authenticityCall?.[1]?.method).toBe("POST");
    expect(resubmitCall?.[1]?.method).toBe("POST");
    expect(
      apiMock.mock.calls
        .filter(([, options]) => options?.method === "POST")
        .map(([path]) => path),
    ).toEqual([
      `${requestPath}/files`,
      `${requestPath}/files`,
      `${requestPath}/authenticity-declaration`,
      `${requestPath}/resubmit`,
    ]);
    expect(
      apiMock.mock.calls.some(([path]) =>
        /\/checkout|\/payments\//u.test(String(path)),
      ),
    ).toBe(false);

    releaseResubmit();
    await waitFor(() =>
      expect(
        apiMock.mock.calls.filter(([path]) => path === revisionListPath),
      ).toHaveLength(2),
    );
  });

  it.each(["en", "ar"] as const)(
    "localizes the non-Error fallback in %s",
    async (locale) => {
      const fallback = locale === "ar" ? "فشل الطلب." : "Request failed.";
      apiMock.mockImplementation((path: string) => {
        if (path === revisionListPath)
          return Promise.resolve(revisionRequestPage());
        if (path === `/evaluations/${revisionRequestId}/resubmit`)
          return Promise.reject("unstructured failure");
        return Promise.resolve([]);
      });
      renderWithProviders(<StudentArea segment={["evaluations"]} />, locale);
      const user = userEvent.setup();
      await user.upload(
        await screen.findByLabelText(
          locale === "ar" ? "اختيار النسخة المعدلة" : "Choose Updated files",
        ),
        new File(["updated"], "updated.pdf", { type: "application/pdf" }),
      );
      await user.click(screen.getByRole("checkbox"));
      await user.click(
        screen.getByRole("button", {
          name:
            locale === "ar"
              ? "إرسال النسخة المعدلة"
              : "Submit revised assignment",
        }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(fallback);
    },
  );

  it.each(["en", "ar"] as const)(
    "preserves the server Error message in %s",
    async (locale) => {
      const submitLabel =
        locale === "ar" ? "إرسال النسخة المعدلة" : "Submit revised assignment";
      apiMock.mockImplementation((path: string) => {
        if (path === revisionListPath)
          return Promise.resolve(revisionRequestPage());
        if (path === `/evaluations/${revisionRequestId}/resubmit`)
          return Promise.reject(
            new Error("Revision endpoint rejected submission."),
          );
        return Promise.resolve([]);
      });
      renderWithProviders(<StudentArea segment={["evaluations"]} />, locale);
      const user = userEvent.setup();
      await user.upload(
        await screen.findByLabelText(
          locale === "ar" ? "اختيار النسخة المعدلة" : "Choose Updated files",
        ),
        new File(["updated"], "updated.pdf", { type: "application/pdf" }),
      );
      await user.click(screen.getByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: submitLabel }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Revision endpoint rejected submission.",
      );
    },
  );

  it("lets the assigned teacher send feedback and open the one revision check", async () => {
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/evaluations/evaluation-1" && !options?.method)
        return Promise.resolve({
          id: "evaluation-1",
          status: "Assigned",
          isRetake: false,
          retakeOfEvaluationRequestId: null,
          studentComment: "Please review my work.",
          criteria: ["A.P1"],
          selectedCriteria: ["A.P1"],
          submissionAttemptNumber: 1,
          calculatedGrade: null,
          sectionResults: [],
          files: [],
          results: [],
          evidence: [],
          feedback: [],
        });
      if (
        path === "/evaluations/evaluation-1/review" &&
        options?.method === "POST"
      )
        return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    renderWithProviders(
      <TeacherArea segment={["evaluations", "evaluation-1"]} />,
    );
    const user = userEvent.setup();

    expect(await screen.findByText("BETCCO Initial Review")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Outcome"), "Achieved");
    await user.type(
      screen.getByLabelText("Teacher feedback"),
      "Add one clearer example before your school submission.",
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /Open the one revision check/,
      }),
    );
    await user.type(
      screen.getByLabelText("Revision check deadline"),
      "2030-01-03T12:00",
    );
    await user.click(
      screen.getByRole("button", { name: "Send review and feedback" }),
    );

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/evaluations/evaluation-1/review",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            results: [
              {
                criterionCode: "A.P1",
                achievement: "Achieved",
                evidence: null,
                comment: null,
              },
            ],
            feedback: "Add one clearer example before your school submission.",
            requestRevision: true,
            revisionDueAtUtc: new Date("2030-01-03T12:00").toISOString(),
          }),
        }),
      ),
    );
  });

  it("marks files uploaded after feedback as revised work for the final check", async () => {
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/evaluations/evaluation-1" && !options?.method)
        return Promise.resolve({
          id: "evaluation-1",
          status: "Assigned",
          isRetake: false,
          retakeOfEvaluationRequestId: null,
          studentComment: "Please review my revision.",
          criteria: ["A.P1"],
          selectedCriteria: ["A.P1"],
          submissionAttemptNumber: 2,
          calculatedGrade: "Pass",
          sectionResults: [{ section: "A", grade: "Pass" }],
          files: [
            {
              id: "file-original",
              originalFileName: "original.pdf",
              lengthBytes: 1024,
              createdAtUtc: "2026-09-25T16:00:00Z",
              scanStatus: "Clean",
            },
            {
              id: "file-revised",
              originalFileName: "revised.pdf",
              lengthBytes: 2048,
              createdAtUtc: "2026-09-25T18:00:00Z",
              scanStatus: "Clean",
            },
          ],
          results: [
            {
              criterionCode: "A.P1",
              achievement: "Achieved",
              evidence: "Current evidence",
              comment: "Review the revision",
            },
          ],
          evidence: [],
          feedback: [
            {
              body: "Please add one clearer example.",
              requestsResubmission: true,
              createdAtUtc: "2026-09-25T17:00:00Z",
            },
          ],
        });
      return Promise.resolve(undefined);
    });

    renderWithProviders(
      <TeacherArea segment={["evaluations", "evaluation-1"]} />,
    );

    expect(await screen.findByText("BETCCO Revision Check")).toBeVisible();
    expect(screen.getByText("revised.pdf")).toBeVisible();
    expect(screen.getByText("Revised file")).toBeVisible();
    expect(screen.getByText("original.pdf")).toBeVisible();
  });
});
