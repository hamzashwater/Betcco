import { ContentRoute } from "@/features/public/content-route";
import { CertificateVerification } from "@/features/public/certificate-verification";
import { PlatformRatingPage } from "@/features/public/platform-rating";
import {
  getDefaultBrand,
  normalizeBrandLocale,
  resolveBrandSettings,
} from "@/lib/brand";
import { api } from "@/lib/api";
import { formatLocalizedDate } from "@/i18n/date-time";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import {
  trustCertificate,
  trustDocument,
  trustRating,
  trustRatingSummary,
  trustSettings,
  trustTrack,
} from "./helpers/public-trust-fixtures";
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
type State = {
  auth: "Student" | "Teacher" | "guest" | "pending";
  document: "data" | "error" | "pending";
  certificate: "data" | "invalid" | "pending";
  summary: "data" | "empty" | "error";
  mine: "data" | "published" | "pending";
  mutation: "success" | "raw" | "fallback" | "pending";
  settings: boolean;
  status:
    | "Submitted"
    | "IdentityVerificationRequired"
    | "InReview"
    | "Completed"
    | "Rejected"
    | "Cancelled";
};
let state: State;
beforeEach(() => {
  state = {
    auth: "Student",
    document: "data",
    certificate: "data",
    summary: "data",
    mine: "data",
    mutation: "success",
    settings: true,
    status: "Submitted",
  };
  vi.clearAllMocks();
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (options?.method) {
      if (state.mutation === "pending") return new Promise(() => {});
      if (state.mutation === "raw") throw new Error("RAW server failure خطأ");
      if (state.mutation === "fallback") throw "Non-Error rejection";
      if (path === "/platform-ratings/mine") return trustRating;
      return { id: "created-request" };
    }
    if (path === "/auth/me") {
      if (state.auth === "pending") return new Promise(() => {});
      if (state.auth === "guest") throw new Error("Unauthorized");
      return { id: "raw-user", displayName: "RAW User", roles: [state.auth] };
    }
    if (path.startsWith("/settings/public"))
      return state.settings ? trustSettings : {};
    if (path.startsWith("/legal/")) {
      if (state.document === "pending") return new Promise(() => {});
      if (state.document === "error") throw new Error("Unavailable");
      return trustDocument;
    }
    if (path.startsWith("/student-tools/certificates/")) {
      if (state.certificate === "pending") return new Promise(() => {});
      if (state.certificate === "invalid")
        throw new Error("Invalid certificate");
      return trustCertificate;
    }
    if (path === "/privacy/requests")
      return {
        items: [
          {
            id: "raw-request/17",
            requestType: "Access",
            status: state.status,
            createdAtUtc: "2026-03-17T14:05:00Z",
            resolutionSummary: "RAW staff resolution معالجة",
          },
        ],
        page: 1,
        pageSize: 20,
        totalCount: 1,
      };
    if (path === "/platform-ratings/mine") {
      if (state.mine === "pending") return new Promise(() => {});
      return { ...trustRating, isPublished: state.mine === "published" };
    }
    if (path.startsWith("/platform-ratings?")) {
      if (state.summary === "error") throw new Error("Summary unavailable");
      return state.summary === "empty"
        ? { ...trustRatingSummary, ratingsCount: 0, reviews: [] }
        : trustRatingSummary;
    }
    if (path.startsWith("/taxonomy/tracks/")) return trustTrack;
    if (path.startsWith("/taxonomy?"))
      return { tracks: [{ ...trustTrack, id: "raw-track" }] };
    if (path.startsWith("/catalog/courses?"))
      return { items: [], page: 1, pageSize: 12, totalCount: 0 };
    throw new Error(`Unexpected UI-contract request ${path}`);
  });
});
afterEach(cleanup);
function mount(child: React.ReactNode, locale: "ar" | "en") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 60_000 },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? ar : en}
        timeZone="UTC"
      >
        {child}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return client;
}
describe.each(["ar", "en"] as const)("T7-A6.3 %s UI contracts", (locale) => {
  const messages = locale === "ar" ? ar : en,
    m = messages.publicTrust;
  const content = createTranslator({ locale, messages: m.content }),
    rating = createTranslator({ locale, messages: m.rating });
  it("localizes both former publication/setup unknowns while keeping all raw overrides", () => {
    const fallback = getDefaultBrand(locale);
    expect(fallback.LegalRegistrationNumber).toBe(m.brand.publicationRequired);
    expect(fallback.LegalAddress).toBe(m.brand.publicationRequired);
    const raw = resolveBrandSettings(locale, {
      ...trustSettings,
      BrandName: "RAW Organization",
      LegalOwnerName: "RAW Issuer",
      LegalAddress: "",
      LegalRegistrationNumber: "000-RAW/ع",
    });
    expect(raw.LegalRegistrationNumber).toBe("000-RAW/ع");
    expect(raw.LegalAddress).toBe("");
    expect(raw.BrandName).toBe("RAW Organization");
    expect(raw.LegalOwnerName).toBe("RAW Issuer");
    expect(
      resolveBrandSettings(locale, { LegalAddress: 17 }).LegalAddress,
    ).toBe(m.brand.publicationRequired);
    expect(normalizeBrandLocale(locale + "-JO")).toBe(locale);
    expect(fallback.LegalLastUpdated).toBe(
      locale === "ar" ? "25/08/2026" : "2026-08-25",
    );
  });
  it("renders localized about/brand copy and keeps server brand fields verbatim", async () => {
    mount(<ContentRoute segments={["about"]} />, locale);
    expect(
      screen.getByRole("heading", {
        name: m.content.clearLearningBuiltAroundApplication,
      }),
    ).toBeVisible();
    expect(
      await screen.findByText(trustSettings.BrandSecondaryMessage),
    ).toBeVisible();
    expect(screen.getByText(trustSettings.BtecDisclaimer)).toBeVisible();
    expect(
      screen.getByRole("link", { name: m.content.openTheUserGuide }),
    ).toHaveAttribute("href", `/${locale}/guide`);
  });
  it("uses catalogue brand fallbacks on settings absence", () => {
    state.settings = false;
    mount(<ContentRoute segments={["about"]} />, locale);
    expect(screen.getByText(m.brand.brandSecondaryMessage)).toBeVisible();
    expect(screen.getByText(m.brand.btecDisclaimer)).toBeVisible();
  });
  it("guide and FAQ keep route targets and existing trust meaning", () => {
    mount(<ContentRoute segments={["guide"]} />, locale);
    expect(
      screen.getByRole("heading", { name: m.content.usingBetcco }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: m.content.createAStudentAccount }),
    ).toHaveAttribute("href", `/${locale}/register`);
    expect(
      screen.getByRole("link", { name: m.content.requestEvaluation }),
    ).toHaveAttribute("href", `/${locale}/student/evaluations/new`);
    cleanup();
    mount(<ContentRoute segments={["faq"]} />, locale);
    expect(
      screen.getByRole("heading", { name: m.content.routeFaq }),
    ).toBeVisible();
    expect(
      screen.getByText(m.content.isBetccoPearsonOrABtecApprovedCentre),
    ).toBeInTheDocument();
  });
  it("legal documents keep raw title/version/body/identity, localized labels and unchanged dates", async () => {
    mount(<ContentRoute segments={["terms"]} />, locale);
    expect(
      await screen.findByRole("heading", { name: trustDocument.title }),
    ).toBeVisible();
    expect(
      await screen.findByText(
        `Registration: ${trustSettings.LegalRegistrationNumber}`,
      ),
    ).toBeVisible();
    expect(
      screen.getByText(`Address: ${trustSettings.LegalAddress}`),
    ).toBeVisible();
    expect(screen.getByText(/RAW-v3/)).toHaveTextContent(
      formatLocalizedDate(trustDocument.effectiveAtUtc, locale, {
        dateStyle: "long",
      }),
    );
    expect(
      screen.getByText(
        m.content.thisIsAnOperationalPlatformDocumentAndRequires,
      ),
    ).toBeVisible();
    if (locale === "en")
      expect(
        screen.getByText(m.content.arabicOperationalReference),
      ).toBeVisible();
    else
      expect(
        screen.queryByText(m.content.arabicOperationalReference),
      ).not.toBeInTheDocument();
  });
  it("interpolates localized setup fallbacks without turning raw record titles into keys", async () => {
    state.settings = false;
    mount(<ContentRoute segments={["terms"]} />, locale);
    expect(
      await screen.findByText(`Registration: ${m.brand.publicationRequired}`),
    ).toBeVisible();
    expect(
      screen.getByText(`Address: ${m.brand.publicationRequired}`),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: trustDocument.title }),
    ).toBeVisible();
  });
  it.each(["pending", "error"] as const)(
    "legal %s precedence remains distinct",
    async (mode) => {
      state.document = mode;
      const { container } = render(
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <NextIntlClientProvider locale={locale} messages={messages}>
            <ContentRoute segments={["terms"]} />
          </NextIntlClientProvider>
        </QueryClientProvider>,
      );
      if (mode === "pending")
        expect(
          container.querySelector('[aria-busy="true"]'),
        ).toBeInTheDocument();
      else
        expect(await screen.findByRole("alert")).toHaveTextContent(
          m.content.thisLegalDocumentCouldNotBeLoaded,
        );
      expect(
        screen.queryByRole("heading", { name: trustDocument.title }),
      ).not.toBeInTheDocument();
    },
  );
  it("localizes all four original accessible presentation slots and retains raw taxonomy", async () => {
    mount(<ContentRoute segments={["security"]} />, locale);
    expect(
      screen.getByRole("heading", { name: m.content.submitASecurityReport }),
    ).toBeVisible();
    cleanup();
    mount(<ContentRoute segments={["tracks", "raw-track"]} />, locale);
    expect(
      await screen.findByRole("heading", { name: trustTrack.name }),
    ).toBeVisible();
    for (const name of [
      m.content.gradesAndStages,
      m.content.specializations,
      m.content.subjects,
    ])
      expect(screen.getByRole("heading", { name })).toBeVisible();
    expect(screen.getByText(trustTrack.description)).toBeVisible();
  });
  it.each(["raw", "fallback", "success"] as const)(
    "contact %s preserves payload, raw error precedence and localized placeholders",
    async (mode) => {
      state.mutation = mode;
      mount(<ContentRoute segments={["contact"]} />, locale);
      fireEvent.change(screen.getByPlaceholderText(m.content.name), {
        target: { value: "RAW name اسم" },
      });
      fireEvent.change(screen.getByPlaceholderText(m.content.emailOrPhone), {
        target: { value: "raw@example.test" },
      });
      fireEvent.change(screen.getByPlaceholderText(m.content.message), {
        target: { value: "RAW message رسالة" },
      });
      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.click(screen.getByRole("button", { name: m.content.send }));
      if (mode === "success")
        expect(await screen.findByRole("status")).toHaveTextContent(
          m.content.thankYouYourMessageWasReceived,
        );
      else
        expect(await screen.findByRole("alert")).toHaveTextContent(
          mode === "raw" ? "RAW server failure خطأ" : m.content.requestFailed,
        );
      expect(api).toHaveBeenCalledWith("/engagement/leads", {
        method: "POST",
        body: JSON.stringify({
          name: "RAW name اسم",
          contact: "raw@example.test",
          message: "RAW message رسالة",
          category: "Contact",
          consent: true,
        }),
      });
    },
  );
  it("privacy form keeps trimmed payload, optional null semantics and raw resolution", async () => {
    mount(<ContentRoute segments={["privacy-center"]} />, locale);
    const select = await screen.findByRole("combobox", {
      name: m.content.requestType,
    });
    fireEvent.change(select, { target: { value: "Rectification" } });
    fireEvent.change(
      screen.getByPlaceholderText(
        m.content.explainTheRequestWithoutSendingSecretsOrSensitive,
      ),
      { target: { value: "  RAW private details تفاصيل  " } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: m.content.submitPrivacyRequest }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      m.content.yourRequestHasBeenRecordedAndCanBe,
    );
    expect(api).toHaveBeenCalledWith("/privacy/requests", {
      method: "POST",
      body: JSON.stringify({
        requestType: "Rectification",
        description: "RAW private details تفاصيل",
      }),
    });
    expect(screen.getByText("RAW staff resolution معالجة")).toBeVisible();
  });
  it.each([
    "Submitted",
    "IdentityVerificationRequired",
    "InReview",
    "Completed",
    "Rejected",
    "Cancelled",
  ] as const)(
    "privacy %s keeps status/cancellation conditions",
    async (status) => {
      state.status = status;
      mount(<ContentRoute segments={["privacy-center"]} />, locale);
      await screen.findByText("RAW staff resolution معالجة");
      const keys = {
        Submitted: "submitted",
        IdentityVerificationRequired: "identityCheckRequired",
        InReview: "inReview",
        Completed: "completed",
        Rejected: "rejected",
        Cancelled: "cancelled",
      } as const;
      expect(screen.getByText(new RegExp(content(keys[status])))).toBeVisible();
      const button = screen.queryByRole("button", {
        name: m.content.cancelRequest,
      });
      if (["Completed", "Rejected", "Cancelled"].includes(status))
        expect(button).not.toBeInTheDocument();
      else {
        expect(button).toBeVisible();
        fireEvent.click(button!);
        await waitFor(() =>
          expect(api).toHaveBeenCalledWith(
            "/privacy/requests/raw-request/17/cancel",
            { method: "POST", body: JSON.stringify({ reason: null }) },
          ),
        );
      }
    },
  );
  it("privacy guest retains login URL and does not fetch protected requests", async () => {
    state.auth = "guest";
    mount(<ContentRoute segments={["privacy-center"]} />, locale);
    expect(
      await screen.findByRole("link", { name: m.content.signIn }),
    ).toHaveAttribute(
      "href",
      `/${locale}/login?next=/${locale}/privacy-center`,
    );
    expect(
      vi.mocked(api).mock.calls.some(([p]) => p === "/privacy/requests"),
    ).toBe(false);
  });
  it.each(["data", "invalid", "pending"] as const)(
    "certificate %s retains verification condition and raw identity",
    async (mode) => {
      state.certificate = mode;
      const code = "RAW code/ع";
      mount(
        <CertificateVerification locale={locale} verificationCode={code} />,
        locale,
      );
      expect(
        screen.getByRole("heading", {
          name: m.certificate.certificateVerification,
        }),
      ).toBeVisible();
      expect(
        screen.getByRole("link", { name: m.certificate.backToBetcco }),
      ).toHaveAttribute("href", `/${locale}`);
      expect(
        screen.getByText(m.certificate.thisIsABetccoCompletionCertificateNotA),
      ).toBeVisible();
      if (mode === "data") {
        expect(
          await screen.findByText(m.certificate.certificateVerified),
        ).toBeVisible();
        for (const raw of [
          trustCertificate.studentName,
          trustCertificate.courseTitle,
          trustCertificate.verificationCode,
        ])
          expect(screen.getByText(raw)).toBeVisible();
        expect(
          screen.getByText(trustCertificate.verificationCode),
        ).toHaveAttribute("dir", "ltr");
        expect(
          screen.getByText(
            formatLocalizedDate(trustCertificate.issuedAtUtc, locale, {
              dateStyle: "long",
            }),
          ),
        ).toBeVisible();
      } else if (mode === "invalid")
        expect(
          await screen.findByText(
            m.certificate.noValidCertificateWasFoundForThisCode,
          ),
        ).toBeVisible();
      else
        expect(
          screen.queryByText(m.certificate.certificateVerified),
        ).not.toBeInTheDocument();
      expect(api).toHaveBeenCalledWith(
        `/student-tools/certificates/${encodeURIComponent(code)}?locale=${locale}`,
      );
    },
  );
  it.each(["guest", "Teacher"] as const)(
    "rating %s gate preserves public reviews, raw data and login",
    async (auth) => {
      state.auth = auth;
      mount(<PlatformRatingPage />, locale);
      expect(
        await screen.findByText(trustRatingSummary.reviews[0].authorLabel),
      ).toBeVisible();
      expect(
        screen.getByText(trustRatingSummary.reviews[0].comment),
      ).toBeVisible();
      expect(
        await screen.findByRole("link", { name: m.rating.signIn }),
      ).toHaveAttribute("href", `/${locale}/login`);
      expect(
        screen.queryByRole("button", { name: m.rating.submitFeedback }),
      ).not.toBeInTheDocument();
      expect(
        vi.mocked(api).mock.calls.some(([p]) => p === "/platform-ratings/mine"),
      ).toBe(false);
    },
  );
  it.each(["data", "published"] as const)(
    "rating %s preserves moderation/publication wording",
    async (mine) => {
      state.mine = mine;
      mount(<PlatformRatingPage />, locale);
      expect(
        await screen.findByDisplayValue(trustRating.comment),
      ).toBeVisible();
      expect(screen.getByRole("status")).toHaveTextContent(
        mine === "published"
          ? m.rating.yourReviewWasApprovedAndPublishedWithYour
          : m.rating.yourReviewIsSavedAndAwaitingAdminReview,
      );
      expect(
        screen.getByText(rating("publishedReviewCount", { count: 2 })),
      ).toBeVisible();
    },
  );
  it.each(["empty", "error"] as const)(
    "rating public %s remains distinct",
    async (summary) => {
      state.summary = summary;
      mount(<PlatformRatingPage />, locale);
      if (summary === "error")
        expect(await screen.findByRole("alert")).toHaveTextContent(
          m.rating.publishedRatingsCouldNotBeLoaded,
        );
      else
        expect(
          await screen.findByText(
            m.rating.thereAreNoPublishedReviewsYetReviewsAppear,
          ),
        ).toBeVisible();
    },
  );
  it.each(["success", "raw", "fallback", "pending"] as const)(
    "rating save %s keeps payload, disabled guard and errors",
    async (mode) => {
      state.mutation = mode;
      mount(<PlatformRatingPage />, locale);
      const input = await screen.findByDisplayValue(trustRating.comment);
      fireEvent.change(input, {
        target: { value: "RAW edited comment تعليق" },
      });
      const button = screen.getByRole("button", {
        name: m.rating.submitFeedback,
      });
      expect(button).toBeEnabled();
      fireEvent.click(button);
      await waitFor(() =>
        expect(api).toHaveBeenCalledWith("/platform-ratings/mine", {
          method: "PUT",
          body: JSON.stringify({
            courseQualityScore: 4,
            easeOfUseScore: 3,
            supportScore: 2,
            recommendationScore: 5,
            comment: "RAW edited comment تعليق",
            allowPublicDisplay: true,
          }),
        }),
      );
      if (mode === "pending")
        expect(
          await screen.findByRole("button", { name: m.rating.saving }),
        ).toBeDisabled();
      if (mode === "raw" || mode === "fallback")
        expect(await screen.findByRole("alert")).toHaveTextContent(
          mode === "raw"
            ? "RAW server failure خطأ"
            : m.rating.feedbackCouldNotBeSaved,
        );
    },
  );
  it("own-rating pending keeps the submit guard", async () => {
    state.mine = "pending";
    mount(<PlatformRatingPage />, locale);
    expect(
      await screen.findByRole("button", { name: m.rating.submitFeedback }),
    ).toBeDisabled();
  });
});
