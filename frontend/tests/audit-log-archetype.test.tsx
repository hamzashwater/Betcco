import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
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
import { AuditLogViewer } from "@/features/admin/audit-log";
import { auditItems, auditPage } from "./fixtures/audit-log-archetype";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: apiMock,
}));
const clients: QueryClient[] = [];
function setup(locale: "en" | "ar" = "en") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : ar}
    >
      <QueryClientProvider client={client}>
        <AuditLogViewer />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return client;
}
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  apiMock.mockReset();
  onlineManager.setOnline(true);
});
const rows = () => screen.getAllByRole("article");
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("Audit Log compact ledger contracts", () => {
  it("shows initial pending while offline without inventing empty results", async () => {
    onlineManager.setOnline(false);
    apiMock.mockResolvedValue(auditPage());
    setup();
    expect(screen.getByRole("status")).toHaveTextContent(en.auditLog.loading);
    expect(screen.queryByText(en.auditLog.empty)).toBeNull();
    expect(apiMock).not.toHaveBeenCalled();
  });
  it.each(["en", "ar"] as const)(
    "preserves raw server order, complete IDs, outcomes and exact disclosed content in %s",
    async (locale) => {
      apiMock.mockResolvedValue(auditPage());
      setup(locale);
      await screen.findByText(auditItems[0].action);
      const t = (locale === "en" ? en : ar).auditLog;
      expect(rows()).toHaveLength(4);
      rows().forEach((row, index) => {
        const item = auditItems[index];
        expect(within(row).getByText(item.action)).toBeVisible();
        expect(within(row).getByText(item.entityId)).toHaveTextContent(
          item.entityId,
        );
        expect(within(row).getByText(item.outcome)).toHaveAttribute(
          "data-outcome",
          item.outcome,
        );
        expect(row.querySelector("time")).toHaveAttribute(
          "datetime",
          item.createdAtUtc,
        );
        const details = within(row).getByText(t.details).closest("details")!;
        expect(details).not.toHaveAttribute("open");
        fireEvent.click(within(row).getByText(t.details));
        expect(details).toHaveAttribute("open");
        expect(details.querySelector("pre")?.textContent).toBe(
          item.metadataJson,
        );
        expect(details.querySelector("pre")).toHaveAttribute("dir", "ltr");
        expect(details.textContent).toContain(
          [item.ipAddress, item.userAgent, item.correlationId].join(" · "),
        );
        fireEvent.click(within(row).getByText(t.changes));
        const changes = within(row).getByText(t.changes).closest("details")!;
        expect(changes).toHaveAttribute("open");
        expect(
          [...changes.querySelectorAll("pre")].map((p) => p.textContent),
        ).toEqual([item.oldValuesJson, item.newValuesJson]);
        changes
          .querySelectorAll("pre")
          .forEach((p) => expect(p).toHaveAttribute("dir", "ltr"));
        expect(within(changes).getByText(t.oldValue)).toBeVisible();
        expect(within(changes).getByText(t.newValue)).toBeVisible();
      });
      expect(apiMock).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps draft filters local and preserves server rows during a placeholder request; Apply and Clear reset page 1", async () => {
    const held = deferred<ReturnType<typeof auditPage>>();
    apiMock.mockResolvedValue(auditPage());
    setup();
    await screen.findByText(auditItems[0].action);
    const user = userEvent.setup();
    expect(screen.getByText("Page 1 of 3")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenLastCalledWith(
        "/admin/audit-logs?page=2&pageSize=25",
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page 3 of 3");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    const calls = apiMock.mock.calls.length;
    await user.type(
      screen.getByRole("textbox", { name: "Search" }),
      "  no-local-match  ",
    );
    await user.type(
      screen.getByLabelText("Action contains"),
      "  Server.Action  ",
    );
    await user.type(screen.getByLabelText("Entity type contains"), "  Type  ");
    expect(apiMock).toHaveBeenCalledTimes(calls);
    expect(rows()).toHaveLength(4); // No local filtering or sorting.
    apiMock.mockReturnValueOnce(held.promise);
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenLastCalledWith(
        "/admin/audit-logs?page=1&pageSize=25&search=no-local-match&action=Server.Action&entityType=Type",
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent(en.auditLog.loading);
    expect(rows()[0]).toHaveTextContent(auditItems[0].action);
    expect(screen.queryByText(en.auditLog.empty)).toBeNull();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await act(async () => {
      held.resolve(auditPage());
      await held.promise;
    });
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page 2 of 3");
    await user.click(screen.getByRole("button", { name: "Clear" }));
    await screen.findByText("Page 1 of 3");
    expect(screen.getByRole("textbox", { name: "Search" })).toHaveValue("");
    expect(screen.getByLabelText("Action contains")).toHaveValue("");
    expect(apiMock).toHaveBeenLastCalledWith(
      "/admin/audit-logs?page=1&pageSize=25",
    );
  });

  it("does not call a previous empty placeholder a successful no-match for a new applied request", async () => {
    apiMock.mockResolvedValueOnce(auditPage(1, [], 0));
    setup();
    await screen.findByText(en.auditLog.empty);
    const held = deferred<ReturnType<typeof auditPage>>();
    apiMock.mockReturnValueOnce(held.promise);
    fireEvent.change(screen.getByLabelText("Action contains"), {
      target: { value: "new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByRole("status");
    expect(screen.queryByText(en.auditLog.empty)).toBeNull();
    await act(async () => {
      held.resolve(auditPage());
      await held.promise;
    });
    await screen.findByText(auditItems[0].action);
  });

  it("distinguishes cold pending/error and preserves cached data and open details through refresh failure", async () => {
    const held = deferred<ReturnType<typeof auditPage>>();
    apiMock.mockReturnValueOnce(held.promise);
    const client = setup();
    await screen.findByRole("status");
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.queryByText(en.auditLog.empty)).toBeNull();
    await act(async () => {
      held.resolve(auditPage());
      await held.promise;
    });
    await screen.findByText(auditItems[0].action);
    fireEvent.click(within(rows()[0]).getByText(en.auditLog.details));
    apiMock.mockRejectedValue(new Error("unavailable"));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["admin-audit-logs"] });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      en.auditLog.loadError,
    );
    expect(rows()).toHaveLength(4);
    expect(rows()[0].querySelector("details")).toHaveAttribute("open");
    expect(screen.queryByText(en.auditLog.empty)).toBeNull();
  });
  it("reports a cold request error without empty results or invented authentication copy", async () => {
    apiMock.mockRejectedValue(new Error("unavailable"));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      en.auditLog.loadError,
    );
    expect(screen.queryByText(en.auditLog.empty)).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it.each([true, false])(
    "exports applied filters despite changed drafts; filename header present=%s; preserves Blob and anchor lifecycle",
    async (filenameHeader) => {
      apiMock.mockResolvedValue(auditPage());
      const headers: Record<string, string> = { "content-type": "text/csv" };
      if (filenameHeader)
        headers["content-disposition"] =
          'attachment; filename="server-audit.csv"';
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response("exact server CSV", { status: 200, headers }),
        );
      vi.stubGlobal("fetch", fetchMock);
      const create = vi.fn().mockReturnValue("blob:audit"),
        revoke = vi.fn();
      vi.stubGlobal(
        "URL",
        Object.assign(URL, {
          createObjectURL: create,
          revokeObjectURL: revoke,
        }),
      );
      let download = "";
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        function (this: HTMLAnchorElement) {
          download = this.download;
          expect(this.isConnected).toBe(true);
          expect(this.href).toBe("blob:audit");
        },
      );
      setup();
      await screen.findByText(auditItems[0].action);
      const user = userEvent.setup();
      await user.type(screen.getByLabelText("Action contains"), "Applied");
      await user.click(screen.getByRole("button", { name: "Search" }));
      await user.clear(screen.getByLabelText("Action contains"));
      await user.type(screen.getByLabelText("Action contains"), "Unapplied");
      await user.click(screen.getByRole("button", { name: "Export CSV" }));
      await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:audit"));
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        "/api/v1/admin/audit-logs/export?action=Applied",
        { credentials: "include", cache: "no-store" },
      );
      expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
      expect(download).toBe(
        filenameHeader ? "server-audit.csv" : "betcco-audit-log.csv",
      );
      expect(document.querySelector("a[download]")).toBeNull();
    },
  );

  it("disables duplicate exports while pending and preserves server error precedence alongside data", async () => {
    apiMock.mockResolvedValue(auditPage());
    const held = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(held.promise);
    vi.stubGlobal("fetch", fetchMock);
    setup();
    await screen.findByText(auditItems[0].action);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(
      screen.getByRole("button", { name: en.auditLog.exporting }),
    ).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      held.resolve(
        new Response(
          JSON.stringify({ message: "Raw server export rejection" }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
      );
      await held.promise;
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Raw server export rejection",
    );
    expect(rows()).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeEnabled();
  });
});
