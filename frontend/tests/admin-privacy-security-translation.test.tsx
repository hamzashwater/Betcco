import { PrivacyRequestManagement } from "@/features/admin/privacy-request-management";
import { SecurityIncidentManagement } from "@/features/admin/security-incident-management";
import { formatLocalizedDateTime } from "@/i18n/date-time";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import baseline from "./fixtures/admin-a5-5-10-15-copy-baseline.json";
import { mount, deferred } from "./helpers/admin-governance-gradebook-render";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: apiMock,
}));
const timestamp = "2026-10-10T12:34:00Z";
const request = {
  id: "r",
  requestType: "Access",
  status: "Submitted",
  description: "RAW <user description>",
  resolutionSummary: null,
  identityVerifiedAtUtc: null,
  createdAtUtc: timestamp,
};
const incident = {
  id: "i",
  title: "RAW INCIDENT",
  summary: "RAW INCIDENT SUMMARY",
  reasonCode: "RAW_REASON",
  severity: "Critical",
  status: "Open",
  detectedAtUtc: timestamp,
  createdAtUtc: timestamp,
  closureSummary: null,
  breachAssessment: {
    potentialPersonalDataImpact: false,
    legalConfirmationRequired: true,
    legalNotificationRequired: false,
    legalConfirmedAtUtc: null as string | null,
    legalConfirmedByUserId: null as string | null,
    legalDecisionSummary: null,
    notificationDeadlines: [] as {
      id: string;
      audience: string;
      dueAtUtc: string;
      recordedAtUtc?: string;
    }[],
  },
};
const page = (items: unknown[]) => ({
  items,
  page: 1,
  pageSize: 50,
  totalCount: items.length,
});
beforeEach(() => {
  apiMock.mockReset();
});
for (const locale of ["ar", "en"] as const) {
  const privacy = (en: string) =>
    baseline.scopes.privacyRequests.cases.find((c) => c.en === en)![locale];
  const security = (en: string) =>
    baseline.scopes.securityIncidents.cases.find((c) => c.en === en)![locale];
  async function selectPrivacy(data = request) {
    apiMock.mockResolvedValue(page([data]));
    mount(locale, <PrivacyRequestManagement />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: new RegExp(privacy("Data access")),
      }),
    );
    return screen.getByLabelText(privacy("Review status"));
  }
  async function selectSecurity(data = incident) {
    apiMock.mockResolvedValue(page([data]));
    mount(locale, <SecurityIncidentManagement />);
    await userEvent.click(
      await screen.findByRole("button", { name: /RAW INCIDENT/ }),
    );
    return screen.getByLabelText(security("Review reason code"));
  }
  describe(`Privacy and security translated UI contracts ${locale}`, () => {
    it.each(["privacy", "security"])(
      "shows the localized empty queue and preserves raw mutation errors in %s",
      async (area) => {
        apiMock.mockResolvedValue(page([]));
        const mounted = mount(
          locale,
          area === "privacy" ? (
            <PrivacyRequestManagement />
          ) : (
            <SecurityIncidentManagement />
          ),
        );
        expect(
          await screen.findByText(
            area === "privacy"
              ? privacy("There are no requests with this status.")
              : security("There are no incidents in this status."),
          ),
        ).toBeVisible();
        mounted.client.clear();
      },
    );
    it.each(["privacy", "security"])(
      "disables pending review and displays the exact server failure in %s",
      async (area) => {
        if (area === "privacy") await selectPrivacy();
        else await selectSecurity();
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          o?.method
            ? Promise.reject(new Error("RAW REVIEW FAILURE"))
            : Promise.resolve(page([area === "privacy" ? request : incident])),
        );
        await userEvent.click(
          screen.getByRole("button", {
            name:
              area === "privacy"
                ? privacy("Save review decision")
                : security("Save review"),
          }),
        );
        expect(await screen.findByRole("alert")).toHaveTextContent(
          "RAW REVIEW FAILURE",
        );
      },
    );
    it.each([" closure ", "   "])(
      "preserves security closure trimming/null semantics (%s)",
      async (note) => {
        await selectSecurity();
        fireEvent.change(screen.getByLabelText(security("Status")), {
          target: { value: "Closed" },
        });
        fireEvent.change(screen.getByLabelText(security("Closure summary")), {
          target: { value: note },
        });
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          Promise.resolve(
            o?.method ? { ...incident, status: "Closed" } : page([incident]),
          ),
        );
        await userEvent.click(
          screen.getByRole("button", { name: security("Save review") }),
        );
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith("/security-incidents/i", {
            method: "PUT",
            body: JSON.stringify({
              status: "Closed",
              potentialPersonalDataImpact: false,
              legalNotificationRequired: false,
              markLegalConfirmation: false,
              legalDecisionSummary: null,
              closureSummary: note.trim() || null,
              reasonCode: "RAW_REASON",
            }),
          }),
        );
      },
    );
    it("preserves all privacy type/status values and the server filter contract", async () => {
      const types = [
        "Access",
        "Rectification",
        "Restriction",
        "ErasureOrConcealment",
        "ObjectionToProfiling",
        "Portability",
        "WithdrawMarketingConsent",
      ];
      apiMock.mockResolvedValue(
        page(
          types.map((requestType, i) => ({
            ...request,
            id: String(i),
            requestType,
          })),
        ),
      );
      mount(locale, <PrivacyRequestManagement />);
      await screen.findByRole("button", {
        name: new RegExp(privacy("Portable copy")),
      });
      const filter = screen.getByLabelText(privacy("Status"));
      expect(
        [...filter.querySelectorAll("option")].map((o) => o.value),
      ).toEqual([
        "",
        "Submitted",
        "IdentityVerificationRequired",
        "InReview",
        "Completed",
        "Rejected",
        "Cancelled",
      ]);
      fireEvent.change(filter, { target: { value: "Completed" } });
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/privacy/admin/requests?pageSize=50&status=Completed",
        ),
      );
    });
    it.each([" note ", "   "])(
      "preserves privacy PUT trimming/null behavior (%s), identity and refetch",
      async (note) => {
        const status = await selectPrivacy();
        expect(status).toHaveValue("InReview");
        expect(screen.getByText(request.description)).toBeVisible();
        fireEvent.change(status, {
          target: { value: "IdentityVerificationRequired" },
        });
        const input = screen.getByLabelText(privacy("User-facing review note"));
        expect(input).toHaveAttribute("maxlength", "2000");
        fireEvent.change(input, { target: { value: note } });
        await userEvent.click(screen.getByRole("checkbox"));
        apiMock.mockImplementation((p: string, o?: RequestInit) =>
          Promise.resolve(
            o?.method
              ? {
                  ...request,
                  status: "InReview",
                  resolutionSummary: note.trim() || null,
                  identityVerifiedAtUtc: timestamp,
                }
              : page([request]),
          ),
        );
        await userEvent.click(
          screen.getByRole("button", { name: privacy("Save review decision") }),
        );
        await waitFor(() =>
          expect(apiMock).toHaveBeenCalledWith("/privacy/admin/requests/r", {
            method: "PUT",
            body: JSON.stringify({
              status: "IdentityVerificationRequired",
              resolutionSummary: note.trim() || null,
              markIdentityVerified: true,
            }),
          }),
        );
        expect(
          await screen.findByText(privacy("Review decision saved.")),
        ).toBeVisible();
        expect(screen.getByRole("checkbox")).toBeDisabled();
        expect(
          apiMock.mock.calls.filter(
            ([p]) => p === "/privacy/admin/requests?pageSize=50",
          ).length,
        ).toBe(2);
        expect(
          screen.getByText(
            (_, e) =>
              e?.tagName === "P" &&
              e.textContent ===
                `${privacy("Verification recorded:")} ${formatLocalizedDateTime(timestamp, locale)}`,
          ),
        ).toBeVisible();
      },
    );
    it.each(["Completed", "Rejected", "Cancelled"])(
      "locks final privacy %s without a save action",
      async (status) => {
        await selectPrivacy({ ...request, status });
        expect(screen.getByLabelText(privacy("Review status"))).toBeDisabled();
        expect(screen.getByRole("checkbox")).toBeDisabled();
        expect(
          screen.queryByRole("button", {
            name: privacy("Save review decision"),
          }),
        ).not.toBeInTheDocument();
      },
    );
    it("disables privacy submit while pending and preserves raw review errors", async () => {
      await selectPrivacy();
      const pending = deferred();
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        o?.method ? pending.promise : Promise.resolve(page([request])),
      );
      await userEvent.click(
        screen.getByRole("button", { name: privacy("Save review decision") }),
      );
      expect(
        screen.getByRole("button", { name: privacy("Saving…") }),
      ).toBeDisabled();
      pending.resolve({ ...request, status: "InReview" });
    });
    it("creates an incident with trimmed fields, raw severity and the default reason", async () => {
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        Promise.resolve(o?.method ? incident : page([])),
      );
      mount(locale, <SecurityIncidentManagement />);
      await userEvent.click(
        screen.getByRole("button", { name: security("Log incident") }),
      );
      expect(screen.getByLabelText(security("Reason code"))).toHaveValue(
        "SECURITY_REVIEW",
      );
      for (const [name, value] of [
        ["Incident title", " Incident "],
        ["Concise operational summary", " Summary "],
        ["Reason code", " RAW "],
        ["Severity", "High"],
      ])
        fireEvent.change(screen.getByLabelText(security(name)), {
          target: { value },
        });
      expect(screen.getByLabelText(security("Incident title"))).toHaveAttribute(
        "maxlength",
        "240",
      );
      expect(
        screen.getByLabelText(security("Concise operational summary")),
      ).toHaveAttribute("maxlength", "4000");
      await userEvent.click(screen.getByRole("checkbox"));
      await userEvent.click(
        screen.getByRole("button", { name: security("Record incident") }),
      );
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith("/security-incidents", {
          method: "POST",
          body: JSON.stringify({
            title: "Incident",
            summary: "Summary",
            reasonCode: "RAW",
            severity: "High",
            potentialPersonalDataImpact: true,
          }),
        }),
      );
      await waitFor(() =>
        expect(
          screen.queryByLabelText(security("Incident title")),
        ).not.toBeInTheDocument(),
      );
    });
    it("preserves all legal trigger guards and the exact security review body", async () => {
      await selectSecurity();
      expect(screen.getByText(incident.summary)).toBeVisible();
      const trigger = screen.getByLabelText(
        security(
          "The authorised legal reviewer determined that the Article 20 notification trigger applies",
        ),
      );
      expect(trigger).toBeDisabled();
      await userEvent.click(
        screen.getByLabelText(security("There may be personal-data impact")),
      );
      expect(trigger).toBeEnabled();
      await userEvent.click(trigger);
      await userEvent.click(
        screen.getByLabelText(
          security(
            "I record the authorised legal review decision on the Article 20 notification trigger under the approved process",
          ),
        ),
      );
      for (const [name, value] of [
        ["Review reason code", " REVIEW "],
        ["Article 20 trigger-assessment reason", " legal "],
      ])
        fireEvent.change(screen.getByLabelText(security(name)), {
          target: { value },
        });
      expect(
        screen.getByLabelText(security("Article 20 trigger-assessment reason")),
      ).toHaveAttribute("maxlength", "2000");
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        Promise.resolve(o?.method ? incident : page([incident])),
      );
      await userEvent.click(
        screen.getByRole("button", { name: security("Save review") }),
      );
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith("/security-incidents/i", {
          method: "PUT",
          body: JSON.stringify({
            status: "Assessing",
            potentialPersonalDataImpact: true,
            legalNotificationRequired: true,
            markLegalConfirmation: true,
            legalDecisionSummary: "legal",
            closureSummary: null,
            reasonCode: "REVIEW",
          }),
        }),
      );
    });
    it.each([null, "RAW-LEGAL-USER", ""])(
      "locks a recorded legal decision and preserves user fallback %s",
      async (user) => {
        const data = {
          ...incident,
          breachAssessment: {
            ...incident.breachAssessment,
            legalConfirmedAtUtc: timestamp,
            legalConfirmedByUserId: user,
          },
        };
        await selectSecurity(data);
        for (const name of [
          "There may be personal-data impact",
          "The authorised legal reviewer determined that the Article 20 notification trigger applies",
          "Article 20 trigger-assessment reason",
        ])
          expect(screen.getByLabelText(security(name))).toBeDisabled();
        const message = security(
          "The Article 20 decision was recorded {date} by {user}.",
        )
          .replace("{date}", formatLocalizedDateTime(timestamp, locale))
          .replace("{user}", user ?? security("an authorised user"));
        expect(
          screen.getByText(
            (_, e) => e?.tagName === "P" && e.textContent === message,
          ),
        ).toBeVisible();
      },
    );
    it("records only a nonempty trimmed deadline note and re-reads the selected incident", async () => {
      const data = {
        ...incident,
        breachAssessment: {
          ...incident.breachAssessment,
          notificationDeadlines: [
            { id: "d", audience: "AffectedIndividuals", dueAtUtc: timestamp },
            {
              id: "recorded",
              audience: "RegulatoryAuthority",
              dueAtUtc: timestamp,
              recordedAtUtc: timestamp,
            },
          ],
        },
      };
      await selectSecurity(data);
      const record = screen.getByRole("button", { name: security("Record") });
      expect(record).toBeDisabled();
      const note = screen.getByPlaceholderText(
        security("External action note"),
      );
      expect(note).toHaveAttribute("maxlength", "1000");
      fireEvent.change(note, { target: { value: "   " } });
      expect(record).toBeDisabled();
      fireEvent.change(note, { target: { value: " external note " } });
      apiMock.mockImplementation((p: string, o?: RequestInit) =>
        Promise.resolve(
          o?.method
            ? undefined
            : p === "/security-incidents/i"
              ? data
              : page([data]),
        ),
      );
      await userEvent.click(record);
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/security-incidents/i/notification-deadlines/d/record",
          { method: "POST", body: JSON.stringify({ note: "external note" }) },
        ),
      );
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith("/security-incidents/i"),
      );
      expect(
        screen.getByText(security("Action recorded"), { exact: false }),
      ).toBeVisible();
      expect(apiMock.mock.calls.some(([p]) => /send|notify/.test(p))).toBe(
        false,
      );
    });
    it("locks closed incidents without save, with technical filters unchanged", async () => {
      await selectSecurity({ ...incident, status: "Closed" });
      expect(
        screen.getByLabelText(security("Review reason code")),
      ).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: security("Save review") }),
      ).not.toBeInTheDocument();
      const filter = screen.getAllByRole("combobox")[0];
      expect(
        [...filter.querySelectorAll("option")].map((o) => o.value),
      ).toEqual(["", "Open", "Assessing", "Contained", "Closed"]);
      fireEvent.change(filter, { target: { value: "Contained" } });
      await waitFor(() =>
        expect(apiMock).toHaveBeenCalledWith(
          "/security-incidents?pageSize=50&status=Contained",
        ),
      );
    });
    it.each(["privacy", "security"])(
      "preserves raw server errors and an empty state in %s",
      async (area) => {
        apiMock.mockRejectedValue(new Error("RAW SERVER ERROR"));
        mount(
          locale,
          area === "privacy" ? (
            <PrivacyRequestManagement />
          ) : (
            <SecurityIncidentManagement />
          ),
        );
        expect(await screen.findByRole("alert")).toHaveTextContent(
          "RAW SERVER ERROR",
        );
        expect(
          within(screen.getByRole("complementary")).getByText(
            area === "privacy"
              ? privacy("Select a request from the queue to review it.")
              : security("Select an incident to review it."),
          ),
        ).toBeVisible();
      },
    );
  });
}
