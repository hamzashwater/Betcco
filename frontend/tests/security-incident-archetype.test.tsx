import { SecurityIncidentManagement } from "@/features/admin/security-incident-management";
import { formatLocalizedDateTime } from "@/i18n/date-time";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "./helpers/admin-governance-gradebook-render";
import {
  incidents,
  incidentPage,
  incidentStatuses,
  incidentSeverities,
  assessment,
  deadlines,
  longLegal,
  longClosure,
  type FixtureIncident,
} from "./fixtures/security-incident-archetype";
const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
const list = "/security-incidents?pageSize=50",
  writes = () => apiMock.mock.calls.filter(([, o]) => o?.method);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  apiMock.mockReset().mockImplementation((p: string, o?: RequestInit) => {
    if (o?.method)
      return Promise.resolve(
        o.method === "POST" && p.endsWith("/record")
          ? undefined
          : { ...incidents[0], status: "Assessing" },
      );
    if (p.startsWith("/security-incidents?pageSize=50"))
      return Promise.resolve(incidentPage());
    const found = incidents.find((i) => p === `/security-incidents/${i.id}`);
    if (found) return Promise.resolve(found);
    throw Error("Unexpected API " + p);
  });
});
describe.each(["en", "ar"] as const)(
  "Security Incident human governance %s — MOCKED UI-CONTRACT EVIDENCE",
  (locale) => {
    function renderOwner() {
      const v = mount(locale, <SecurityIncidentManagement />),
        t = v.copy.securityIncidents;
      const queue = () => screen.getByRole("region", { name: t.incidents }),
        detail = () =>
          screen.getByRole("complementary", { name: t.incidentWorkspace }),
        buttons = () => within(queue()).getAllByRole("button"),
        filter = () => within(queue()).getByRole("combobox"),
        review = () =>
          within(detail()).getByRole("form", { name: t.reviewDraft });
      const status = () => within(review()).getByLabelText(t.status),
        reason = () => within(detail()).getByLabelText(t.reviewReasonCode),
        impact = () =>
          within(detail()).getByLabelText(t.thereMayBePersonaldataImpact),
        trigger = () =>
          within(detail()).getByLabelText(
            t.theAuthorisedLegalReviewerDeterminedThatTheArticle20NotificationT,
          ),
        confirmation = () =>
          within(detail()).getByLabelText(
            t.iRecordTheAuthorisedLegalReviewDecisionOnTheArticle20Notification,
          ),
        legal = () =>
          within(detail()).getByLabelText(t.article20TriggerassessmentReason),
        save = () =>
          within(review()).getByRole("button", { name: t.saveReview });
      const ledger = () =>
          within(detail()).getByRole("region", { name: t.reminderDeadlines }),
        row = (i: number) => within(ledger()).getAllByRole("article")[i],
        note = (i = 0) => within(row(i)).getByRole("textbox"),
        record = (i = 0) => within(row(i)).getByRole("button");
      const create = () =>
        screen.getByRole("form", { name: t.createWorkbench });
      return {
        ...v,
        t,
        queue,
        detail,
        buttons,
        filter,
        review,
        status,
        reason,
        impact,
        trigger,
        confirmation,
        legal,
        save,
        ledger,
        row,
        note,
        record,
        create,
      };
    }
    async function setup(index?: number) {
      const v = renderOwner();
      await waitFor(() => expect(v.buttons()).toHaveLength(8));
      if (index !== undefined) await userEvent.click(v.buttons()[index]);
      return v;
    }
    async function openCreate(v: ReturnType<typeof renderOwner>) {
      await userEvent.click(
        screen.getByRole("button", { name: v.t.logIncident }),
      );
      return within(v.create());
    }
    const fill = (input: HTMLElement, value: string) =>
      fireEvent.change(input, { target: { value } });
    it("uses exact empty-status key/pageSize50 GET/retry=false without selected detail/profile fan-out", async () => {
      const v = await setup(0);
      expect(apiMock.mock.calls).toEqual([[list]]);
      const queries = v.client.getQueryCache().getAll();
      expect(queries.map((q) => q.queryKey)).toEqual([
        ["security-incidents", ""],
      ]);
      expect(queries[0].options.retry).toBe(false);
      expect(writes()).toEqual([]);
    });
    it("preserves all four raw filter values and changes exact server key/path for each", async () => {
      const v = await setup();
      expect(
        [...v.filter().querySelectorAll("option")].map((o) => o.value),
      ).toEqual(["", ...incidentStatuses]);
      for (const status of incidentStatuses) {
        fill(v.filter(), status);
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith(list + "&status=" + status),
        );
        await waitFor(() => expect(v.buttons()).toHaveLength(8));
        expect(
          v.client
            .getQueryCache()
            .find({ queryKey: ["security-incidents", status], exact: true })
            ?.options.retry,
        ).toBe(false);
      }
      expect(apiMock.mock.calls).toEqual([
        [list],
        ...incidentStatuses.map((s) => [list + "&status=" + s]),
      ]);
    });
    it("retains raw server order, all severity/status labels and detected dates; totalCount stays independent of loaded length", async () => {
      const v = await setup();
      v.buttons().forEach((b, i) => {
        expect(b.querySelector("span")).toHaveTextContent(incidents[i].title);
        expect(b).toHaveTextContent(
          formatLocalizedDateTime(incidents[i].detectedAtUtc, locale),
        );
        expect(b).toHaveTextContent(
          [v.t.low, v.t.medium, v.t.high, v.t.critical][i % 4],
        );
        expect(b).toHaveTextContent(
          [v.t.open, v.t.assessing, v.t.contained, v.t.closed][i % 4],
        );
      });
      expect(
        within(v.queue()).getByText(
          v.t.matchingTotal.replace("{count}", "843"),
        ),
      ).toBeVisible();
      expect(within(v.queue()).getByText(v.t.loadedScope)).toBeVisible();
    });
    it.each([0, 1, 2, 3, 4, 6])(
      "selection %s loads exact server facts/reason/assessment/closure and Open defaults to Assessing",
      async (index) => {
        const v = await setup(index),
          r = incidents[index],
          a = r.breachAssessment;
        expect(v.status()).toHaveValue(
          r.status === "Open" ? "Assessing" : r.status,
        );
        expect(v.reason()).toHaveValue(r.reasonCode);
        expect(v.impact()).toHaveProperty(
          "checked",
          Boolean(a?.potentialPersonalDataImpact),
        );
        expect(v.trigger()).toHaveProperty(
          "checked",
          Boolean(a?.legalNotificationRequired),
        );
        expect(v.confirmation()).toHaveProperty(
          "checked",
          Boolean(a?.legalConfirmedAtUtc),
        );
        expect(v.legal()).toHaveValue(a?.legalDecisionSummary ?? "");
        expect(
          within(v.detail()).getByText(
            (_, el) => el?.tagName === "P" && el.textContent === r.summary,
          ),
        ).toBeVisible();
        if (index === 3)
          expect(
            within(v.detail()).getByLabelText(v.t.closureSummary),
          ).toHaveValue(r.closureSummary);
        expect(writes()).toEqual([]);
      },
    );
    it("create uses real required fields/maxima, Medium and SECURITY_REVIEW defaults; no client DetectedAtUtc", async () => {
      const v = await setup(),
        c = await openCreate(v);
      expect(c.getByLabelText(v.t.incidentTitle)).toHaveAttribute(
        "maxlength",
        "240",
      );
      expect(c.getByLabelText(v.t.conciseOperationalSummary)).toHaveAttribute(
        "maxlength",
        "4000",
      );
      expect(c.getByLabelText(v.t.reasonCode)).toHaveAttribute(
        "maxlength",
        "80",
      );
      for (const label of [
        v.t.incidentTitle,
        v.t.conciseOperationalSummary,
        v.t.reasonCode,
      ])
        expect(c.getByLabelText(label)).toBeRequired();
      expect(c.getByLabelText(v.t.reasonCode)).toHaveValue("SECURITY_REVIEW");
      expect(c.getByLabelText(v.t.severity)).toHaveValue("Medium");
      expect(
        [...c.getByLabelText(v.t.severity).querySelectorAll("option")].map(
          (o) => o.value,
        ),
      ).toEqual(incidentSeverities);
      expect(writes()).toEqual([]);
    });
    it.each([false, true])(
      "create exact trimmed POST with raw Critical severity and impact %s; selects exact returned object, refetches, resets only create fields",
      async (impact) => {
        const v = await setup(0),
          c = await openCreate(v);
        fill(c.getByLabelText(v.t.incidentTitle), " RAW title ");
        fill(c.getByLabelText(v.t.conciseOperationalSummary), " RAW summary ");
        fill(c.getByLabelText(v.t.reasonCode), " RAW_CODE ");
        fill(c.getByLabelText(v.t.severity), "Critical");
        if (impact)
          await userEvent.click(
            c.getByLabelText(v.t.theIncidentMayAffectPersonalData),
          );
        const created: FixtureIncident = {
          ...clone(incidents[1]),
          id: "00000000-0000-4000-9000-000000000999",
          title: "SERVER CREATED TITLE",
          reasonCode: "SERVER_CODE",
          detectedAtUtc: "2026-10-18T16:14:00Z",
          breachAssessment: assessment({ potentialPersonalDataImpact: true }),
        };
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          Promise.resolve(o ? created : incidentPage()),
        );
        await userEvent.click(
          c.getByRole("button", { name: v.t.recordIncident }),
        );
        await screen.findByText(v.t.incidentCreated);
        expect(writes()).toEqual([
          [
            "/security-incidents",
            {
              method: "POST",
              body: JSON.stringify({
                title: "RAW title",
                summary: "RAW summary",
                reasonCode: "RAW_CODE",
                severity: "Critical",
                potentialPersonalDataImpact: impact,
              }),
            },
          ],
        ]);
        expect(Object.keys(JSON.parse(writes()[0][1].body))).not.toContain(
          "DetectedAtUtc",
        );
        await waitFor(() =>
          expect(apiMock.mock.calls.filter(([p]) => p === list)).toHaveLength(
            2,
          ),
        );
        expect(
          within(v.detail()).getByRole("heading", { name: created.title }),
        ).toBeVisible();
        expect(v.reason()).toHaveValue("SERVER_CODE");
        expect(v.impact()).toBeChecked();
        expect(
          screen.queryByRole("form", { name: v.t.createWorkbench }),
        ).toBeNull();
        const reopened = await openCreate(v);
        expect(reopened.getByLabelText(v.t.incidentTitle)).toHaveValue("");
        expect(
          reopened.getByLabelText(v.t.conciseOperationalSummary),
        ).toHaveValue("");
        expect(reopened.getByLabelText(v.t.reasonCode)).toHaveValue(
          "SECURITY_REVIEW",
        );
        expect(
          reopened.getByLabelText(v.t.theIncidentMayAffectPersonalData),
        ).not.toBeChecked();
        expect(reopened.getByLabelText(v.t.severity)).toHaveValue("Critical");
      },
    );
    it("create failure owns its error and retains drafts, and pending blocks duplicate native submit", async () => {
      const v = await setup(0),
        c = await openCreate(v),
        p = deferred<FixtureIncident>();
      for (const [label, value] of [
        [v.t.incidentTitle, " TITLE "],
        [v.t.reasonCode, " CODE "],
        [v.t.conciseOperationalSummary, " SUMMARY "],
      ])
        fill(c.getByLabelText(label), value);
      apiMock.mockImplementation((url: string, o?: RequestInit) =>
        o ? p.promise : Promise.resolve(incidentPage()),
      );
      const button = c.getByRole("button", { name: v.t.recordIncident });
      await userEvent.click(button);
      await waitFor(() => expect(button).toBeDisabled());
      await userEvent.click(button);
      expect(writes()).toHaveLength(1);
      await act(async () => p.reject(Error("RAW CREATE FAILURE")));
      expect(await c.findByRole("alert")).toHaveTextContent(
        "RAW CREATE FAILURE",
      );
      expect(within(v.detail()).queryByRole("alert")).toBeNull();
      expect(c.getByLabelText(v.t.incidentTitle)).toHaveValue(" TITLE ");
      expect(c.getByLabelText(v.t.reasonCode)).toHaveValue(" CODE ");
      expect(c.getByLabelText(v.t.conciseOperationalSummary)).toHaveValue(
        " SUMMARY ",
      );
    });
    it("create impact draft cannot mutate any recorded legal review value or outgoing recorded review decision", async () => {
      const v = await setup(2),
        c = await openCreate(v);
      expect(
        c.getByLabelText(v.t.theIncidentMayAffectPersonalData),
      ).not.toBeChecked();
      await userEvent.click(
        c.getByLabelText(v.t.theIncidentMayAffectPersonalData),
      );
      await userEvent.click(
        c.getByLabelText(v.t.theIncidentMayAffectPersonalData),
      );
      expect(v.impact()).toBeChecked();
      expect(v.trigger()).toBeChecked();
      expect(v.confirmation()).toBeChecked();
      expect(v.legal()).toHaveValue(
        incidents[2].breachAssessment!.legalDecisionSummary,
      );
      await userEvent.click(v.save());
      await waitFor(() => expect(writes()).toHaveLength(1));
      expect(JSON.parse(writes()[0][1].body)).toMatchObject({
        potentialPersonalDataImpact: true,
        legalNotificationRequired: true,
        markLegalConfirmation: true,
        legalDecisionSummary:
          incidents[2].breachAssessment!.legalDecisionSummary!.trim(),
      });
    });
    it.each(["  RAW legal  ", "   "])(
      "review exact PUT preserves seven fields with trimmed/null legal and closure notes (%s), exact bools, no autosave",
      async (text) => {
        const v = await setup(0);
        fill(v.status(), "Closed");
        fill(v.reason(), " REVIEW ");
        fill(v.legal(), text);
        fill(within(v.detail()).getByLabelText(v.t.closureSummary), text);
        await userEvent.click(v.impact());
        await userEvent.click(v.trigger());
        await userEvent.click(v.confirmation());
        expect(writes()).toEqual([]);
        const updated = {
          ...clone(incidents[1]),
          id: incidents[1].id,
          title: "SERVER UPDATED",
          reasonCode: "SERVER REVIEW",
          status: "Contained" as const,
        };
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          Promise.resolve(o ? updated : incidentPage()),
        );
        await userEvent.click(v.save());
        await within(v.detail()).findByText(v.t.reviewSaved);
        expect(writes()).toEqual([
          [
            `/security-incidents/${incidents[0].id}`,
            {
              method: "PUT",
              body: JSON.stringify({
                status: "Closed",
                potentialPersonalDataImpact: true,
                legalNotificationRequired: true,
                markLegalConfirmation: true,
                legalDecisionSummary: text.trim() || null,
                closureSummary: text.trim() || null,
                reasonCode: "REVIEW",
              }),
            },
          ],
        ]);
        expect(v.status()).toHaveValue("Contained");
        expect(v.reason()).toHaveValue("SERVER REVIEW");
        await waitFor(() =>
          expect(apiMock.mock.calls.filter(([p]) => p === list)).toHaveLength(
            2,
          ),
        );
        expect(v.buttons()[1]).toHaveAttribute("aria-pressed", "true");
      },
    );
    it("notification cannot be enabled without potential impact; impact never automatically checks notification", async () => {
      const v = await setup(0);
      expect(v.trigger()).toBeDisabled();
      await userEvent.click(v.trigger());
      expect(v.trigger()).not.toBeChecked();
      await userEvent.click(v.impact());
      expect(v.trigger()).toBeEnabled();
      expect(v.trigger()).not.toBeChecked();
      expect(writes()).toEqual([]);
    });
    it.each([null, "RAW-LEGAL-USER", ""])(
      "recorded decision locks all four actual controls, retains exact timestamp/user fallback %s, and server legal summary facts",
      async (user) => {
        const r = clone(incidents[2]);
        r.breachAssessment!.legalConfirmedByUserId = user;
        apiMock.mockResolvedValue(incidentPage([r]));
        const v = renderOwner();
        await userEvent.click(
          await within(v.queue()).findByRole("button", {
            name: new RegExp(r.title),
          }),
        );
        for (const field of [
          v.impact(),
          v.trigger(),
          v.confirmation(),
          v.legal(),
        ])
          expect(field).toBeDisabled();
        expect(v.legal()).toHaveAttribute("maxlength", "2000");
        expect(
          within(v.detail()).getByText(
            v.t.theArticle20DecisionWasRecordedDateByUser
              .replace(
                "{date}",
                formatLocalizedDateTime(
                  r.breachAssessment!.legalConfirmedAtUtc!,
                  locale,
                ),
              )
              .replace("{user}", user ?? v.t.authorizedUser),
          ),
        ).toBeVisible();
        expect(
          within(v.detail()).getByText(v.t.recordedTriggerApplies),
        ).toBeVisible();
      },
    );
    it("recorded trigger rejection is factual and has no invented deadlines", async () => {
      const v = await setup(4);
      expect(
        within(v.detail()).getByText(v.t.recordedTriggerDoesNotApply),
      ).toBeVisible();
      expect(
        within(v.detail()).queryByRole("region", {
          name: v.t.reminderDeadlines,
        }),
      ).toBeNull();
      expect(writes()).toEqual([]);
    });
    it("review pending blocks duplicates; failure retains status/reason/legal/closure/bools and owns its exact error", async () => {
      const v = await setup(0),
        p = deferred<FixtureIncident>();
      fill(v.status(), "Closed");
      fill(v.reason(), " DRAFT_REASON ");
      fill(v.legal(), " RAW LEGAL ");
      fill(
        within(v.detail()).getByLabelText(v.t.closureSummary),
        " RAW CLOSURE ",
      );
      await userEvent.click(v.impact());
      await userEvent.click(v.trigger());
      await userEvent.click(v.confirmation());
      apiMock.mockImplementation((url: string, o?: RequestInit) =>
        o ? p.promise : Promise.resolve(incidentPage()),
      );
      const save = v.save();
      await userEvent.click(save);
      await waitFor(() => expect(save).toBeDisabled());
      await userEvent.click(save);
      expect(writes()).toHaveLength(1);
      await act(async () => p.reject(Error("RAW REVIEW FAILURE")));
      expect(await within(v.review()).findByRole("alert")).toHaveTextContent(
        "RAW REVIEW FAILURE",
      );
      expect(v.status()).toHaveValue("Closed");
      expect(v.reason()).toHaveValue(" DRAFT_REASON ");
      expect(v.legal()).toHaveValue(" RAW LEGAL ");
      expect(within(v.detail()).getByLabelText(v.t.closureSummary)).toHaveValue(
        " RAW CLOSURE ",
      );
      for (const checkbox of [v.impact(), v.trigger(), v.confirmation()])
        expect(checkbox).toBeChecked();
      expect(within(v.detail()).queryByText(v.t.reviewSaved)).toBeNull();
    });
    it("selection resets review/deadline outcomes and deadline notes, reloads exact facts without profile reads", async () => {
      const v = await setup(2);
      fill(v.note(), " unsaved external note ");
      apiMock.mockRejectedValueOnce(Error("RAW DEADLINE FAILURE"));
      await userEvent.click(v.record());
      await within(v.ledger()).findByRole("alert");
      await userEvent.click(v.buttons()[5]);
      expect(v.note()).toHaveValue("");
      expect(within(v.ledger()).queryByRole("alert")).toBeNull();
      expect(v.reason()).toHaveValue(incidents[5].reasonCode);
      expect(apiMock.mock.calls.filter(([, o]) => !o)).toEqual([[list]]);
    });
    it("displays only raw server audience/due/recorded dates, with no repeat action for recorded row", async () => {
      const v = await setup(2);
      expect(v.row(0)).toHaveAttribute("data-audience", "AffectedIndividuals");
      expect(v.row(1)).toHaveAttribute("data-audience", "RegulatoryAuthority");
      incidents[2].breachAssessment!.notificationDeadlines.forEach((d, i) =>
        expect(v.row(i)).toHaveTextContent(
          formatLocalizedDateTime(d.dueAtUtc, locale),
        ),
      );
      expect(within(v.row(1)).queryByRole("button")).toBeNull();
      expect(v.row(1)).toHaveTextContent(
        formatLocalizedDateTime(
          incidents[2].breachAssessment!.notificationDeadlines[1]
            .recordedAtUtc!,
          locale,
        ),
      );
      expect(v.note()).toHaveAttribute("maxlength", "1000");
    });
    it.each(["", "   "])(
      "deadline note %s cannot write; a valid note is trimmed in the exact POST",
      async (note) => {
        const v = await setup(2);
        fill(v.note(), note);
        expect(v.record()).toBeDisabled();
        await userEvent.click(v.record());
        expect(writes()).toEqual([]);
        fill(v.note(), " external action ");
        await userEvent.click(v.record());
        await waitFor(() => expect(writes()).toHaveLength(1));
        expect(writes()[0]).toEqual([
          `/security-incidents/${incidents[2].id}/notification-deadlines/${deadlines[0].id}/record`,
          { method: "POST", body: JSON.stringify({ note: "external action" }) },
        ]);
      },
    );
    it("deadline pending blocks duplicate POST, failure retains note and is isolated from review/create errors", async () => {
      const v = await setup(2),
        p = deferred<void>();
      fill(v.note(), " retained note ");
      apiMock.mockImplementation((url: string, o?: RequestInit) =>
        o ? p.promise : Promise.resolve(incidentPage()),
      );
      const button = v.record();
      await userEvent.click(button);
      await waitFor(() => expect(button).toBeDisabled());
      await userEvent.click(button);
      expect(writes()).toHaveLength(1);
      await act(async () => p.reject(Error("RAW DEADLINE POST FAILURE")));
      expect(await within(v.ledger()).findByRole("alert")).toHaveTextContent(
        "RAW DEADLINE POST FAILURE",
      );
      expect(v.note()).toHaveValue(" retained note ");
      expect(within(v.detail()).queryByText(v.t.reviewSaved)).toBeNull();
    });
    it("deadline success must POST then GET selected incident, adopt exact response, then refetch queue without fabricating recordedAt", async () => {
      const v = await setup(2),
        r = clone(incidents[2]);
      r.title = "SERVER REREAD TITLE";
      r.breachAssessment!.notificationDeadlines[0].recordedAtUtc =
        "2026-10-20T15:14:13Z";
      const sequence: string[] = [];
      apiMock.mockImplementation((p: string, o?: RequestInit) => {
        sequence.push((o?.method ?? "GET") + " " + p);
        return Promise.resolve(
          o
            ? undefined
            : p === `/security-incidents/${r.id}`
              ? r
              : incidentPage(),
        );
      });
      fill(v.note(), " action ");
      await userEvent.click(v.record());
      await waitFor(() => expect(sequence).toHaveLength(3));
      expect(sequence).toEqual([
        `POST /security-incidents/${r.id}/notification-deadlines/${deadlines[0].id}/record`,
        `GET /security-incidents/${r.id}`,
        "GET " + list,
      ]);
      expect(
        within(v.detail()).getByRole("heading", { name: r.title }),
      ).toBeVisible();
      expect(within(v.row(0)).queryByRole("button")).toBeNull();
      expect(v.row(0)).toHaveTextContent(
        formatLocalizedDateTime(
          r.breachAssessment!.notificationDeadlines[0].recordedAtUtc!,
          locale,
        ),
      );
      expect(within(v.ledger()).getByText(v.t.deadlineAccepted)).toBeVisible();
    });
    it("accepted POST with selected GET pending/error retains note and cached facts; retry performs GET only then queue refetch", async () => {
      const v = await setup(2),
        read = deferred<FixtureIncident>(),
        r = clone(incidents[2]);
      r.breachAssessment!.notificationDeadlines[0].recordedAtUtc =
        "2026-10-20T15:14:13Z";
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        o
          ? Promise.resolve(undefined)
          : p === `/security-incidents/${r.id}`
            ? read.promise
            : Promise.resolve(incidentPage()),
      );
      fill(v.note(), " retained after read failure ");
      await userEvent.click(v.record());
      await within(v.ledger()).findByText(v.t.refreshingSelected);
      expect(v.record()).toBeDisabled();
      expect(v.note()).toHaveValue(" retained after read failure ");
      await act(async () => read.reject(Error("RAW SELECTED READ FAILURE")));
      expect(await within(v.ledger()).findByRole("alert")).toHaveTextContent(
        "RAW SELECTED READ FAILURE",
      );
      expect(v.note()).toHaveValue(" retained after read failure ");
      expect(v.record()).toBeDisabled();
      expect(within(v.ledger()).getByText(v.t.deadlineAccepted)).toBeVisible();
      expect(v.buttons()).toHaveLength(8);
      expect(writes()).toHaveLength(1);
      apiMock.mockImplementation((p: string) =>
        Promise.resolve(
          p === `/security-incidents/${r.id}` ? r : incidentPage(),
        ),
      );
      await userEvent.click(
        within(v.ledger()).getByRole("button", {
          name: v.t.retrySelectedRefresh,
        }),
      );
      await waitFor(() =>
        expect(within(v.row(0)).queryByRole("button")).toBeNull(),
      );
      expect(writes()).toHaveLength(1);
      expect(
        apiMock.mock.calls.filter(([p]) => p === `/security-incidents/${r.id}`),
      ).toHaveLength(2);
    });
    it.each([
      "INCIDENT_LEGAL_CONFIRMATION_REQUIRED",
      "INCIDENT_NOTIFICATION_RECORD_REQUIRED",
    ])(
      "closure draft preserves backend conflict %s without predicting eligibility",
      async (message) => {
        const v = await setup(1);
        fill(v.status(), "Closed");
        const closure = within(v.detail()).getByLabelText(v.t.closureSummary);
        expect(closure).toHaveAttribute("maxlength", "2000");
        fill(closure, longClosure);
        expect(v.save()).toBeEnabled();
        apiMock.mockRejectedValueOnce(Error(message));
        await userEvent.click(v.save());
        expect(await within(v.review()).findByRole("alert")).toHaveTextContent(
          message,
        );
        expect(closure).toHaveValue(longClosure);
        expect(v.status()).toHaveValue("Closed");
      },
    );
    it("closure field exists only in Closed draft; final Closed locks every review/legal field and exposes no Save/Reopen/record even for inconsistent unrecorded deadline", async () => {
      const v = await setup(0);
      expect(
        within(v.detail()).queryByLabelText(v.t.closureSummary),
      ).toBeNull();
      fill(v.status(), "Closed");
      expect(
        within(v.detail()).getByLabelText(v.t.closureSummary),
      ).toBeEnabled();
      fill(v.status(), "Contained");
      expect(
        within(v.detail()).queryByLabelText(v.t.closureSummary),
      ).toBeNull();
      const r = clone(incidents[3]);
      r.breachAssessment!.notificationDeadlines = clone(deadlines);
      apiMock.mockResolvedValue(incidentPage([r]));
      await act(async () => {
        await v.client.refetchQueries({ queryKey: ["security-incidents", ""] });
      });
      await waitFor(() => expect(v.buttons()).toHaveLength(1));
      await userEvent.click(v.buttons()[0]);
      for (const field of [
        v.status(),
        v.reason(),
        v.impact(),
        v.trigger(),
        v.legal(),
        v.confirmation(),
        within(v.detail()).getByLabelText(v.t.closureSummary),
      ])
        expect(field).toBeDisabled();
      expect(within(v.review()).queryByRole("button")).toBeNull();
      expect(within(v.ledger()).queryByRole("textbox")).toBeNull();
      expect(within(v.detail()).getByText(v.t.closedLocked)).toBeVisible();
      expect(writes()).toEqual([]);
    });
    it("cold pending/error/empty remain separate, with exact raw failure and no fabricated sign-in/access-denied or extra retry", async () => {
      const p = deferred<unknown>();
      apiMock.mockReturnValue(p.promise);
      const v = renderOwner();
      expect(await within(v.queue()).findByRole("status")).toHaveTextContent(
        v.t.loadingIncidents,
      );
      expect(
        within(v.queue()).queryByText(v.t.thereAreNoIncidentsInThisStatus),
      ).toBeNull();
      await act(async () => p.reject(Error("RAW COLD QUERY FAILURE")));
      expect(await within(v.queue()).findByRole("alert")).toHaveTextContent(
        "RAW COLD QUERY FAILURE",
      );
      expect(apiMock.mock.calls).toEqual([[list]]);
      apiMock.mockResolvedValue(incidentPage([]));
      fill(v.filter(), "Closed");
      expect(
        await within(v.queue()).findByText(v.t.thereAreNoIncidentsInThisStatus),
      ).toBeVisible();
      expect(within(v.queue()).queryByRole("alert")).toBeNull();
      expect(
        within(v.queue()).getByText(
          v.t.matchingTotal.replace("{count}", "843"),
        ),
      ).toBeVisible();
    });
    it("real cached queue refresh failure preserves selected form nodes and all drafts/actions, while showing exact raw query error", async () => {
      const v = await setup(1);
      fill(v.reason(), " RETAINED REASON ");
      fill(v.legal(), longLegal);
      await userEvent.click(v.trigger());
      await userEvent.click(v.confirmation());
      const node = v.legal();
      apiMock.mockRejectedValue(Error("RAW QUEUE REFRESH FAILURE"));
      await act(async () => {
        await v.client.refetchQueries({ queryKey: ["security-incidents", ""] });
      });
      expect(await within(v.queue()).findByRole("alert")).toHaveTextContent(
        "RAW QUEUE REFRESH FAILURE",
      );
      expect(v.buttons()).toHaveLength(8);
      expect(v.legal()).toBe(node);
      expect(v.legal()).toHaveValue(longLegal);
      expect(v.reason()).toHaveValue(" RETAINED REASON ");
      expect(v.trigger()).toBeChecked();
      expect(v.confirmation()).toBeChecked();
      expect(v.save()).toBeEnabled();
      expect(writes()).toEqual([]);
    });
    it("keyboard reaches queue, create, review and deadline note/action; no nonhuman or notification send action exists", async () => {
      const v = await setup(2),
        user = userEvent.setup();
      await v.filter().focus();
      await user.tab();
      expect(v.buttons()[0]).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(v.buttons()[0]).toHaveAttribute("aria-pressed", "true");
      expect(
        within(v.buttons()[0]).getByText(v.t.selectedIncident),
      ).toBeVisible();
      await userEvent.click(v.buttons()[2]);
      fill(v.note(), "keyboard external note");
      await v.note().focus();
      await user.tab();
      expect(v.record()).toHaveFocus();
      await v.reason().focus();
      await user.tab();
      expect(v.impact()).not.toHaveFocus();
      expect(apiMock.mock.calls).toEqual([[list]]);
      expect(document.body.textContent).not.toMatch(
        /Send notification|Email affected users|Notify regulator|Submit breach|Report Article 20|Reopen/,
      );
    });
  },
);
