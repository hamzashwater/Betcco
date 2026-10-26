import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-15-security-incident-baseline.json";
import { securityIncidentContracts } from "./helpers/security-incident-contracts";
import {
  projectSecurityIncidentBoundary,
  withoutSecurityIncidentAdditions,
} from "./helpers/security-incident-projection";
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n"),
  hash = (s: string) => createHash("sha256").update(s).digest("hex"),
  path = baseline.path,
  source = read(path);
describe("Slice 7 independent operational/legal boundary", () => {
  it("pins pre-edit actual main, source and exact reviewed fixture independently of presentation projection", () => {
    expect(baseline.base).toBe("31db23f6001c4df4ccb316d092c8b98d596bee7a");
    expect(baseline.originalHash).toBe(
      "79c8597d99c75a70285182840791225dde66c516420ce3353a2414cbff4da31c",
    );
    expect(hash(JSON.stringify(baseline))).toBe(
      "55180cbab69bb04c62070297a6f1ef9f378a11abbbf4922491b469ea4efa13a5",
    );
    expect(securityIncidentContracts(source)).toEqual(baseline.invariants);
  });
  it("retains exactly one query, three mutations/five API expressions, no new identity fields, transition engine, priority algorithm, automatic decision/deadline or send endpoint", () => {
    expect(source.match(/useQuery\(/g)).toHaveLength(1);
    expect(source.match(/useMutation\(/g)).toHaveLength(3);
    expect(source.match(/\bapi</g)).toHaveLength(5);
    expect(source).not.toMatch(
      /OwnerUserId|CreatedByUserId|AssignedToUserId|email|phone|profile|\.sort\(|\.toSorted\(|\.filter\(|\.slice\(|\.reduce\(|useEffect|useMemo|localStorage|sessionStorage|Date\.now|new Date\(|setHours|addHours|CanTransition|canTransition|priorityScore|riskScore|api[^\n]*\/(send|notify)/,
    );
    expect(source).toContain("query.data.items.map((incident)");
    expect(source).toContain("query.data.totalCount");
  });
  it("normalizes only explicit independent create-view ownership and feedback while keeping every actual wire expression and sequence frozen", () => {
    expect(source).toContain("potentialPersonalDataImpact: createDataImpact");
    expect(source).toContain(
      "potentialPersonalDataImpact: potentialDataImpact",
    );
    expect(source).toContain("setCreateDataImpact(false)");
    expect(source).toContain(
      "setPotentialDataImpact(Boolean(assessment?.potentialPersonalDataImpact))",
    );
    expect(source).toContain("selectedRefreshPending ||");
    expect(source).toContain("Boolean(selectedRefreshError)");
    expect(source).toContain("refreshSelectedIncident()");
    expect(source.replace(/\s+/g, " ")).toContain(
      "error instanceof Error ? error.message",
    );
    expect(source).toContain("!isClosed ? (");
  });
  it("restores exact unique owner seams for relative/absolute paths and fails closed on changed/missing/duplicate hunks", () => {
    for (const p of [path, "C:/workspace/" + path])
      expect(hash(projectSecurityIncidentBoundary(source, p))).toBe(
        baseline.originalHash,
      );
    expect(
      projectSecurityIncidentBoundary(
        source,
        "src/features/other/security-incident-management.tsx",
      ),
    ).toBe(source);
    for (const seam of baseline.seams)
      for (const replacement of [
        "",
        seam.approved + seam.approved,
        seam.approved.replace(/\S/, "#"),
      ])
        expect(
          hash(
            projectSecurityIncidentBoundary(
              source.replace(seam.approved, replacement),
              path,
            ),
          ),
        ).not.toBe(baseline.originalHash);
  });
  it.each<[string | RegExp, string]>([
    ['["security-incidents", status]', '["incidents"]'],
    ["pageSize=50", "pageSize=100"],
    ["&status=${status}", "&filter=${status}"],
    ["retry: false", "retry: true"],
    ['api<Incident>("/security-incidents",', 'api<Incident>("/other",'],
    ['method: "POST"', 'method: "PUT"'],
    ['method: "PUT"', 'method: "POST"'],
    ["title: title.trim()", "title: title"],
    ["summary: summary.trim()", "summary: summary"],
    ["reasonCode: reasonCode.trim()", 'reasonCode: "CHANGED"'],
    [
      "potentialPersonalDataImpact: createDataImpact",
      "potentialPersonalDataImpact: true",
    ],
    [
      'incident.status === "Open" ? "Assessing" : incident.status',
      '"Assessing"',
    ],
    [
      "setReviewReasonCode(incident.reasonCode)",
      'setReviewReasonCode("CHANGED")',
    ],
    ["setDeadlineNotes({})", "setDeadlineNotes(deadlineNotes)"],
    ["review.reset()", "void 0"],
    ["recordDeadline.reset()", "void 0"],
    ["status: reviewStatus", 'status: "Closed"'],
    ["legalDecisionSummary.trim() || null", "legalDecisionSummary || null"],
    ["closureSummary.trim() || null", "closureSummary || null"],
    ["reviewReasonCode.trim()", "reviewReasonCode"],
    ["markLegalConfirmation,", "markLegalConfirmation: true,"],
    ["`/security-incidents/${selected.id}`", "`/security-incidents/other`"],
    ["JSON.stringify({ note })", "JSON.stringify({ note, send: true })"],
    [
      "notification-deadlines/${deadlineId}/record",
      "notification-deadlines/${deadlineId}/send",
    ],
    [
      /note:\s*deadlineNotes\[\s*deadline\.id\s*\]\.trim\(\)/,
      "note: deadlineNotes[deadline.id]",
    ],
    ["disabled={isClosed || legalDecisionRecorded}", "disabled={isClosed}"],
    [
      /isClosed\s*\|\|\s*legalDecisionRecorded\s*\|\|\s*!potentialDataImpact/,
      "isClosed || legalDecisionRecorded",
    ],
    ["disabled={create.isPending}", "disabled={false}"],
    ["disabled={review.isPending}", "disabled={false}"],
    ["maxLength={240}", "maxLength={241}"],
    ["maxLength={4000}", "maxLength={4001}"],
    ["maxLength={80}", "maxLength={81}"],
    ["maxLength={2000}", "maxLength={2001}"],
    ["maxLength={1000}", "maxLength={1001}"],
    ['selected?.status === "Closed"', 'selected?.status === "Contained"'],
    ['useState<Severity>("Medium")', 'useState<Severity>("High")'],
    ['useState("SECURITY_REVIEW")', 'useState("OTHER")'],
    ["void query.refetch()", "void 0"],
  ])("rejects wire/legal/selection/validation drift at %s", (from, to) => {
    const changed = source.replace(from, to);
    expect(changed).not.toBe(source);
    expect(securityIncidentContracts(changed)).not.toEqual(baseline.invariants);
    expect(hash(projectSecurityIncidentBoundary(changed, path))).not.toBe(
      baseline.originalHash,
    );
  });
  it.each(Object.entries(baseline.protected))(
    "keeps prior owners/business producers/dependencies/historical fixtures frozen: %s",
    (p, expected) =>
      expect(hash(projectSecurityIncidentBoundary(read(p), p)), p).toBe(
        expected,
      ),
  );
  it.each(["en", "ar"] as const)(
    "permits only 32 exact paired factual %s leaves, retaining old legal meaning/copy",
    (locale) => {
      const p = `messages/${locale}.json`,
        raw = read(p),
        m = JSON.parse(raw);
      expect(hash(projectSecurityIncidentBoundary(raw, p))).toBe(
        baseline.messageHashes[locale],
      );
      expect(
        JSON.stringify(withoutSecurityIncidentAdditions(JSON.parse(raw))),
      ).toBe(
        JSON.stringify(JSON.parse(projectSecurityIncidentBoundary(raw, p))),
      );
      expect(Object.keys(baseline.additions.en)).toEqual(
        Object.keys(baseline.additions.ar),
      );
      expect(Object.keys(baseline.additions[locale])).toHaveLength(32);
      for (const [key, value] of Object.entries(baseline.additions[locale])) {
        expect(m.adminWorkspace.securityIncidents[key]).toBe(value);
        const bad = JSON.parse(raw);
        bad.adminWorkspace.securityIncidents[key] += "changed";
        expect(() => withoutSecurityIncidentAdditions(bad)).toThrow();
      }
      const extra = JSON.parse(raw);
      extra.adminWorkspace.securityIncidents.unapproved = "retained";
      expect(
        (
          withoutSecurityIncidentAdditions(extra)
            .adminWorkspace as typeof m.adminWorkspace
        ).securityIncidents.unapproved,
      ).toBe("retained");
    },
  );
  it.each(Object.entries(baseline.guardSeams))(
    "permits only exact reviewed test-only alignment in %s",
    (p, seams) => {
      expect(hash(projectSecurityIncidentBoundary(read(p), p))).toBe(
        baseline.protected[p as keyof typeof baseline.protected],
      );
      for (const seam of seams)
        expect(
          projectSecurityIncidentBoundary(
            read(p).replace(seam.approved, seam.approved + "changed"),
            p,
          ),
        ).not.toBe(projectSecurityIncidentBoundary(read(p), p));
    },
  );
  it("enforces real immutable legal controls, opaque design roles, DC03, logical reflow, visible focus and noncolor selected/severity/status text", () => {
    const css = read(
        "src/features/admin/security-incident-management.module.css",
      ),
      global = read("src/app/globals.css");
    expect(source).not.toMatch(
      /font-black|font-extrabold|disabled:opacity|animate-pulse|bg-primary|text-red-/,
    );
    expect(css).not.toMatch(
      /gradient|blur|box-shadow|animation|opacity|font-weight:\s*(800|900)/,
    );
    for (const m of css.matchAll(/font-weight:\s*(\d+)/g))
      expect([400, 500, 600, 700]).toContain(Number(m[1]));
    for (const m of css.matchAll(/var\((--ui-[a-z-]+)\)/g))
      expect(global, m[1]).toContain(m[1] + ":");
    for (const token of [
      "min-height: 44px",
      "outline-offset: 2px",
      "overflow-wrap: anywhere",
      "white-space: pre-wrap",
      "border-inline-start",
      '.row[aria-pressed="true"]:hover',
    ])
      expect(css).toContain(token);
    expect(source).toContain("aria-pressed={selected?.id === incident.id}");
    expect(source).toContain("data-severity={incident.severity}");
    expect(source).toContain("data-status={incident.status}");
  });
  it("keeps backend policy/audit/immutable decision/deadlines/closure/finality/human-only execution authority unchanged", () => {
    const backend = read(
      "../backend/src/Betcco.Api/Controllers/SecurityIncidentsController.cs",
    );
    for (const text of [
      '[Authorize(Policy = "SecurityIncidentAdmin")]',
      "INCIDENT_LEGAL_DECISION_FINAL",
      "INCIDENT_NOTIFICATION_INCONSISTENT",
      "INCIDENT_NOTIFICATION_NOTE_REQUIRED",
      "INCIDENT_NOTIFICATION_ALREADY_RECORDED",
      "INCIDENT_CLOSURE_SUMMARY_REQUIRED",
      "INCIDENT_LEGAL_CONFIRMATION_REQUIRED",
      "INCIDENT_NOTIFICATION_RECORD_REQUIRED",
      "INCIDENT_FINAL",
      "INCIDENT_TRANSITION_INVALID",
      "detectedAtUtc.AddHours(24)",
      "detectedAtUtc.AddHours(72)",
      "OrderByDescending(item => item.DetectedAtUtc).ThenByDescending(item => item.Id)",
      "SecurityIncidentArticle20NotificationDecisionRecorded",
      "SecurityIncidentNotificationActionRecorded",
      "deliberately never sends legal",
    ])
      expect(backend).toContain(text);
  });
});
