import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { StudentArea } from "@/features/student/student-area";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));

type Locale = "ar" | "en";

function renderStudent(segment: string, locale: Locale) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ar" ? arMessages : enMessages}
    >
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        <StudentArea segment={[segment]} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const profile = {
  displayName: "Sam Learner",
  email: "sam@example.com",
  phone: "+962700000000",
  marketingConsent: false,
};

function mockAccount() {
  apiMock.mockImplementation((path: string, options?: RequestInit) => {
    if (path === "/auth/profile" && options?.method === "PUT")
      return Promise.resolve(profile);
    if (path === "/auth/profile") return Promise.resolve(profile);
    if (path === "/memberships/me")
      return Promise.resolve({
        memberships: [
          {
            id: "membership-1",
            title: "Gold plan",
            startsAtUtc: "2026-01-01T00:00:00Z",
            endsAtUtc: "2026-12-31T00:00:00Z",
            status: "Active",
          },
        ],
        subscriptions: [
          {
            id: "subscription-1",
            title: "Course plan",
            courseId: "course-1",
            startsAtUtc: "2025-01-01T00:00:00Z",
            endsAtUtc: "2025-12-31T00:00:00Z",
            status: "Expired",
          },
        ],
      });
    throw new Error(`Unexpected account request: ${path}`);
  });
}

function mockPurchases(locale: Locale) {
  apiMock.mockImplementation((path: string) => {
    if (path.startsWith("/student-tools/purchases?page="))
      return Promise.resolve({
        items: [
          {
            id: "payment-1",
            purpose: "CoursePurchase",
            status: "Paid",
            subtotal: 30,
            discount: 5,
            tax: 0,
            total: 25,
            currency: "JOD",
            method: "Card",
            createdAtUtc: "2026-09-20T10:00:00Z",
          },
          {
            id: "payment-2",
            purpose: "CoursePackage",
            status: "PartiallyRefunded",
            subtotal: 40,
            discount: 0,
            tax: 0,
            total: 40,
            currency: "JOD",
            method: "Card",
            createdAtUtc: "2026-09-21T10:00:00Z",
          },
          {
            id: "payment-3",
            purpose: "UnlistedPurpose",
            status: "UnknownStatus",
            subtotal: 10,
            discount: 0,
            tax: 0,
            total: 10,
            currency: "JOD",
            method: "Card",
            createdAtUtc: "2026-09-22T10:00:00Z",
          },
        ],
        page: 1,
        pageSize: 12,
        totalCount: 13,
      });
    if (path === `/student-tools/entitlements?locale=${locale}`)
      return Promise.resolve({
        items: [
          {
            enrollmentId: "enrollment-1",
            courseId: "course-1",
            courseTitle: "Server course title",
            accessType: "Permanent",
            enrolledAtUtc: "2026-09-20T10:00:00Z",
            accessEndsAtUtc: null,
            sourcePaymentId: "payment-1",
            sourcePurpose: "CourseCart",
            includedEvaluationCredits: [
              {
                unitDefinitionId: "unit-1",
                unitCode: "U1",
                unitTitle: "Unit One",
                status: "Available",
              },
              {
                unitDefinitionId: "unit-2",
                unitCode: "U2",
                unitTitle: "Unit Two",
                status: "Consumed",
              },
              {
                unitDefinitionId: "unit-3",
                unitCode: "U3",
                unitTitle: "Unit Three",
                status: "Revoked",
              },
            ],
          },
          {
            enrollmentId: "enrollment-2",
            courseId: "course-2",
            courseTitle: "Other server course",
            accessType: "Timed",
            enrolledAtUtc: "2026-09-20T10:00:00Z",
            accessEndsAtUtc: "2027-01-01T00:00:00Z",
            sourcePaymentId: null,
            sourcePurpose: "DirectEnrollment",
            includedEvaluationCredits: [],
          },
          {
            enrollmentId: "enrollment-3",
            courseId: "course-3",
            courseTitle: "Legacy server course",
            accessType: "Permanent",
            enrolledAtUtc: "2026-09-20T10:00:00Z",
            accessEndsAtUtc: null,
            sourcePaymentId: null,
            sourcePurpose: "LegacyGrant",
            includedEvaluationCredits: [],
          },
        ],
      });
    throw new Error(`Unexpected purchase request: ${path}`);
  });
}

function mockOverview(locale: Locale) {
  apiMock.mockImplementation((path: string, options?: RequestInit) => {
    if (path === `/student-tools/overview?locale=${locale}`)
      return Promise.resolve({
        notes: [
          {
            id: "note-1",
            lessonId: "lesson-1",
            courseId: "course-1",
            lessonTitle: "Server lesson",
            body: "Server note",
          },
        ],
        bookmarks: [
          {
            id: "bookmark-1",
            lessonId: "lesson-1",
            courseId: "course-1",
            lessonTitle: "Server bookmark",
          },
        ],
        calendar: [
          {
            id: "personal-1",
            personalEntryId: "personal-1",
            eventType: "Personal",
            title: "My appointment",
            startsAtUtc: new Date().toISOString(),
          },
          {
            id: "live-1",
            eventType: "LiveSession",
            title: "Live class",
            startsAtUtc: new Date().toISOString(),
          },
          {
            id: "assignment-1",
            eventType: "Assignment",
            title: "Coursework",
            startsAtUtc: new Date().toISOString(),
          },
        ],
        certificates: [
          {
            verificationCode: "CERT-1",
            title: "Server certificate",
            issuedAtUtc: "2026-09-20T10:00:00Z",
          },
        ],
        upcomingAssignments: [],
        unreadNotifications: 0,
        achievements: [],
        pendingActions: [],
      });
    if (path === "/student-tools/calendar" && options?.method === "POST")
      return Promise.resolve({});
    if (
      path === "/student-tools/calendar/personal-1" &&
      options?.method === "DELETE"
    )
      return Promise.resolve({});
    throw new Error(`Unexpected organizer request: ${path}`);
  });
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

describe.each([
  [
    "en",
    {
      basic: "Basic details",
      name: "Name",
      email: "Email",
      phone: "Phone (optional)",
      save: "Save details",
      saved: "Account settings were saved.",
      memberships: "Memberships and subscriptions",
      member: "Membership",
      subscription: "Course subscription",
      active: "Active",
      expired: "Expired",
      paymentsLink: "View payment history",
      purchases: "Payment history",
      access: "My course access",
      source: "Source:",
      permanent: "Permanent access",
      timed: "Timed access",
      credits: "Included Unit evaluation credits",
      available: "Available",
      consumed: "Consumed",
      revoked: "Revoked",
      purpose: "Course purchase",
      package: "Package purchase",
      paid: "Paid",
      partial: "Partially refunded",
      method: "Payment method",
      discount: "Discount",
      reference: "Reference",
      pages: "Payment pages",
      planner: "Learning planner",
      placeholder: "Example: revise module one",
      add: "Add",
      calendar: "Calendar view",
      month: "Month",
      week: "Week",
      day: "Day",
      openSession: "Open session",
      openAssignment: "Open assignment",
      delete: "Delete",
      notesEmpty: "Add a note inside a lesson and it will appear here.",
      bookmarksEmpty: "Save a lesson in the course player to revisit it later.",
      verification: "Verification code:",
      certificateLink: "View and print certificate",
    },
  ],
  [
    "ar",
    {
      basic: "البيانات الأساسية",
      name: "الاسم",
      email: "البريد الإلكتروني",
      phone: "رقم الهاتف (اختياري)",
      save: "حفظ البيانات",
      saved: "تم حفظ إعدادات الحساب.",
      memberships: "العضويات والاشتراكات",
      member: "عضوية",
      subscription: "اشتراك دورة",
      active: "نشط",
      expired: "منتهٍ",
      paymentsLink: "عرض سجل الدفعات",
      purchases: "سجل الدفعات",
      access: "صلاحيات الوصول للدورات",
      source: "المصدر:",
      permanent: "وصول دائم",
      timed: "وصول محدد المدة",
      credits: "أرصدة تقييم الوحدات المشمولة",
      available: "متاح",
      consumed: "مستخدم",
      revoked: "ملغى",
      purpose: "شراء دورة",
      package: "شراء باقة",
      paid: "مدفوع",
      partial: "مسترد جزئيًا",
      method: "طريقة الدفع",
      discount: "الخصم",
      reference: "المرجع",
      pages: "صفحات الدفعات",
      planner: "مخطط التعلّم",
      placeholder: "مثال: مراجعة الوحدة الأولى",
      add: "إضافة",
      calendar: "عرض التقويم",
      month: "الشهر",
      week: "الأسبوع",
      day: "اليوم",
      openSession: "فتح الجلسة",
      openAssignment: "فتح الواجب",
      delete: "حذف",
      notesEmpty: "أضف ملاحظة من داخل أي درس لتظهر هنا.",
      bookmarksEmpty: "احفظ أي درس من مشغّل الدورة للرجوع إليه لاحقًا.",
      verification: "رمز التحقق:",
      certificateLink: "عرض وطباعة الشهادة",
    },
  ],
] as const)(
  "student account, purchases, and organizer in %s",
  (locale, copy) => {
    it("renders account copy and preserves profile update payload", async () => {
      mockAccount();
      renderStudent("account", locale);
      expect(
        await screen.findByRole("heading", { name: copy.basic }),
      ).toBeVisible();
      expect(
        await screen.findByRole("textbox", { name: copy.email }),
      ).toHaveAttribute("readonly");
      expect(screen.getByRole("textbox", { name: copy.phone })).toBeVisible();
      expect(screen.getByRole("button", { name: copy.save })).toBeVisible();
      expect(
        screen.getByRole("heading", { name: copy.memberships }),
      ).toBeVisible();
      expect(screen.getByText(copy.member)).toBeVisible();
      expect(screen.getByText(copy.subscription)).toBeVisible();
      expect(screen.getByText(copy.active)).toBeVisible();
      expect(screen.getByText(copy.expired)).toBeVisible();
      expect(
        screen.getByRole("link", { name: copy.paymentsLink }),
      ).toHaveAttribute("href", `/${locale}/student/purchases`);
      const user = userEvent.setup();
      await user.clear(screen.getByRole("textbox", { name: copy.name }));
      await user.type(
        screen.getByRole("textbox", { name: copy.name }),
        "  New Learner  ",
      );
      await user.clear(screen.getByRole("textbox", { name: copy.phone }));
      await user.click(screen.getByRole("button", { name: copy.save }));
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/auth/profile",
          expect.objectContaining({
            method: "PUT",
            body: JSON.stringify({
              displayName: "New Learner",
              phone: null,
              marketingConsent: false,
            }),
          }),
        ),
      );
      expect(await screen.findByRole("status")).toHaveTextContent(copy.saved);
      expect(apiMock).toHaveBeenCalledWith("/memberships/me");
    });

    it("renders payment, entitlement, and credit labels without mutating raw values", async () => {
      mockPurchases(locale);
      renderStudent("purchases", locale);
      expect(
        await screen.findByRole("heading", { name: copy.access }),
      ).toBeVisible();
      expect(
        screen.getByRole("heading", { name: copy.purchases }),
      ).toBeVisible();
      expect(await screen.findByText("Server course title")).toBeVisible();
      expect(
        screen.getAllByText(new RegExp(copy.source)).length,
      ).toBeGreaterThan(0);
      expect(screen.getAllByText(copy.permanent).length).toBeGreaterThan(0);
      expect(screen.getByText(copy.timed)).toBeVisible();
      expect(screen.getAllByText(copy.credits).length).toBeGreaterThan(0);
      expect(screen.getByText(copy.available)).toBeVisible();
      expect(screen.getByText(copy.consumed)).toBeVisible();
      expect(screen.getByText(copy.revoked)).toBeVisible();
      expect(screen.getAllByText(copy.purpose).length).toBeGreaterThan(0);
      expect(screen.getByText(copy.package)).toBeVisible();
      expect(screen.getByText(copy.paid)).toBeVisible();
      expect(screen.getByText(copy.partial)).toBeVisible();
      expect(screen.getAllByText(copy.method).length).toBeGreaterThan(0);
      expect(screen.getAllByText(copy.discount).length).toBeGreaterThan(0);
      expect(screen.getAllByText(copy.reference).length).toBeGreaterThan(0);
      expect(screen.getByText("UnlistedPurpose")).toBeVisible();
      expect(screen.getByText("UnknownStatus")).toBeVisible();
      expect(screen.getByText(/LegacyGrant/)).toBeVisible();
      expect(
        screen.getByRole("navigation", { name: copy.pages }),
      ).toBeVisible();
      expect(apiMock).toHaveBeenCalledWith(
        "/student-tools/purchases?page=1&pageSize=12",
      );
      expect(apiMock).toHaveBeenCalledWith(
        `/student-tools/entitlements?locale=${locale}`,
      );
      fireEvent.click(
        within(screen.getByRole("navigation", { name: copy.pages })).getByRole(
          "button",
          { name: locale === "ar" ? "التالي" : "Next" },
        ),
      );
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/student-tools/purchases?page=2&pageSize=12",
        ),
      );
    });

    it("renders planner calendar labels and preserves creation and deletion calls", async () => {
      mockOverview(locale);
      renderStudent("planner", locale);
      expect(
        await screen.findByRole("heading", { name: copy.planner }),
      ).toBeVisible();
      expect(screen.getByPlaceholderText(copy.placeholder)).toBeVisible();
      const calendar = screen.getByRole("group", { name: copy.calendar });
      expect(
        within(calendar).getByRole("button", { name: copy.month }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        within(calendar).getByRole("button", { name: copy.week }),
      ).toBeVisible();
      expect(
        within(calendar).getByRole("button", { name: copy.day }),
      ).toBeVisible();
      expect(
        screen.getByRole("link", { name: copy.openSession }),
      ).toHaveAttribute("href", `/${locale}/live`);
      expect(
        screen.getByRole("link", { name: copy.openAssignment }),
      ).toHaveAttribute("href", `/${locale}/student/courses`);
      fireEvent.click(screen.getByRole("button", { name: copy.delete }));
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/student-tools/calendar/personal-1",
          { method: "DELETE" },
        ),
      );
      fireEvent.change(screen.getByPlaceholderText(copy.placeholder), {
        target: { value: "Study plan" },
      });
      fireEvent.change(
        screen.getByPlaceholderText(
          locale === "ar" ? "تفاصيل اختيارية" : "Optional details",
        ),
        { target: { value: "My details" } },
      );
      const dateInput = document.querySelector(
        'input[type="datetime-local"]',
      ) as HTMLInputElement;
      fireEvent.change(dateInput, { target: { value: "2026-10-01T09:00" } });
      fireEvent.click(screen.getByRole("button", { name: copy.add }));
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/student-tools/calendar",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
              title: "Study plan",
              details: "My details",
              startsAtUtc: new Date("2026-10-01T09:00").toISOString(),
              endsAtUtc: null,
            }),
          }),
        ),
      );
    });

    it("renders notes and bookmarks empty copy and certificate list links", async () => {
      mockOverview(locale);
      renderStudent("certificates", locale);
      expect(await screen.findByText("Server certificate")).toBeVisible();
      expect(screen.getByText(new RegExp(copy.verification))).toBeVisible();
      expect(
        screen.getByRole("link", { name: copy.certificateLink }),
      ).toHaveAttribute("href", `/${locale}/student/certificates/CERT-1`);
      cleanup();
      apiMock.mockImplementation((path: string) => {
        if (path === `/student-tools/overview?locale=${locale}`)
          return Promise.resolve({
            notes: [],
            bookmarks: [],
            calendar: [],
            certificates: [],
            upcomingAssignments: [],
            unreadNotifications: 0,
            achievements: [],
            pendingActions: [],
          });
        throw new Error(`Unexpected organizer request: ${path}`);
      });
      renderStudent("notes", locale);
      expect(await screen.findByText(copy.notesEmpty)).toBeVisible();
      cleanup();
      renderStudent("bookmarks", locale);
      expect(await screen.findByText(copy.bookmarksEmpty)).toBeVisible();
    });
  },
);
