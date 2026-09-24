import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { AccountProfile } from "@/features/auth/account-profile";
import { AccountSecurity } from "@/features/auth/account-security";
import { EmailChangeConfirmation } from "@/features/auth/email-change-confirmation";
import { AccountIdentityManagement } from "@/features/admin/account-identity-management";
import { SupportAccountArea } from "@/features/support/support-account-area";
import { ResetPasswordForm } from "@/features/auth/auth-forms";
import { StudentArea } from "@/features/student/student-area";
import { ApiError } from "@/lib/api";

const apiMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());
const searchMock = vi.hoisted(() => ({ value: "" }));
vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: apiMock };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(searchMock.value),
}));

const profile = {
  displayName: "Sam Learner",
  email: "sam@example.com",
  phone: "+962700000000",
  marketingConsent: false,
};
const session = {
  id: "session-1",
  deviceName: "Lenovo Laptop",
  browserName: "Chrome",
  ipAddress: "192.0.2.1",
  loggedInAtUtc: "2026-09-20T10:00:00Z",
  lastActiveAtUtc: "2026-09-23T10:00:00Z",
  isCurrent: true,
};

function renderAccount(node: React.ReactNode, locale: "en" | "ar" = "en") {
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
        {node}
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  apiMock.mockReset();
  replaceMock.mockReset();
  pushMock.mockReset();
  searchMock.value = "";
  vi.restoreAllMocks();
});

describe("account profiles", () => {
  it("loads the student profile and keeps membership and payment access", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/auth/profile") return Promise.resolve(profile);
      if (path === "/memberships/me")
        return Promise.resolve({ memberships: [], subscriptions: [] });
      return Promise.reject(new Error(`Unexpected ${path}`));
    });
    renderAccount(<StudentArea segment={["account"]} />);
    expect(await screen.findByDisplayValue("Sam Learner")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "View payment history" }),
    ).toHaveAttribute("href", "/en/student/purchases");
    expect(screen.getByDisplayValue("sam@example.com")).toHaveAttribute(
      "readonly",
    );
  });

  it("updates only supported student fields", async () => {
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/auth/profile" && options?.method === "PUT")
        return Promise.resolve(profile);
      if (path === "/auth/profile") return Promise.resolve(profile);
      if (path === "/memberships/me")
        return Promise.resolve({ memberships: [], subscriptions: [] });
      return Promise.reject(new Error(`Unexpected ${path}`));
    });
    renderAccount(<StudentArea segment={["account"]} />);
    const user = userEvent.setup();
    await user.clear(await screen.findByRole("textbox", { name: "Name" }));
    await user.type(
      screen.getByRole("textbox", { name: "Name" }),
      "Sam Updated",
    );
    await user.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/auth/profile",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            displayName: "Sam Updated",
            phone: "+962700000000",
            marketingConsent: false,
          }),
        }),
      ),
    );
  });

  it.each(["teacher", "admin"] as const)(
    "renders the %s profile with live fields",
    async (role) => {
      apiMock.mockResolvedValue(profile);
      renderAccount(<AccountProfile role={role} />);
      expect(await screen.findByDisplayValue("Sam Learner")).toBeVisible();
      expect(screen.getByRole("link", { name: "Security" })).toHaveAttribute(
        "href",
        `/en/${role}/security`,
      );
      expect(screen.getByDisplayValue("sam@example.com")).toHaveAttribute(
        "readonly",
      );
    },
  );

  it("shows Arabic profile labels and RTL-safe role links", async () => {
    apiMock.mockResolvedValue(profile);
    renderAccount(<AccountProfile role="teacher" />, "ar");
    expect(await screen.findByRole("textbox", { name: "الاسم" })).toHaveValue(
      "Sam Learner",
    );
    expect(screen.getByRole("link", { name: "أمان الحساب" })).toHaveAttribute(
      "href",
      "/ar/teacher/security",
    );
  });

  it("requires a password and new mailbox confirmation for a student email request", async () => {
    apiMock.mockImplementation((path: string) =>
      path === "/auth/profile" ? Promise.resolve(profile) : Promise.resolve(),
    );
    renderAccount(<AccountProfile role="student" />);
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", { name: "New email" }),
      "new@example.com",
    );
    await user.type(
      screen.getByLabelText("Current password"),
      "T!estPassword123",
    );
    await user.click(
      screen.getByRole("button", { name: "Send confirmation link" }),
    );
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/auth/email-change/request",
        expect.objectContaining({
          body: JSON.stringify({
            newEmail: "new@example.com",
            currentPassword: "T!estPassword123",
          }),
        }),
      ),
    );
    expect(screen.getByDisplayValue("sam@example.com")).toHaveAttribute(
      "readonly",
    );
  });

  it("keeps managed email controls off Teacher and SupportAdmin profiles", async () => {
    apiMock.mockResolvedValue(profile);
    renderAccount(<AccountProfile role="support" />);
    expect(
      await screen.findByText("Administration manages this account's email."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Send confirmation link" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Security" })).toHaveAttribute(
      "href",
      "/en/support/security",
    );
  });
});

describe("email confirmation and account administration", () => {
  it("submits the mailbox proof from a confirmation link", async () => {
    searchMock.value =
      "userId=00000000-0000-0000-0000-000000000001&email=new%40example.com&proof=proof-value&mode=student";
    apiMock.mockResolvedValue(undefined);
    renderAccount(<EmailChangeConfirmation />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Confirm email change" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/auth/email-change/confirm",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            userId: "00000000-0000-0000-0000-000000000001",
            newEmail: "new@example.com",
            proof: "proof-value",
            mode: "student",
          }),
        }),
      ),
    );
  });

  it("lets Admin invite SupportAdmin and request a managed email change", async () => {
    apiMock.mockImplementation((path: string) =>
      path.startsWith("/admin/users?")
        ? Promise.resolve({
            items: [
              {
                id: "teacher-1",
                displayName: "Teacher One",
                email: "old@example.com",
                emailConfirmed: true,
                isFrozen: false,
                mustChangePassword: false,
              },
            ],
            totalCount: 1,
          })
        : Promise.resolve(),
    );
    renderAccount(<AccountIdentityManagement />);
    const user = userEvent.setup();
    await user.type(
      await screen.findByPlaceholderText("New email"),
      "new@example.com",
    );
    await user.click(
      screen.getByRole("button", { name: "Request email change" }),
    );
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/admin/users/teacher-1/email-change/request",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ newEmail: "new@example.com" }),
        }),
      ),
    );
    await user.click(
      screen.getByRole("button", { name: "Support administrators" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Name" }),
      "Support One",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Work email" }),
      "support@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/admin/users/support-admins/invite",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            displayName: "Support One",
            email: "support@example.com",
          }),
        }),
      ),
    );
  });

  it.each(["en", "ar"] as const)(
    "confirms %s support authority revocation separately from freezing",
    async (locale) => {
      let revoked = false;
      apiMock.mockImplementation((path: string) => {
        if (path.startsWith("/admin/users?"))
          return Promise.resolve({
            items:
              path.includes("role=SupportAdmin") && !revoked
                ? [
                    {
                      id: "support-1",
                      displayName: "Support One",
                      email: "support@example.com",
                      emailConfirmed: true,
                      isFrozen: false,
                      mustChangePassword: false,
                    },
                  ]
                : [],
            totalCount: revoked ? 0 : 1,
          });
        if (path === "/admin/users/support-admins/support-1/revoke-authority")
          revoked = true;
        return Promise.resolve();
      });
      const confirm = vi
        .spyOn(window, "confirm")
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      renderAccount(<AccountIdentityManagement />, locale);
      const user = userEvent.setup();
      await user.click(
        screen.getByRole("button", {
          name: locale === "ar" ? "مساعدو الإدارة" : "Support administrators",
        }),
      );
      const revoke = await screen.findByRole("button", {
        name:
          locale === "ar"
            ? "سحب صلاحيات مساعد الإدارة"
            : "Revoke support access",
      });
      expect(
        screen.getByRole("button", {
          name: locale === "ar" ? "تجميد" : "Freeze",
        }),
      ).toBeVisible();
      await user.click(revoke);
      expect(confirm).toHaveBeenCalledOnce();
      expect(confirm.mock.calls[0][0]).toContain("Support One");
      expect(
        apiMock.mock.calls.some(
          ([path]) =>
            path === "/admin/users/support-admins/support-1/revoke-authority",
        ),
      ).toBe(false);
      await user.click(revoke);
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/admin/users/support-admins/support-1/revoke-authority",
          expect.objectContaining({ method: "POST" }),
        ),
      );
      await waitFor(() => expect(screen.queryByText("Support One")).toBeNull());
      expect(
        apiMock.mock.calls.some(
          ([path]) => path === "/admin/users/support-1/freeze",
        ),
      ).toBe(false);
      expect(screen.getByRole("status")).toBeVisible();
    },
  );

  it("shows SupportAdmin only the Student and Teacher freeze queue", async () => {
    apiMock.mockImplementation((path: string) =>
      path === "/auth/me"
        ? Promise.resolve({ roles: ["SupportAdmin"] })
        : path.startsWith("/admin/users/freeze-targets?")
          ? Promise.resolve({
              items: [
                {
                  id: "student-1",
                  displayName: "Student One",
                  email: "student@example.com",
                  isFrozen: false,
                },
              ],
              totalCount: 1,
            })
          : Promise.resolve(),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderAccount(<SupportAccountArea segment={["accounts"]} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Freeze" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/admin/users/student-1/freeze",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ frozen: true }),
        }),
      ),
    );
    expect(screen.getByRole("link", { name: "Security" })).toHaveAttribute(
      "href",
      "/en/support/security",
    );
  });
});

describe("security with existing endpoints", () => {
  function mockSecurity(
    enabled: boolean,
    includeOther = false,
    isRequired = false,
    enrollment = false,
  ) {
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/auth/me")
        return Promise.resolve({
          roles: isRequired ? ["Admin"] : ["Teacher"],
          requiresMfaEnrollment: enrollment,
        });
      if (path === "/auth/two-factor")
        return Promise.resolve({
          isEnabled: enabled,
          hasAuthenticator: enabled,
          isRequired,
        });
      if (path === "/auth/sessions")
        return Promise.resolve({
          items: includeOther
            ? [session, { ...session, id: "session-2", isCurrent: false }]
            : [session],
        });
      if (path === "/auth/two-factor/setup")
        return Promise.resolve({
          sharedKey: "SECRETKEY",
          authenticatorUri: "otpauth://totp/Betcco:sam?secret=SECRETKEY",
        });
      if (path === "/auth/two-factor/enable")
        return Promise.reject(
          new ApiError(400, "Invalid code", "TWO_FACTOR_INVALID"),
        );
      if (path === "/auth/sessions/session-1" && options?.method === "DELETE")
        return Promise.resolve({ currentSessionRevoked: true });
      if (path === "/auth/sessions/logout-all") return Promise.resolve();
      if (path === "/auth/sessions/logout-others")
        return Promise.resolve({ revokedCount: 1 });
      if (path === "/auth/change-password") return Promise.resolve();
      if (path === "/auth/logout") return Promise.resolve();
      return Promise.reject(new Error(`Unexpected ${path}`));
    });
  }

  it("shows disabled 2FA, setup secret, and invalid-code feedback", async () => {
    mockSecurity(false);
    renderAccount(<AccountSecurity role="teacher" />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Set up an authenticator app",
      }),
    );
    expect(await screen.findByText("SECRETKEY")).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: "Open this account in your authenticator app",
      }),
    ).toHaveAttribute("href", expect.stringContaining("otpauth://"));
    await user.type(
      screen.getByRole("textbox", { name: "Enter the 6-digit code" }),
      "123456",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm and enable" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The authenticator code is invalid or expired.",
    );
    expect(apiMock).toHaveBeenCalledWith(
      "/auth/two-factor/enable",
      expect.objectContaining({ body: JSON.stringify({ code: "123456" }) }),
    );
  });

  it("shows enabled 2FA and live session details with current badge", async () => {
    mockSecurity(true, false, true);
    renderAccount(<AccountSecurity role="admin" />);
    expect(await screen.findByText("Lenovo Laptop")).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "Disable two-factor authentication",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Lenovo Laptop")).toBeVisible();
    expect(screen.getByText("This device")).toBeVisible();
    expect(screen.getByText(/Chrome · 192\.0\.2\.1/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out all" })).toBeVisible();
  });

  it("keeps self-service disable for a non-enforced user", async () => {
    mockSecurity(true);
    renderAccount(<AccountSecurity role="teacher" />);
    expect(
      await screen.findByRole("button", {
        name: "Disable two-factor authentication",
      }),
    ).toBeVisible();
  });

  it.each(["en", "ar"] as const)(
    "shows mandatory staff enrollment and logout in %s",
    async (locale) => {
      mockSecurity(false, false, true, true);
      renderAccount(<AccountSecurity role="staff" />, locale);
      expect(
        await screen.findByText(
          locale === "ar"
            ? /المصادقة الثنائية إلزامية/
            : /Multi-factor authentication is required/,
        ),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", {
          name: locale === "ar" ? "حفظ كلمة المرور" : "Save password",
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          locale === "ar" ? "الجلسات النشطة" : "Active sessions",
        ),
      ).not.toBeInTheDocument();
      await userEvent.setup().click(
        screen.getByRole("button", {
          name: locale === "ar" ? "تسجيل الخروج" : "Sign out",
        }),
      );
      await waitFor(() =>
        expect(replaceMock).toHaveBeenCalledWith(`/${locale}/login`),
      );
    },
  );

  it("returns enrolled FinanceAdmin to the existing finance workspace", async () => {
    let enabled = false;
    apiMock.mockImplementation((path: string) => {
      if (path === "/auth/me")
        return Promise.resolve({
          roles: ["FinanceAdmin"],
          requiresMfaEnrollment: !enabled,
        });
      if (path === "/auth/two-factor")
        return Promise.resolve({
          isEnabled: enabled,
          hasAuthenticator: enabled,
          isRequired: true,
        });
      if (path === "/auth/two-factor/setup")
        return Promise.resolve({
          sharedKey: "SECRETKEY",
          authenticatorUri: "otpauth://totp/Betcco?secret=SECRETKEY",
        });
      if (path === "/auth/two-factor/enable") {
        enabled = true;
        return Promise.resolve();
      }
      return Promise.reject(new Error(`Unexpected ${path}`));
    });
    renderAccount(<AccountSecurity role="staff" />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Set up an authenticator app",
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Enter the 6-digit code" }),
      "123456",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm and enable" }),
    );
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/en/admin/wallet"),
    );
  });

  it("revokes a session and redirects when the server says it was current", async () => {
    mockSecurity(false);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderAccount(<AccountSecurity role="student" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/auth/sessions/session-1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/en/login"));
  });

  it("labels logout-all accurately and signs out the current device", async () => {
    mockSecurity(false);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderAccount(<AccountSecurity role="teacher" />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Sign out all" }),
    );
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("including this one"),
    );
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/auth/sessions/logout-all",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/en/login"));
  });

  it("changes the password with the current password and retains this browser", async () => {
    mockSecurity(false);
    renderAccount(<AccountSecurity role="student" />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText("Current password"),
      "T!estPassword123",
    );
    await user.type(screen.getByLabelText("New password"), "N!ewPassword123");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "N!ewPassword123",
    );
    await user.click(screen.getByRole("button", { name: "Save password" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/auth/change-password",
        expect.objectContaining({
          body: JSON.stringify({
            currentPassword: "T!estPassword123",
            newPassword: "N!ewPassword123",
          }),
        }),
      ),
    );
    expect(replaceMock).not.toHaveBeenCalledWith("/en/login");
  });

  it("signs out other devices while keeping the current session", async () => {
    mockSecurity(false, true);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderAccount(<AccountSecurity role="teacher" />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Sign out other devices" }),
    );
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/auth/sessions/logout-others",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(replaceMock).not.toHaveBeenCalledWith("/en/login");
  });
});

describe("password recovery", () => {
  it("keeps the forgot-password response enumeration safe", async () => {
    apiMock.mockResolvedValue(undefined);
    renderAccount(<ResetPasswordForm />);
    const user = userEvent.setup();
    await user.type(
      screen.getByRole("textbox", { name: "Email" }),
      "sam@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "If an eligible account exists",
    );
    expect(apiMock).toHaveBeenCalledWith(
      "/auth/forgot-password",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses the token from the reset link to set a new password", async () => {
    searchMock.value = "userId=user-1&token=token-1";
    apiMock.mockResolvedValue(undefined);
    renderAccount(<ResetPasswordForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("New password"), "LongSecret123!");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "LongSecret123!",
    );
    await user.click(screen.getByRole("button", { name: "Save password" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/auth/reset-password",
        expect.objectContaining({
          body: JSON.stringify({
            userId: "user-1",
            token: "token-1",
            password: "LongSecret123!",
          }),
        }),
      ),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/en/login"));
  });
});
