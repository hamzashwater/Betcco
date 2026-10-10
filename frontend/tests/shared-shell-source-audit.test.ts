import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import baseline from "./fixtures/shared-shell-i18n-baseline.json";
import { catalogue, digest, leaves } from "./helpers/admin-final-i18n-audit";
import { withoutSharedShellAdditions } from "./helpers/shared-shell-catalogue-projection";
import {
  auditShell,
  liveShellAudit,
  scopedFiles,
  shellContracts,
} from "./helpers/shared-shell-i18n-audit";

const reports = liveShellAudit();
const read = (path: string) => readFileSync(path, "utf8");
const messages = {
  ar: catalogue(read("messages/ar.json")),
  en: catalogue(read("messages/en.json")),
};

describe("T7-A6.1 shared shell migration", () => {
  it("audits exactly all seven authorized files and reproduces the base 23/9/0 inventory", () => {
    expect(reports.map((r) => r.path)).toEqual(scopedFiles);
    expect(Object.keys(baseline.sources)).toEqual(scopedFiles);
    const counts = scopedFiles.map(
      (path) => auditShell(baseline.sources[path], path).counts,
    );
    expect(counts).toEqual(
      baseline.counts.map(([ui, accessibility]) => ({
        STATIC_UI: ui,
        ACCESSIBILITY_STATIC_UI: accessibility,
        UNCLASSIFIED: 0,
      })),
    );
    expect(counts.reduce((n, c) => n + c.STATIC_UI, 0)).toBe(23);
    expect(counts.reduce((n, c) => n + c.ACCESSIBILITY_STATIC_UI, 0)).toBe(9);
  });
  it.each(reports)("has precisely 0/0/0 residuals in $path", (report) => {
    expect(report.findings).toEqual([]);
    expect(report.counts).toEqual({
      STATIC_UI: 0,
      ACCESSIBILITY_STATIC_UI: 0,
      UNCLASSIFIED: 0,
    });
    expect(report.references.length).toBeGreaterThan(0);
  });
  it.each(scopedFiles)(
    "preserves DOM/accessibility mechanics and non-copy contracts in %s",
    (path) => {
      expect(shellContracts(read(path))).toEqual(
        shellContracts(baseline.sources[path]),
      );
    },
  );
  it("checks entire catalogue parity, duplicates and every scoped translation reference", () => {
    const ar = leaves(messages.ar.value),
      en = leaves(messages.en.value);
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    expect(messages.ar.duplicates).toEqual([]);
    expect(messages.en.duplicates).toEqual([]);
    for (const report of reports)
      for (const ref of report.references) {
        const key = [ref.namespace, ref.key].filter(Boolean).join(".");
        expect(typeof ar[key], key).toBe("string");
        expect(typeof en[key], key).toBe("string");
      }
  });
  it.each(["ar", "en"] as const)(
    "adds only paired scoped keys and changes no old %s message value",
    (locale) => {
      const current = messages[locale].value as Record<string, unknown>;
      const projected = withoutSharedShellAdditions(structuredClone(current));
      expect(digest(JSON.stringify(projected))).toBe(
        baseline.catalogues[locale].baseCatalogueHash,
      );
      const flat = leaves(current);
      const additions = Object.fromEntries(
        Object.entries(baseline.catalogues[locale].additions).flatMap(
          ([path, v]) => Object.entries(leaves(v, path)),
        ),
      );
      expect(Object.keys(additions)).toHaveLength(30);
      for (const [key, expected] of Object.entries(additions))
        expect(flat[key], key).toBe(expected);
    },
  );
  it.each([
    ["export function C(){return <p>Hardcoded English UI</p>}", "STATIC_UI"],
    ["export function C(){return <p>نص عربي ثابت</p>}", "STATIC_UI"],
    [
      'export function C(){return <button aria-label="Accessible action"/>}',
      "ACCESSIBILITY_STATIC_UI",
    ],
    [
      'export function C(){return <button title="Helpful tooltip"/>}',
      "ACCESSIBILITY_STATIC_UI",
    ],
    [
      'export function C(){return <img alt="Meaningful image"/>}',
      "ACCESSIBILITY_STATIC_UI",
    ],
    [
      'export function C(){return <input placeholder="Search here"/>}',
      "ACCESSIBILITY_STATIC_UI",
    ],
    [
      'function help(){return "Helper returned copy"} export function C(){return <p>{help()}</p>}',
      "STATIC_UI",
    ],
    [
      'export function C(){const t=useTranslations("appShell");return <p>{t(key)}</p>}',
      "UNCLASSIFIED",
    ],
    [
      'export function C(){const t=useTranslations("appShell");return <p>{t(`error.${key}`)}</p>}',
      "UNCLASSIFIED",
    ],
    [
      'export function C(){const t=useTranslations(namespace);return <p>{t("key")}</p>}',
      "UNCLASSIFIED",
    ],
  ])("detects injected debt: %s", (source, category) => {
    expect(
      auditShell(source).findings.some((f) => f.category === category),
    ).toBe(true);
  });
  it("does not mask old-value drift or unrelated keys in historical projections", () => {
    const current = messages.en.value as Record<string, unknown>;
    const before = digest(
      JSON.stringify(withoutSharedShellAdditions(structuredClone(current))),
    );
    for (const change of ["old", "new"]) {
      const modified = structuredClone(current);
      const nav = modified.navigation as Record<string, unknown>;
      nav[change === "old" ? "home" : "unrelated"] = "Drift";
      expect(
        digest(JSON.stringify(withoutSharedShellAdditions(modified))),
      ).not.toBe(before);
    }
    const modified = structuredClone(current);
    (
      (modified.navigation as Record<string, unknown>).theme as Record<
        string,
        unknown
      >
    ).label = "Wrong scoped wording";
    expect(() => withoutSharedShellAdditions(modified)).toThrow(
      "Unverified shared shell additions",
    );
  });
  it.each([
    [scopedFiles[3], "selectedFiles.slice(0, 1)", "selectedFiles.slice(0, 2)"],
    [scopedFiles[4], 'pageSize: "5"', 'pageSize: "10"'],
    [scopedFiles[5], 'method: "POST"', 'method: "GET"'],
    [scopedFiles[6], '"betcco-theme"', '"theme"'],
    [scopedFiles[1], 'href="#main-content"', 'href="#other"'],
  ])("detects non-copy contract drift in %s", (path, from, to) => {
    const source = read(path);
    expect(source).toContain(from);
    expect(shellContracts(source.replace(from, to))).not.toEqual(
      shellContracts(source),
    );
  });
});
