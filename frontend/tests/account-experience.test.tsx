import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import { AccountProfile } from "@/features/auth/account-profile";
import { AccountSecurity } from "@/features/auth/account-security";
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
});

describe("security with existing endpoints", () => {
  function mockSecurity(enabled: boolean) {
    apiMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/auth/two-factor")
        return Promise.resolve({
          isEnabled: enabled,
          hasAuthenticator: enabled,
        });
      if (path === "/auth/sessions")
        return Promise.resolve({ items: [session] });
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
    mockSecurity(true);
    renderAccount(<AccountSecurity role="admin" />);
    expect(
      await screen.findByRole("button", {
        name: "Disable two-factor authentication",
      }),
    ).toBeVisible();
    expect(screen.getByText("Lenovo Laptop")).toBeVisible();
    expect(screen.getByText("This device")).toBeVisible();
    expect(screen.getByText(/Chrome · 192\.0\.2\.1/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out all" })).toBeVisible();
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
