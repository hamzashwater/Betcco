import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
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
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import { AccountIdentityManagement } from "@/features/admin/account-identity-management";
import {
  identityItems,
  identityPage,
} from "./fixtures/account-identity-archetype";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: apiMock,
}));
const clients: QueryClient[] = [];
function setup(locale: "en" | "ar" = "en") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const refresh = vi.spyOn(client, "invalidateQueries");
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : ar}
    >
      <QueryClientProvider client={client}>
        <AccountIdentityManagement />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { client, refresh };
}
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.restoreAllMocks();
  apiMock.mockReset();
});
const rows = () => screen.getAllByRole("article");
const writes = () =>
  apiMock.mock.calls.filter(([, options]) => options?.method);
function live() {
  apiMock.mockImplementation((_path: string, options?: RequestInit) =>
    Promise.resolve(options?.method ? undefined : identityPage()),
  );
}
function open(index: number) {
  const row = rows()[index];
  fireEvent.click(row.querySelector("summary")!);
  return within(row);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function support(copy = en.adminWorkspace.accountIdentities) {
  fireEvent.click(screen.getByRole("button", { name: copy.supportAdmins }));
  await screen.findByRole("button", { name: copy.send });
  await screen.findByText(identityItems[0].displayName);
}

describe("UI-D01-15 / Slice 2 Account Identity contracts", () => {
  it.each(["en", "ar"] as const)(
    "preserves exact Teacher/SupportAdmin requests, raw order and factual status/eligibility in %s",
    async (locale) => {
      live();
      const { client } = setup(locale),
        c = (locale === "en" ? en : ar).adminWorkspace.accountIdentities;
      await screen.findByText(identityItems[0].displayName);
      expect(apiMock).toHaveBeenCalledExactlyOnceWith(
        "/admin/users?role=Teacher&page=1",
      );
      expect(
        client
          .getQueryCache()
          .find({ queryKey: ["managed-identities", "Teacher", 1] }),
      ).toBeDefined();
      expect(
        screen
          .getAllByRole("heading", { level: 2 })
          .map((el) => el.textContent),
      ).toEqual(identityItems.map((item) => item.displayName));
      for (const [i, item] of identityItems.entries()) {
        expect(
          within(rows()[i]).getByText(item.email, { exact: true }),
        ).toHaveAttribute("dir", "ltr");
        expect(
          within(rows()[i]).getByText(
            item.isFrozen
              ? c.frozen
              : !item.emailConfirmed
                ? c.awaitingActivation
                : c.active,
            { exact: true },
          ),
        ).toBeVisible();
        const v = open(i);
        if (item.mustChangePassword || !item.emailConfirmed) {
          expect(v.getByLabelText(c.newEmail)).toBeDisabled();
          expect(v.getByRole("button", { name: c.changeEmail })).toBeDisabled();
        } else {
          expect(v.getByLabelText(c.newEmail)).toBeEnabled();
          expect(v.getByRole("button", { name: c.changeEmail })).toBeEnabled();
        }
        expect(v.queryByRole("button", { name: c.resend })).toBeNull();
        expect(v.queryByRole("button", { name: c.revoke })).toBeNull();
        expect(v.queryByText(item.id, { exact: true })).toBeNull();
      }
      await support(c);
      expect(apiMock).toHaveBeenLastCalledWith(
        "/admin/users?role=SupportAdmin&page=1",
      );
      expect(
        client
          .getQueryCache()
          .find({ queryKey: ["managed-identities", "SupportAdmin", 1] }),
      ).toBeDefined();
      for (const [i, item] of identityItems.entries()) {
        expect(
          within(rows()[i]).queryByRole("button", { name: c.resend }) !== null,
        ).toBe(!item.emailConfirmed && item.mustChangePassword);
        expect(
          within(rows()[i]).getByRole("button", { name: c.revoke }),
        ).toBeVisible();
      }
      expect(writes()).toEqual([]);
    },
  );

  it("keeps server totals, page bounds and role-switch page reset without client sorting/filtering", async () => {
    live();
    setup();
    await screen.findByText(identityItems[0].displayName);
    const user = userEvent.setup();
    const previous = screen.getByRole("button", { name: "Previous" }),
      next = screen.getByRole("button", { name: "Next" });
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();
    await user.click(next);
    await waitFor(() =>
      expect(apiMock).toHaveBeenLastCalledWith(
        "/admin/users?role=Teacher&page=2",
      ),
    );
    await screen.findByText(identityItems[0].displayName);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenLastCalledWith(
        "/admin/users?role=Teacher&page=3",
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
    await support();
    expect(apiMock).toHaveBeenLastCalledWith(
      "/admin/users?role=SupportAdmin&page=1",
    );
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenLastCalledWith(
        "/admin/users?role=SupportAdmin&page=2",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Teachers" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled(),
    );
    const key = clients[0]
      .getQueryCache()
      .find({ queryKey: ["managed-identities", "Teacher", 1] });
    expect(key).toBeDefined();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((el) => el.textContent),
    ).toEqual(identityItems.map((i) => i.displayName));
  });

  it.each(["freeze", "reactivate", "revoke"] as const)(
    "preserves %s confirmation, cancellation and exact POST timing/payload",
    async (kind) => {
      const events: string[] = [];
      live();
      setup();
      await screen.findByText(identityItems[0].displayName);
      await support();
      const index = kind === "reactivate" ? 1 : 0,
        item = identityItems[index],
        c = en.adminWorkspace.accountIdentities;
      const label =
        kind === "revoke"
          ? c.revoke
          : kind === "freeze"
            ? c.freeze
            : c.reactivate;
      const text =
        kind === "revoke"
          ? c.revokeConfirmation.replace("{name}", item.displayName)
          : kind === "freeze"
            ? c.freezeConfirmation
            : c.reactivateConfirmation;
      const endpoint =
        kind === "revoke"
          ? `/admin/users/support-admins/${item.id}/revoke-authority`
          : `/admin/users/${item.id}/freeze`;
      const confirm = vi.spyOn(window, "confirm").mockImplementation(() => {
        events.push("confirm");
        expect(writes()).toHaveLength(0);
        return false;
      });
      const button = within(rows()[index]).getByRole("button", { name: label });
      fireEvent.click(button);
      expect(confirm).toHaveBeenCalledWith(text);
      expect(writes()).toEqual([]);
      const held = deferred<void>();
      apiMock.mockImplementation((path: string, options?: RequestInit) => {
        if (options?.method) {
          events.push("POST");
          return held.promise;
        }
        return Promise.resolve(identityPage());
      });
      confirm.mockImplementation(() => {
        events.push("confirm");
        expect(writes()).toHaveLength(0);
        return true;
      });
      fireEvent.click(button);
      await waitFor(() => expect(writes()).toHaveLength(1));
      expect(events).toEqual(["confirm", "confirm", "POST"]);
      expect(writes()[0]).toEqual([
        endpoint,
        kind === "revoke"
          ? { method: "POST" }
          : {
              method: "POST",
              body: JSON.stringify({ frozen: kind === "freeze" }),
            },
      ]);
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "true");
      expect(screen.queryByRole("status")).toBeNull();
      await act(async () => {
        held.resolve();
        await held.promise;
      });
      await waitFor(() => expect(button).toBeEnabled());
      if (kind === "revoke")
        expect(await screen.findByRole("status")).toHaveTextContent(
          c.revokeSuccess,
        );
      expect(writes().map(([p]) => p)).not.toContain(
        kind === "revoke"
          ? `/admin/users/${item.id}/freeze`
          : `/admin/users/support-admins/${item.id}/revoke-authority`,
      );
    },
  );

  it("preserves bodyless resend eligibility/endpoint and success after response", async () => {
    live();
    setup();
    await screen.findByText(identityItems[0].displayName);
    await support();
    const held = deferred<void>();
    apiMock.mockImplementation((_p: string, o?: RequestInit) =>
      o?.method ? held.promise : Promise.resolve(identityPage()),
    );
    const button = within(rows()[2]).getByRole("button", {
      name: en.adminWorkspace.accountIdentities.resend,
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(writes()).toEqual([
        [
          "/admin/users/support-admins/identity-pending/resend-activation",
          { method: "POST" },
        ],
      ]),
    );
    expect(button).toBeDisabled();
    expect(screen.queryByRole("status")).toBeNull();
    await act(async () => {
      held.resolve();
      await held.promise;
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      en.adminWorkspace.accountIdentities.resendSuccess,
    );
  });

  it("isolates drafts, retains mounted fields across disclosures, submits the correct ID/email and clears only that user's draft", async () => {
    live();
    setup();
    await screen.findByText(identityItems[0].displayName);
    const a = open(0),
      b = open(5);
    const inputA = a.getByLabelText("New email"),
      inputB = b.getByLabelText("New email");
    fireEvent.change(inputA, { target: { value: "new.zed@example.test" } });
    fireEvent.change(inputB, { target: { value: "keep.beta@example.test" } });
    fireEvent.click(rows()[0].querySelector("summary")!);
    fireEvent.click(rows()[5].querySelector("summary")!);
    open(5);
    open(0);
    expect(within(rows()[0]).getByLabelText("New email")).toBe(inputA);
    expect(inputA).toHaveValue("new.zed@example.test");
    expect(inputB).toHaveValue("keep.beta@example.test");
    expect(writes()).toEqual([]);
    const held = deferred<void>();
    apiMock.mockImplementation((_p: string, o?: RequestInit) =>
      o?.method ? held.promise : Promise.resolve(identityPage()),
    );
    fireEvent.click(a.getByRole("button", { name: "Request email change" }));
    await waitFor(() =>
      expect(writes()).toEqual([
        [
          "/admin/users/identity-z/email-change/request",
          {
            method: "POST",
            body: JSON.stringify({ newEmail: "new.zed@example.test" }),
          },
        ],
      ]),
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(
      a.getByRole("button", { name: "Request email change" }),
    ).toBeDisabled();
    await act(async () => {
      held.resolve();
      await held.promise;
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      en.adminWorkspace.accountIdentities.emailSuccess,
    );
    expect(inputA).toHaveValue("");
    expect(inputB).toHaveValue("keep.beta@example.test");
  });

  it.each(["email", "freeze", "resend", "revoke"] as const)(
    "keeps other drafts and reports factual general error when %s fails",
    async (action) => {
      live();
      setup();
      await screen.findByText(identityItems[0].displayName);
      await support();
      const a = open(0),
        b = open(5);
      fireEvent.change(a.getByLabelText("New email"), {
        target: { value: "own@example.test" },
      });
      fireEvent.change(b.getByLabelText("New email"), {
        target: { value: "other@example.test" },
      });
      vi.spyOn(window, "confirm").mockReturnValue(true);
      apiMock.mockImplementation((_p: string, o?: RequestInit) =>
        o?.method
          ? Promise.reject(new Error("RAW private backend error"))
          : Promise.resolve(identityPage()),
      );
      const labels = {
        email: "Request email change",
        freeze: "Freeze",
        resend: "Resend invitation",
        revoke: "Revoke support access",
      };
      fireEvent.click(
        within(rows()[action === "resend" ? 2 : 0]).getByRole("button", {
          name: labels[action],
        }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        en.adminWorkspace.accountIdentities.actionError,
      );
      expect(b.getByLabelText("New email")).toHaveValue("other@example.test");
      expect(a.getByLabelText("New email")).toHaveValue("own@example.test");
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByText("RAW private backend error")).toBeNull();
    },
  );

  it.each(["success", "failure"] as const)(
    "preserves native invite validation, pending and %s field ownership",
    async (result) => {
      live();
      const { refresh } = setup();
      await screen.findByText(identityItems[0].displayName);
      await support();
      const typed = open(0).getByLabelText("New email");
      fireEvent.change(typed, { target: { value: "keep@example.test" } });
      const name = screen.getByLabelText("Name"),
        email = screen.getByLabelText("Work email"),
        button = screen.getByRole("button", { name: "Send invitation" });
      expect(name).toBeRequired();
      expect(name).toHaveAttribute("minLength", "2");
      expect(name).toHaveAttribute("maxLength", "160");
      expect(email).toHaveAttribute("type", "email");
      expect(email).toBeRequired();
      expect(email).toHaveAttribute("maxLength", "320");
      expect(button.closest("form")!.checkValidity()).toBe(false);
      fireEvent.change(name, { target: { value: "Raw Support" } });
      fireEvent.change(email, { target: { value: "invite@example.test" } });
      const held = deferred<void>();
      apiMock.mockImplementation((_p: string, o?: RequestInit) =>
        o?.method ? held.promise : Promise.resolve(identityPage()),
      );
      fireEvent.click(button);
      await waitFor(() =>
        expect(writes()).toEqual([
          [
            "/admin/users/support-admins/invite",
            {
              method: "POST",
              body: JSON.stringify({
                displayName: "Raw Support",
                email: "invite@example.test",
              }),
            },
          ],
        ]),
      );
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "true");
      expect(screen.queryByRole("status")).toBeNull();
      await act(async () => {
        if (result === "success") held.resolve();
        else held.reject(new Error("private invite error"));
        await held.promise.catch(() => {});
      });
      if (result === "success") {
        expect(await screen.findByRole("status")).toHaveTextContent(
          en.adminWorkspace.accountIdentities.inviteSuccess,
        );
        expect(name).toHaveValue("");
        expect(email).toHaveValue("");
        expect(refresh).toHaveBeenCalledWith({
          queryKey: ["managed-identities"],
        });
      } else {
        expect(await screen.findByRole("alert")).toHaveTextContent(
          en.adminWorkspace.accountIdentities.inviteError,
        );
        expect(name).toHaveValue("Raw Support");
        expect(email).toHaveValue("invite@example.test");
        expect(refresh).not.toHaveBeenCalled();
        expect(screen.queryByRole("status")).toBeNull();
      }
      expect(within(rows()[0]).getByLabelText("New email")).toBe(typed);
      expect(typed).toHaveValue("keep@example.test");
    },
  );

  it.each(["pending", "error", "empty"] as const)(
    "distinguishes %s with no invented authorization status or analytics",
    async (state) => {
      apiMock.mockImplementation(() =>
        state === "pending"
          ? new Promise(() => {})
          : state === "error"
            ? Promise.reject(new Error("RAW 403 inference forbidden"))
            : Promise.resolve(identityPage([], 0)),
      );
      setup();
      if (state === "pending")
        expect(await screen.findByRole("status")).toHaveTextContent(
          en.adminWorkspace.accountIdentities.loading,
        );
      else if (state === "error")
        expect(await screen.findByRole("alert")).toHaveTextContent(
          en.adminWorkspace.accountIdentities.loadError,
        );
      else
        expect(
          await screen.findByText(en.adminWorkspace.accountIdentities.empty),
        ).toBeVisible();
      expect(screen.queryByRole("article")).toBeNull();
      expect(writes()).toEqual([]);
      if (state !== "empty")
        expect(
          screen.queryByText(en.adminWorkspace.accountIdentities.empty),
        ).toBeNull();
    },
  );
});
