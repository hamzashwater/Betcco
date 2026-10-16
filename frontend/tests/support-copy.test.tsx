import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { SupportAccountArea } from "@/features/support/support-account-area";
import { SupportCenter } from "@/features/support/support-center";
import { formatLocalizedDateTime } from "@/i18n/date-time";
import {
  supportDetail,
  supportList,
  supportSummary,
  supportTarget,
} from "./helpers/support-fixtures";

const apiMock = vi.hoisted(() =>
  vi.fn<(path: string, options?: RequestInit) => Promise<unknown>>(),
);
vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("@/features/auth/account-profile", () => ({
  AccountProfile: ({ role }: { role: string }) => (
    <p data-testid="profile">{role}</p>
  ),
}));
vi.mock("@/features/auth/account-security", () => ({
  AccountSecurity: ({ role }: { role: string }) => (
    <p data-testid="security">{role}</p>
  ),
}));
afterEach(() => {
  cleanup();
  apiMock.mockReset();
  vi.restoreAllMocks();
});
function view(element: React.ReactNode, locale: "ar" | "en") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  return {
    ...render(
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? ar : en}
      >
        <QueryClientProvider client={client}>{element}</QueryClientProvider>
      </NextIntlClientProvider>,
    ),
    invalidate,
  };
}
const messages = (locale: "ar" | "en") =>
  (locale === "ar" ? ar : en).supportWorkspace;
function tickets(detail = supportDetail) {
  apiMock.mockImplementation((path) =>
    Promise.resolve(
      path === "/support/tickets?page=1&pageSize=50"
        ? {
            ...supportList,
            items: [{ ...supportSummary, status: detail.status }],
          }
        : detail,
    ),
  );
}

describe("SupportAccountArea real AR/EN catalogues", () => {
  it.each(["ar", "en"] as const)(
    "preserves viewer loading/denial, target loading/error/empty precedence (%s)",
    async (locale) => {
      const copy = messages(locale).account;
      apiMock.mockImplementation(() => new Promise(() => {}));
      view(<SupportAccountArea segment={[]} />, locale);
      expect(screen.getByText(copy.loading)).toHaveAttribute(
        "aria-busy",
        "true",
      );
      cleanup();
      apiMock.mockResolvedValue({ roles: ["Student"] });
      view(<SupportAccountArea segment={[]} />, locale);
      expect(await screen.findByRole("alert")).toHaveTextContent(copy.denied);
      expect(
        apiMock.mock.calls.filter(([path]) => path.startsWith("/admin/users/")),
      ).toEqual([]);
      cleanup();
      apiMock.mockReset();
      apiMock.mockImplementation((path) =>
        path === "/auth/me"
          ? Promise.resolve({ roles: ["SupportAdmin"] })
          : new Promise(() => {}),
      );
      view(<SupportAccountArea segment={[]} />, locale);
      expect(await screen.findByText(copy.loadingAccounts)).toHaveAttribute(
        "aria-busy",
        "true",
      );
      cleanup();
      apiMock.mockImplementation((path) =>
        path === "/auth/me"
          ? Promise.resolve({ roles: ["SupportAdmin"] })
          : Promise.reject(new Error("RAW target query error")),
      );
      view(<SupportAccountArea segment={[]} />, locale);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        copy.loadFailed,
      );
      cleanup();
      apiMock.mockImplementation((path) =>
        Promise.resolve(
          path === "/auth/me"
            ? { roles: ["SupportAdmin"] }
            : { items: [], totalCount: 0 },
        ),
      );
      view(<SupportAccountArea segment={[]} />, locale);
      expect(await screen.findByText(copy.empty)).toBeVisible();
      expect(screen.getByRole("button", { name: copy.next })).toBeDisabled();
    },
  );
  it.each([
    [["SupportAdmin"], true],
    [["Admin"], true],
    [["SystemAdmin"], true],
    [["Student", "Admin"], true],
    [["Student"], false],
    [["Teacher"], false],
    [["FinanceAdmin"], false],
    [[], false],
  ] as const)(
    "retains the existing includes-role permission condition (%j)",
    async (roles, allowed) => {
      for (const locale of ["ar", "en"] as const) {
        apiMock.mockImplementation((path) =>
          Promise.resolve(
            path === "/auth/me"
              ? { roles }
              : { items: [supportTarget], totalCount: 1 },
          ),
        );
        view(<SupportAccountArea segment={["accounts"]} />, locale);
        if (allowed)
          expect(
            await screen.findByText(supportTarget.displayName),
          ).toBeVisible();
        else {
          expect(await screen.findByRole("alert")).toHaveTextContent(
            messages(locale).account.denied,
          );
          expect(
            apiMock.mock.calls.some(([path]) =>
              path.startsWith("/admin/users/"),
            ),
          ).toBe(false);
        }
        cleanup();
        apiMock.mockReset();
      }
    },
  );
  it.each(["ar", "en"] as const)(
    "keeps raw search/term separation, 25-row pagination, Student/Teacher domain and reset semantics (%s)",
    async (locale) => {
      const copy = messages(locale).account;
      apiMock.mockImplementation((path) =>
        Promise.resolve(
          path === "/auth/me"
            ? { roles: ["SupportAdmin"] }
            : { items: [supportTarget], totalCount: 51 },
        ),
      );
      view(<SupportAccountArea segment={["accounts"]} />, locale);
      expect(await screen.findByText(supportTarget.displayName)).toBeVisible();
      expect(screen.getByText(supportTarget.email)).toHaveAttribute(
        "dir",
        "ltr",
      );
      const search = screen.getByRole("textbox", { name: copy.searchLabel });
      expect(search).toHaveAttribute("maxLength", "100");
      expect(search).toHaveAttribute("placeholder", copy.searchPlaceholder);
      expect(
        await screen.findByRole("button", { name: copy.previous }),
      ).toBeDisabled();
      const raw = "  RAW بحث  ";
      fireEvent.change(search, { target: { value: raw } });
      expect(
        apiMock.mock.calls
          .filter(([path]) => path.startsWith("/admin/users/freeze-targets?"))
          .every(
            ([path]) =>
              new URL(path, "https://test.invalid").searchParams.get(
                "search",
              ) === "",
          ),
      ).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: copy.search }));
      await waitFor(() =>
        expect(
          apiMock.mock.calls.some(
            ([path]) =>
              path.startsWith("/admin/users/freeze-targets?") &&
              new URL(path, "https://test.invalid").searchParams.get(
                "search",
              ) === raw,
          ),
        ).toBe(true),
      );
      fireEvent.click(await screen.findByRole("button", { name: copy.next }));
      await waitFor(() =>
        expect(
          apiMock.mock.calls.some(([path]) => path.endsWith("&page=2")),
        ).toBe(true),
      );
      fireEvent.click(await screen.findByRole("button", { name: copy.next }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: copy.next })).toBeDisabled(),
      );
      fireEvent.click(screen.getByRole("button", { name: copy.previous }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: copy.next })).toBeEnabled(),
      );
      fireEvent.click(screen.getByRole("button", { name: copy.teachers }));
      await waitFor(() =>
        expect(
          apiMock.mock.calls.some(([path]) => {
            if (!path.startsWith("/admin/users/freeze-targets?")) return false;
            const query = new URL(path, "https://test.invalid").searchParams;
            return (
              query.get("role") === "Teacher" &&
              query.get("search") === raw &&
              query.get("page") === "1"
            );
          }),
        ).toBe(true),
      );
      expect(
        screen.getByRole("button", { name: copy.teachers }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        await screen.findByRole("button", { name: copy.previous }),
      ).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
    },
  );
  it.each(["ar", "en"] as const)(
    "retains cancellation, localized confirmations, pending guard, exact freeze/reactivate bodies and invalidation (%s)",
    async (locale) => {
      const copy = messages(locale).account,
        target = { ...supportTarget };
      let release: (() => void) | undefined;
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      apiMock.mockImplementation(async (path, options) => {
        if (path === "/auth/me") return { roles: ["SupportAdmin"] };
        if (options?.method === "POST") {
          await hold;
          target.isFrozen = JSON.parse(String(options.body)).frozen as boolean;
          return;
        }
        return { items: [{ ...target }], totalCount: 1 };
      });
      const rendered = view(
        <SupportAccountArea segment={["accounts"]} />,
        locale,
      );
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      fireEvent.click(await screen.findByRole("button", { name: copy.freeze }));
      expect(confirm).toHaveBeenCalledWith(copy.confirmFreeze);
      expect(
        apiMock.mock.calls.some(([, options]) => options?.method === "POST"),
      ).toBe(false);
      confirm.mockReturnValue(true);
      fireEvent.click(screen.getByRole("button", { name: copy.freeze }));
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: copy.freeze }),
        ).toBeDisabled(),
      );
      expect(apiMock).toHaveBeenCalledWith(
        "/admin/users/raw-account-17/freeze",
        { method: "POST", body: JSON.stringify({ frozen: true }) },
      );
      release?.();
      fireEvent.click(
        await screen.findByRole("button", { name: copy.reactivate }),
      );
      expect(confirm).toHaveBeenCalledWith(copy.confirmReactivate);
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/admin/users/raw-account-17/freeze",
          { method: "POST", body: JSON.stringify({ frozen: false }) },
        ),
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: copy.freeze })).toBeEnabled(),
      );
      expect(rendered.invalidate).toHaveBeenCalledWith({
        queryKey: ["support-freeze-targets"],
      });
    },
  );
  it.each(["profile", "security"] as const)(
    "retains the excluded child route and support role: %s",
    async (segment) => {
      apiMock.mockResolvedValue({ roles: ["SupportAdmin"] });
      view(<SupportAccountArea segment={[segment]} />, "en");
      expect(await screen.findByTestId(segment)).toHaveTextContent("support");
      expect(
        apiMock.mock.calls.some(([path]) =>
          path.startsWith("/admin/users/freeze-targets?"),
        ),
      ).toBe(false);
    },
  );
});

for (const mode of ["student", "admin"] as const) {
  describe(`SupportCenter ${mode}`, () => {
    it.each(["ar", "en"] as const)(
      "localizes presentation/accessibility and preserves raw subject/category/body/timestamps and mode controls (%s)",
      async (locale) => {
        const copy = messages(locale).center;
        tickets();
        view(<SupportCenter mode={mode} />, locale);
        expect(
          await screen.findByText(/RAW learner message/u),
        ).toHaveTextContent("RAW learner message");
        expect(screen.getByText(/RAW learner message/u).textContent).toBe(
          supportDetail.messages[0].body,
        );
        expect(screen.getByText(/RAW support answer/u).textContent).toBe(
          supportDetail.messages[1].body,
        );
        expect(screen.getAllByText(supportSummary.subject)).toHaveLength(2);
        expect(screen.getByText(supportSummary.category)).toBeVisible();
        expect(
          screen.getAllByText(
            formatLocalizedDateTime(supportSummary.updatedAtUtc, locale),
          ).length,
        ).toBeGreaterThan(0);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
          mode === "admin" ? copy.adminTitle : copy.studentTitle,
        );
        expect(screen.getByText(copy.eyebrow)).toBeVisible();
        expect(
          screen.getByRole("button", { name: copy.sendReply }),
        ).toBeDisabled();
        if (mode === "admin") {
          expect(
            screen.getByRole("button", { name: copy.startWork }),
          ).toBeVisible();
          expect(
            screen.queryByRole("button", { name: copy.openTicket }),
          ).toBeNull();
        } else {
          expect(
            screen.queryByRole("button", { name: copy.startWork }),
          ).toBeNull();
          expect(screen.getByText(copy.securityWarning)).toBeVisible();
          expect(
            screen.getByRole("button", { name: copy.openTicket }),
          ).toBeDisabled();
          expect(
            screen.getByRole("textbox", { name: copy.subject }),
          ).toHaveAttribute("maxLength", "200");
          expect(
            screen.getByRole("textbox", { name: copy.openingMessage }),
          ).toHaveAttribute("maxLength", "4000");
          const categories = within(
            screen.getByRole("combobox", { name: copy.category }),
          ).getAllByRole("option");
          expect(
            categories.map((option) => option.getAttribute("value")),
          ).toEqual(["General", "Technical", "Payment", "Course", "Safety"]);
          expect(categories.map((option) => option.textContent)).toEqual(
            Object.values(copy.categories),
          );
        }
      },
    );
    it.each(["ar", "en"] as const)(
      "retains unknown raw status and Closed reply guards (%s)",
      async (locale) => {
        const copy = messages(locale).center;
        tickets({ ...supportDetail, status: "RAW UnknownStatus" });
        view(<SupportCenter mode={mode} />, locale);
        await waitFor(() =>
          expect(screen.getAllByText("RAW UnknownStatus")).toHaveLength(2),
        );
        cleanup();
        tickets({ ...supportDetail, status: "Closed" });
        view(<SupportCenter mode={mode} />, locale);
        expect(
          await screen.findByPlaceholderText(copy.closedPlaceholder),
        ).toBeDisabled();
        expect(
          screen.getByRole("button", { name: copy.sendReply }),
        ).toBeDisabled();
        expect(screen.queryByRole("button", { name: copy.close })).toBeNull();
      },
    );
    it.each(["ar", "en"] as const)(
      "retains reply trim, pending/reset/refresh and raw Error.message precedence (%s)",
      async (locale) => {
        const copy = messages(locale).center;
        let release: (() => void) | undefined;
        const hold = new Promise<void>((resolve) => {
          release = resolve;
        });
        apiMock.mockImplementation((path, options) =>
          options?.method
            ? hold
            : Promise.resolve(path.includes("?") ? supportList : supportDetail),
        );
        const rendered = view(<SupportCenter mode={mode} />, locale);
        const reply = await screen.findByPlaceholderText(copy.replyPlaceholder);
        expect(reply).toHaveAttribute("maxLength", "4000");
        fireEvent.change(reply, { target: { value: "   " } });
        expect(
          screen.getByRole("button", { name: copy.sendReply }),
        ).toBeDisabled();
        fireEvent.change(reply, { target: { value: "  RAW reply رد خام  " } });
        fireEvent.click(screen.getByRole("button", { name: copy.sendReply }));
        await waitFor(() => expect(reply).toBeDisabled());
        expect(apiMock).toHaveBeenCalledWith(
          "/support/tickets/raw-ticket-17/messages",
          {
            method: "POST",
            body: JSON.stringify({ message: "RAW reply رد خام" }),
          },
        );
        release?.();
        await waitFor(() => expect(reply).toHaveValue(""));
        expect(rendered.invalidate).toHaveBeenCalledWith({
          queryKey: ["support-tickets", mode],
        });
        expect(rendered.invalidate).toHaveBeenCalledWith({
          queryKey: ["support-ticket", "raw-ticket-17"],
        });
        apiMock.mockImplementation((path, options) =>
          options?.method
            ? Promise.reject(new Error("RAW server reply rejection رفض خام"))
            : Promise.resolve(path.includes("?") ? supportList : supportDetail),
        );
        fireEvent.change(reply, { target: { value: "again" } });
        fireEvent.click(screen.getByRole("button", { name: copy.sendReply }));
        expect(await screen.findByRole("alert")).toHaveTextContent(
          "RAW server reply rejection رفض خام",
        );
        expect(screen.queryByText(copy.replyFailed)).toBeNull();
        apiMock.mockImplementation((path, options) =>
          options?.method
            ? Promise.reject("non-Error rejection")
            : Promise.resolve(path.includes("?") ? supportList : supportDetail),
        );
        fireEvent.click(screen.getByRole("button", { name: copy.sendReply }));
        expect(await screen.findByText(copy.replyFailed)).toBeVisible();
      },
    );
  });
}

describe("SupportCenter create/status/query contracts", () => {
  it.each([
    ["Open", "open"],
    ["InProgress", "inProgress"],
    ["WaitingForStudent", "waitingForStudent"],
    ["Resolved", "resolved"],
    ["Closed", "closed"],
  ] as const)(
    "preserves both exact display pairs for status %s",
    async (status, key) => {
      for (const locale of ["ar", "en"] as const) {
        tickets({ ...supportDetail, status });
        view(<SupportCenter mode="admin" />, locale);
        await screen.findByText(/RAW learner message/u);
        expect(
          screen.getAllByText(messages(locale).center.status[key]),
        ).toHaveLength(2);
        cleanup();
        apiMock.mockReset();
      }
    },
  );
  it.each(["ar", "en"] as const)(
    "retains create trim/category/reset, created-id selection and raw/local error branches (%s)",
    async (locale) => {
      const copy = messages(locale).center;
      let release:
        ((result: { id: string; status: string }) => void) | undefined;
      const hold = new Promise<{ id: string; status: string }>((resolve) => {
        release = resolve;
      });
      apiMock.mockImplementation((path, options) =>
        options?.method
          ? hold
          : Promise.resolve(
              path.includes("?")
                ? supportList
                : { ...supportDetail, id: path.split("/").at(-1) },
            ),
      );
      const rendered = view(<SupportCenter mode="student" />, locale);
      const subject = screen.getByRole("textbox", { name: copy.subject }),
        message = screen.getByRole("textbox", { name: copy.openingMessage }),
        category = screen.getByRole("combobox", { name: copy.category });
      fireEvent.change(subject, { target: { value: "  RAW create موضوع  " } });
      fireEvent.change(message, { target: { value: "  RAW opening رسالة  " } });
      fireEvent.change(category, { target: { value: "Payment" } });
      fireEvent.click(screen.getByRole("button", { name: copy.openTicket }));
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: copy.sending }),
        ).toBeDisabled(),
      );
      expect(apiMock).toHaveBeenCalledWith("/support/tickets", {
        method: "POST",
        body: JSON.stringify({
          subject: "RAW create موضوع",
          category: "Payment",
          message: "RAW opening رسالة",
        }),
      });
      release?.({ id: "raw-created-ticket-19", status: "Open" });
      await waitFor(() => expect(subject).toHaveValue(""));
      expect(message).toHaveValue("");
      expect(category).toHaveValue("General");
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/support/tickets/raw-created-ticket-19",
        ),
      );
      expect(rendered.invalidate).toHaveBeenCalledWith({
        queryKey: ["support-tickets", "student"],
      });
      for (const [error, expected] of [
        [
          new Error("RAW create rejection رفض خام"),
          "RAW create rejection رفض خام",
        ],
        ["not Error", copy.createFailed],
      ] as const) {
        apiMock.mockImplementation((path, options) =>
          options?.method
            ? Promise.reject(error)
            : Promise.resolve(path.includes("?") ? supportList : supportDetail),
        );
        fireEvent.change(subject, { target: { value: "next" } });
        fireEvent.change(message, { target: { value: "next message" } });
        fireEvent.click(screen.getByRole("button", { name: copy.openTicket }));
        expect(await screen.findByText(expected)).toBeVisible();
      }
    },
  );
  it.each(["ar", "en"] as const)(
    "admin sends exactly the three managed status values and preserves pending/raw/local failures (%s)",
    async (locale) => {
      const copy = messages(locale).center;
      let release: (() => void) | undefined;
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      apiMock.mockImplementation((path, options) =>
        options?.method
          ? hold
          : Promise.resolve(path.includes("?") ? supportList : supportDetail),
      );
      const rendered = view(<SupportCenter mode="admin" />, locale);
      fireEvent.click(
        await screen.findByRole("button", { name: copy.startWork }),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: copy.resolve }),
        ).toBeDisabled(),
      );
      expect(apiMock).toHaveBeenCalledWith(
        "/support/tickets/raw-ticket-17/status",
        { method: "POST", body: JSON.stringify({ status: "InProgress" }) },
      );
      release?.();
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: copy.resolve }),
        ).toBeEnabled(),
      );
      for (const [label, status] of [
        [copy.resolve, "Resolved"],
        [copy.close, "Closed"],
      ] as const) {
        fireEvent.click(screen.getByRole("button", { name: label }));
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith(
            "/support/tickets/raw-ticket-17/status",
            { method: "POST", body: JSON.stringify({ status }) },
          ),
        );
        await waitFor(() =>
          expect(screen.getByRole("button", { name: label })).toBeEnabled(),
        );
      }
      expect(rendered.invalidate).toHaveBeenCalledWith({
        queryKey: ["support-tickets", "admin"],
      });
      expect(rendered.invalidate).toHaveBeenCalledWith({
        queryKey: ["support-ticket", "raw-ticket-17"],
      });
      for (const [error, expected] of [
        [
          new Error("RAW status rejection رفض خام"),
          "RAW status rejection رفض خام",
        ],
        ["not Error", copy.statusFailed],
      ] as const) {
        apiMock.mockImplementation((path, options) =>
          options?.method
            ? Promise.reject(error)
            : Promise.resolve(path.includes("?") ? supportList : supportDetail),
        );
        fireEvent.click(screen.getByRole("button", { name: copy.resolve }));
        expect(await screen.findByText(expected)).toBeVisible();
      }
    },
  );
  it.each(["ar", "en"] as const)(
    "keeps loading/error/empty/detail precedence and explicit ticket selection (%s)",
    async (locale) => {
      const copy = messages(locale).center;
      apiMock.mockImplementation(() => new Promise(() => {}));
      const pending = view(<SupportCenter mode="student" />, locale);
      expect(
        pending.container.querySelector('[aria-busy="true"]'),
      ).toBeTruthy();
      cleanup();
      apiMock.mockRejectedValue(new Error("RAW list query failure"));
      view(<SupportCenter mode="student" />, locale);
      expect(await screen.findByText(copy.listFailed)).toBeVisible();
      cleanup();
      apiMock.mockResolvedValue({
        items: [],
        totalCount: 0,
        page: 1,
        pageSize: 50,
      });
      view(<SupportCenter mode="admin" />, locale);
      expect(await screen.findByText(copy.adminEmpty)).toBeVisible();
      expect(screen.getByText(copy.chooseTicket)).toBeVisible();
      cleanup();
      apiMock.mockImplementation((path) =>
        path.includes("?")
          ? Promise.resolve(supportList)
          : Promise.reject(new Error("RAW detail failure")),
      );
      view(<SupportCenter mode="student" />, locale);
      expect(await screen.findByText(copy.detailFailed)).toBeVisible();
      cleanup();
      apiMock.mockImplementation((path) =>
        Promise.resolve(
          path.includes("?")
            ? {
                ...supportList,
                items: [
                  supportSummary,
                  {
                    ...supportSummary,
                    id: "raw-second-ticket-18",
                    subject: "RAW Second subject",
                  },
                ],
              }
            : { ...supportDetail, id: path.split("/").at(-1) },
        ),
      );
      view(<SupportCenter mode="student" />, locale);
      fireEvent.click(
        await screen.findByRole("button", { name: /RAW Second subject/u }),
      );
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/support/tickets/raw-second-ticket-18",
        ),
      );
      expect(
        screen.getByRole("button", { name: /RAW Second subject/u }),
      ).toHaveAttribute("aria-pressed", "true");
    },
  );
});
