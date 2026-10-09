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
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EvaluatorSpecialismManagement } from "@/features/admin/evaluator-specialism-management";
import { formatLocalizedDateTime } from "@/i18n/date-time";
import { academicText } from "@/lib/academic-localization";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import {
  grants,
  historyPage,
  paths,
  staff,
  units,
} from "./fixtures/admin-evaluator-specialisms";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
const clients: QueryClient[] = [];
function read(path: string) {
  if (path === paths.staff) return staff;
  if (path === paths.units) return units;
  if (path.startsWith(paths.grant + "?"))
    return historyPage(
      Number(new URL(path, "http://mock.invalid").searchParams.get("page")),
    );
  throw Error(`Unexpected read ${path}`);
}
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function setup(locale: "ar" | "en") {
  const messages = locale === "ar" ? ar : en,
    copy = messages.adminWorkspace.evaluatorSpecialisms;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const invalidations = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <EvaluatorSpecialismManagement />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  const evaluator = () => screen.getByLabelText(copy.evaluator);
  const unit = () => screen.getByLabelText(copy.academicUnit);
  const grant = () => screen.getByRole("button", { name: copy.grant });
  const ready = async () => {
    await screen.findByRole("option", { name: staff[0].displayName });
    await waitFor(() => expect(unit()).toBeEnabled());
    await screen.findByText(grants[0].evaluatorName);
  };
  const select = () => {
    fireEvent.change(evaluator(), { target: { value: staff[0].id } });
    fireEvent.change(unit(), { target: { value: units[0].id } });
  };
  return {
    copy,
    shared: messages.adminWorkspace.shared,
    client,
    invalidations,
    evaluator,
    unit,
    grant,
    ready,
    select,
  };
}
function row(index: number) {
  return within(
    screen.getByText(grants[index].evaluatorName).closest("article")!,
  );
}
function writes() {
  return apiMock.mock.calls.filter(([, opts]) => opts?.method);
}
function refreshKeys(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map(([v]) => (v as { queryKey: string[] }).queryKey);
}
beforeEach(() => {
  apiMock
    .mockReset()
    .mockImplementation((p: string, o?: RequestInit) =>
      Promise.resolve(o?.method ? undefined : read(p)),
    );
});
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.restoreAllMocks();
});

describe.each(["en", "ar"] as const)(
  "Evaluator specialisms %s — MOCKED UI-CONTRACT EVIDENCE",
  (locale) => {
    it("keeps exact staff/unit/history GETs, query keys, page size and localized headings", async () => {
      const v = setup(locale);
      await v.ready();
      expect(screen.getByRole("heading", { name: v.copy.title })).toBeVisible();
      expect(screen.getByText(v.copy.description)).toBeVisible();
      expect(
        screen.getByRole("heading", { name: v.copy.history }),
      ).toBeVisible();
      for (const path of [paths.staff, paths.units, paths.history(1)])
        expect(apiMock).toHaveBeenCalledWith(path);
      expect(
        v.client
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      ).toEqual([
        ["evaluator-specialism-staff"],
        ["evaluator-specialism-units"],
        ["evaluator-specialism-history", 1],
      ]);
      expect(writes()).toEqual([]);
    });
    it("keeps raw names/codes and direct locale selection, including whitespace and blank titles without fallback", async () => {
      const v = setup(locale);
      await v.ready();
      for (const person of staff)
        expect(
          within(v.evaluator()).getByRole("option", {
            name: person.displayName,
          }),
        ).toHaveValue(person.id);
      for (const item of units) {
        const option = v.unit().querySelector(`option[value="${item.id}"]`)!;
        expect(option.textContent).toBe(
          `${item.qualificationCode} ${item.qualificationVersionCode} · ${item.code} — ${locale === "ar" ? item.arabicTitle : item.englishTitle}`,
        );
      }
      const blank = locale === "ar" ? units[1] : units[2];
      expect(
        v.unit().querySelector(`option[value="${blank.id}"]`)!.textContent,
      ).toBe(`QUAL V1 · ${blank.code} — `);
      expect(
        within(v.unit()).getByRole("option", { name: v.copy.selectUnit }),
      ).toHaveValue("");
      expect(
        within(v.evaluator()).getByRole("option", {
          name: v.copy.selectEvaluator,
        }),
      ).toHaveValue("");
    });
    it("keeps separate history academicText trim/fallback and both localized date formatters, with no revoked action", async () => {
      const v = setup(locale);
      await v.ready();
      for (let i = 0; i < grants.length; i++) {
        const item = grants[i];
        expect(
          row(i).getByText(
            `${item.unitCode} — ${academicText(locale, item.unitArabicTitle, item.unitEnglishTitle)}`,
          ),
        ).toBeVisible();
        expect(
          row(i).getByText(
            (_, e) =>
              e?.tagName === "P" &&
              e.textContent ===
                `${v.copy.grantedAt} ${formatLocalizedDateTime(item.grantedAtUtc, locale)}`,
          ),
        ).toBeVisible();
      }
      expect(
        row(0).getByText("H1 — Raw English history fallback"),
      ).toBeVisible();
      expect(row(1).getByText("H2 — عنوان السجل العربي")).toBeVisible();
      expect(
        row(2).getByText(v.copy.revokedStatus, { exact: true }),
      ).toBeVisible();
      expect(
        row(2).getByText(
          (_, e) =>
            e?.tagName === "P" &&
            e.textContent ===
              `${v.copy.revokedAt} ${formatLocalizedDateTime(grants[2].revokedAtUtc!, locale)}`,
        ),
      ).toBeVisible();
      expect(row(2).queryByRole("button")).not.toBeInTheDocument();
    });
    it("preserves empty history without hiding grant controls", async () => {
      apiMock.mockImplementation((p: string) =>
        Promise.resolve(
          p.startsWith(paths.grant + "?")
            ? { ...historyPage(), items: [], totalCount: 0 }
            : read(p),
        ),
      );
      const v = setup(locale);
      expect(await screen.findByText(v.copy.emptyHistory)).toBeVisible();
      expect(v.grant()).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: v.shared.next }),
      ).not.toBeInTheDocument();
    });
    it.each(["staff", "units", "history"] as const)(
      "shows loading only for pending %s query and keeps select guards independent",
      async (target) => {
        const pending = deferred(),
          path = target === "history" ? paths.history() : paths[target];
        apiMock.mockImplementation((p: string) =>
          p === path ? pending.promise : Promise.resolve(read(p)),
        );
        const v = setup(locale);
        expect(await screen.findByText(v.copy.loading)).toHaveAttribute(
          "aria-busy",
          "true",
        );
        await waitFor(() => {
          expect(v.evaluator()).toHaveProperty("disabled", target === "staff");
          expect(v.unit()).toHaveProperty("disabled", target === "units");
        });
        expect(screen.queryByText(v.copy.emptyHistory)).not.toBeInTheDocument();
        await act(async () => pending.resolve(read(path)));
        await waitFor(() =>
          expect(screen.queryByText(v.copy.loading)).not.toBeInTheDocument(),
        );
      },
    );
    it.each(["staff", "units", "history"] as const)(
      "shows only the generic localized %s query error and preserves independent select guards",
      async (target) => {
        const path = target === "history" ? paths.history() : paths[target];
        apiMock.mockImplementation((p: string) =>
          p === path
            ? Promise.reject(Error("PRIVATE RAW SERVER ERROR"))
            : Promise.resolve(read(p)),
        );
        const v = setup(locale);
        expect(await screen.findByRole("alert")).toHaveTextContent(
          v.copy.operationError,
        );
        expect(
          screen.queryByText("PRIVATE RAW SERVER ERROR"),
        ).not.toBeInTheDocument();
        await waitFor(() => {
          expect(v.evaluator()).toHaveProperty("disabled", target === "staff");
          expect(v.unit()).toHaveProperty("disabled", target === "units");
        });
        expect(writes()).toEqual([]);
      },
    );
    it("requires both selections, posts exact grant, prevents a pending repeat, retains selections and refreshes both query families", async () => {
      const pending = deferred();
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        o?.method ? pending.promise : Promise.resolve(read(p)),
      );
      const v = setup(locale);
      await v.ready();
      expect(v.grant()).toBeDisabled();
      fireEvent.change(v.evaluator(), { target: { value: staff[0].id } });
      expect(v.grant()).toBeDisabled();
      fireEvent.change(v.evaluator(), { target: { value: "" } });
      fireEvent.change(v.unit(), { target: { value: units[0].id } });
      expect(v.grant()).toBeDisabled();
      v.select();
      expect(v.grant()).toBeEnabled();
      fireEvent.click(v.grant());
      const granting = await screen.findByRole("button", {
        name: v.copy.granting,
      });
      expect(granting).toBeDisabled();
      fireEvent.click(granting);
      expect(writes()).toEqual([
        [
          paths.grant,
          {
            method: "POST",
            body: JSON.stringify({
              evaluatorUserId: staff[0].id,
              unitDefinitionId: units[0].id,
            }),
          },
        ],
      ]);
      expect(screen.queryByText(v.copy.loading)).not.toBeInTheDocument();
      await act(async () => pending.resolve(undefined));
      expect(await screen.findByRole("status")).toHaveTextContent(
        v.copy.grantSuccess,
      );
      expect(refreshKeys(v.invalidations)).toEqual([
        ["evaluator-specialism-history"],
        ["eligible-evaluators"],
      ]);
      expect(v.evaluator()).toHaveValue(staff[0].id);
      expect(v.unit()).toHaveValue(units[0].id);
      await waitFor(() =>
        expect(
          apiMock.mock.calls.filter(([p]) => p === paths.history()),
        ).toHaveLength(2),
      );
    });
    it.each(["grant", "revoke"] as const)(
      "clears a previous success and shows generic %s mutation failure without raw server text",
      async (action) => {
        const v = setup(locale);
        await v.ready();
        v.select();
        fireEvent.click(v.grant());
        expect(await screen.findByRole("status")).toHaveTextContent(
          v.copy.grantSuccess,
        );
        v.invalidations.mockClear();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o?.method
            ? Promise.reject(Error("PRIVATE RAW MUTATION ERROR"))
            : Promise.resolve(read(p)),
        );
        fireEvent.click(
          action === "grant"
            ? v.grant()
            : row(0).getByRole("button", { name: v.copy.revoke }),
        );
        expect(await screen.findByRole("alert")).toHaveTextContent(
          v.copy.operationError,
        );
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(
          screen.queryByText("PRIVATE RAW MUTATION ERROR"),
        ).not.toBeInTheDocument();
        expect(v.invalidations).not.toHaveBeenCalled();
        expect(v.evaluator()).toHaveValue(staff[0].id);
        expect(v.unit()).toHaveValue(units[0].id);
      },
    );
    it("posts revoke reason:null, disables every active row but labels only the selected row Revoking, then refreshes both query families", async () => {
      const pending = deferred();
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        o?.method ? pending.promise : Promise.resolve(read(p)),
      );
      const v = setup(locale);
      await v.ready();
      fireEvent.click(row(0).getByRole("button", { name: v.copy.revoke }));
      const revoking = await row(0).findByRole("button", {
        name: v.copy.revoking,
      });
      expect(revoking).toBeDisabled();
      expect(
        row(1).getByRole("button", { name: v.copy.revoke }),
      ).toBeDisabled();
      expect(row(1).queryByText(v.copy.revoking)).not.toBeInTheDocument();
      fireEvent.click(row(1).getByRole("button", { name: v.copy.revoke }));
      expect(writes()).toEqual([
        [
          paths.revoke(grants[0].id),
          { method: "POST", body: JSON.stringify({ reason: null }) },
        ],
      ]);
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.queryByText(v.copy.loading)).not.toBeInTheDocument();
      await act(async () => pending.resolve(undefined));
      expect(await screen.findByRole("status")).toHaveTextContent(
        v.copy.revokeSuccess,
      );
      expect(refreshKeys(v.invalidations)).toEqual([
        ["evaluator-specialism-history"],
        ["eligible-evaluators"],
      ]);
      expect(row(0).getByRole("button", { name: v.copy.revoke })).toBeEnabled();
      expect(row(1).getByRole("button", { name: v.copy.revoke })).toBeEnabled();
    });
    it.each([0, 25, 26])(
      "shows pagination only for totalCount > 25 (count=%s)",
      async (totalCount) => {
        apiMock.mockImplementation((p: string) =>
          Promise.resolve(
            p.startsWith(paths.grant + "?")
              ? historyPage(1, totalCount)
              : read(p),
          ),
        );
        const v = setup(locale);
        await v.ready();
        const previous = screen.queryByRole("button", {
            name: v.shared.previous,
          }),
          next = screen.queryByRole("button", { name: v.shared.next });
        if (totalCount <= 25) {
          expect(previous).not.toBeInTheDocument();
          expect(next).not.toBeInTheDocument();
        } else {
          expect(previous).toBeDisabled();
          expect(next).toBeEnabled();
        }
      },
    );
    it("uses fixed 25 pagination guards, exact query key/endpoints and +/-1 transitions", async () => {
      // Different server pageSize must not silently change the existing fixed-25 guard.
      apiMock.mockImplementation((p: string) =>
        Promise.resolve(
          p.startsWith(paths.grant + "?")
            ? { ...(read(p) as ReturnType<typeof historyPage>), pageSize: 1 }
            : read(p),
        ),
      );
      const v = setup(locale);
      await v.ready();
      const previous = () =>
          screen.getByRole("button", { name: v.shared.previous }),
        next = () => screen.getByRole("button", { name: v.shared.next });
      expect(previous()).toBeDisabled();
      fireEvent.click(next());
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(paths.history(2)),
      );
      expect(
        v.client
          .getQueryCache()
          .find({ queryKey: ["evaluator-specialism-history", 2] }),
      ).toBeDefined();
      await waitFor(() => expect(previous()).toBeEnabled());
      expect(next()).toBeEnabled();
      fireEvent.click(next());
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(paths.history(3)),
      );
      await waitFor(() => expect(next()).toBeDisabled());
      fireEvent.click(previous());
      await waitFor(() =>
        expect(
          v.client
            .getQueryCache()
            .find({ queryKey: ["evaluator-specialism-history", 2] })
            ?.getObserversCount(),
        ).toBe(1),
      );
      expect(next()).toBeEnabled();
      fireEvent.click(previous());
      await waitFor(() => expect(previous()).toBeDisabled());
      expect(writes()).toEqual([]);
    });
  },
);
