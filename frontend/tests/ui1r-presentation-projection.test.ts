import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import discoveryBaseline from "./fixtures/public-discovery-i18n-baseline.json";
import supportBaseline from "./fixtures/support-i18n-baseline.json";
import {
  auditDiscovery,
  discoveryContract,
} from "./helpers/public-discovery-i18n-audit";
import { auditSupport, supportContract } from "./helpers/support-i18n-audit";
import { projectUi1rPresentation } from "./helpers/ui1r-presentation-projection";

const supportPath = "src/features/support/support-center.tsx";
const coursesPath = "src/app/[locale]/courses/page.tsx";
const read = (path: string) => readFileSync(path, "utf8");

describe("bounded UI-1R presentation projection for closed T7 guards", () => {
  it("reverses only the complete reviewed Support style seams", () => {
    const source = read(supportPath);
    const projected = projectUi1rPresentation(source, supportPath);
    expect(projected).not.toBe(source);
    expect(supportContract(projected)).toBe(
      supportContract(supportBaseline.approvedSources[supportPath]),
    );
    expect(auditSupport(source, supportPath).findings).toEqual([]);
    expect(projectUi1rPresentation(source, coursesPath)).toBe(source);
    expect(projectUi1rPresentation(source, "other.tsx")).toBe(source);
    expect(
      projectUi1rPresentation(
        supportBaseline.approvedSources[supportPath],
        supportPath,
      ),
    ).toBe(supportBaseline.approvedSources[supportPath]);
  });

  it("reverses only the complete reviewed catalogue hero style seams", () => {
    const source = read(coursesPath);
    expect(projectUi1rPresentation(source, coursesPath)).not.toBe(source);
    expect(discoveryContract(source, coursesPath)).toBe(
      discoveryContract(
        discoveryBaseline.sources[coursesPath],
        coursesPath,
        true,
      ),
    );
    expect(auditDiscovery(source, coursesPath).findings).toEqual([]);
    expect(projectUi1rPresentation(source, supportPath)).toBe(source);
    expect(
      projectUi1rPresentation(
        discoveryBaseline.sources[coursesPath],
        coursesPath,
      ),
    ).toBe(discoveryBaseline.sources[coursesPath]);
  });

  it.each([
    ['case "Open":', 'case "Changed":'],
    ["bg-info-surface text-info", "bg-danger-surface text-danger"],
    ["statusClassName(item.status)", "statusClassName(item.subject)"],
    [
      "statusLabel(item.status, locale, supportCopy)",
      "statusLabel(item.subject, locale, supportCopy)",
    ],
    [
      "/support/tickets?page=1&pageSize=50",
      "/support/tickets?page=2&pageSize=25",
    ],
    ["subject: subject.trim()", "subject: subject"],
    ['supportCopy("center.studentTitle")', 'supportCopy("center.changed")'],
  ])("still rejects Support drift from %s", (from, to) => {
    const source = read(supportPath);
    expect(source).toContain(from);
    const changed = source.replace(from, to);
    expect(supportContract(changed)).not.toBe(supportContract(source));
  });

  it.each([
    ["rgba(5,10,25,.72)", "rgba(5,10,25,.73)"],
    ["text-text-on-image", "text-info"],
    ["text-text-on-image", "text-action-primary-text"],
    ['copy("discoverCourses")', 'copy("changedCourses")'],
    ['["catalog-taxonomy", locale]', '["catalog-taxonomy"]'],
  ])("still rejects catalogue drift from %s", (from, to) => {
    const source = read(coursesPath);
    expect(source).toContain(from);
    expect(discoveryContract(source.replace(from, to), coursesPath)).not.toBe(
      discoveryContract(source, coursesPath),
    );
  });

  it.each([supportPath, coursesPath])(
    "still detects injected UI, accessible copy and helper strings in %s",
    (path) => {
      const source = read(path);
      for (const injected of [
        "<p>Injected UI</p>",
        '<button aria-label="Injected action" />',
        'function newLabel() { return "Injected helper copy"; }',
      ]) {
        const changed = source + "\n" + injected;
        const findings =
          path === supportPath
            ? auditSupport(changed, supportPath).findings
            : auditDiscovery(changed, coursesPath).findings;
        expect(findings.length).toBeGreaterThan(0);
      }
    },
  );
});
