import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import baseline from "./fixtures/ui-d01-15-content-studio-baseline.json";
import { studioContracts } from "./helpers/content-studio-contracts";
import {
  projectContentStudioBoundary,
  withoutContentStudioAdditions,
} from "./helpers/content-studio-projection";
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const source = read(baseline.path),
  original = read("tests/fixtures/content-studio-original.txt");
describe("Slice 11 exact wire and owner boundaries", () => {
  it("pins original source and all query, payload, success reset/invalidation, selection, initial-state and domain contracts", () => {
    expect(baseline.base).toBe("d48261ac94156b38ed837ec4fa45077002a9e494");
    expect(hash(original)).toBe(
      "b708d05cd53733c8dca5731170323959ac9d3ba5c530b9d3714c1fb8c4aa8721",
    );
    expect(hash(original)).toBe(baseline.originalHash);
    expect(hash(source)).toBe(baseline.approvedHash);
    expect(studioContracts(source)).toEqual(studioContracts(original));
    expect(Object.keys(studioContracts(source).queries)).toHaveLength(8);
    expect(Object.keys(studioContracts(source).mutations)).toHaveLength(5);
    expect(source).not.toMatch(
      /setQueryData|optimistic|localStorage|\bfetch\(|"DELETE"|"PATCH"|\.sort\(/,
    );
  });
  it.each([
    ['"/admin/content/blog"', '"/changed"'],
    ['method: "POST"', 'method: "DELETE"'],
    ["JSON.stringify(article)", "JSON.stringify({})"],
    ["Boolean(attendanceSessionId)", "true"],
    ['"admin-content-blog"', '"changed-key"'],
    ["pageSize=100", "pageSize=500"],
    ["price: Number(packageValue.price)", "price: 0"],
    ["courseId: session.courseId || null", 'courseId: "invented"'],
    ["profile.arabicBio || null", 'profile.arabicBio || ""'],
    ["new Date(session.startsAtUtc).toISOString()", "session.startsAtUtc"],
    ['setAttendanceStudentId("")', 'setAttendanceStudentId("invented")'],
    ['"Present"', '"AttendedAutomatically"'],
  ])("rejects transport/domain drift: %s", (before, after) => {
    expect(source).toContain(before);
    const changed = source.replace(before, after);
    expect(studioContracts(changed)).not.toEqual(studioContracts(original));
    expect(projectContentStudioBoundary(changed, baseline.path)).toBe(changed);
  });
  it("accepts only exact owner, message and historical-helper seams", () => {
    expect(projectContentStudioBoundary(source, baseline.path)).toBe(original);
    expect(
      projectContentStudioBoundary(source, "src/other/content-studio.tsx"),
    ).toBe(source);
    for (const bad of [source + source, source.replace(/\S/, "#"), ""])
      expect(projectContentStudioBoundary(bad, baseline.path)).toBe(bad);
    for (const [p, seam] of Object.entries(baseline.guards)) {
      expect(projectContentStudioBoundary(read(p), p)).toBe(seam.previous);
      for (const bad of [
        seam.approved + seam.approved,
        seam.approved.replace(/\S/, "#"),
        "",
      ])
        expect(projectContentStudioBoundary(bad, p)).toBe(bad);
    }
  });
  it.each(Object.entries(baseline.protected))(
    "freezes previous owners, backend, dependencies, workflows and original baselines: %s",
    (p, expected) => expect(hash(read("../" + p))).toBe(expected),
  );
  it.each(["en", "ar"] as const)(
    "preserves all old %s copy and permits only exact paired additions",
    (locale) => {
      const raw = read(`messages/${locale}.json`),
        value = JSON.parse(raw);
      expect(Object.keys(baseline.additions.en)).toEqual(
        Object.keys(baseline.additions.ar),
      );
      expect(Object.keys(baseline.oldCopy[locale])).toHaveLength(60);
      for (const [k, v] of Object.entries(baseline.oldCopy[locale]))
        expect(value.adminContent[k]).toBe(v);
      const projected = withoutContentStudioAdditions(JSON.parse(raw));
      expect(projected.adminContent).toEqual(baseline.oldCopy[locale]);
      expect(
        JSON.parse(projectContentStudioBoundary(raw, `messages/${locale}.json`))
          .adminContent,
      ).toEqual(baseline.oldCopy[locale]);
      for (const key of Object.keys(baseline.additions[locale])) {
        const changed = JSON.parse(raw);
        changed.adminContent[key] += " changed";
        expect(() => withoutContentStudioAdditions(changed)).toThrow();
      }
      const unknown = JSON.parse(raw);
      unknown.adminContent.unapproved = "kept";
      expect(
        (
          withoutContentStudioAdditions(unknown).adminContent as Record<
            string,
            string
          >
        ).unapproved,
      ).toBe("kept");
    },
  );
  it("uses private opaque styles, semantic tokens, routine weights, focus and reachable controls", () => {
    const css = read("src/features/admin/content-studio.module.css"),
      global = read("src/app/globals.css");
    expect(source + css).not.toMatch(
      /font-black|font-extrabold|radial-gradient|linear-gradient|backdrop-filter|font-weight:\s*(800|900)/,
    );
    for (const m of css.matchAll(/var\((--ui-[a-z-]+)\)/g))
      expect(global, m[1]).toContain(m[1] + ":");
    for (const m of css.matchAll(/font-weight:\s*(\d+)/g))
      expect([400, 500, 600, 700]).toContain(Number(m[1]));
    for (const term of [
      "min-height: 44px",
      "outline-offset: 2px",
      "overflow-wrap: anywhere",
      "border-inline-start",
      ".panel[hidden]",
    ])
      expect(css).toContain(term);
    expect(source).toContain(
      "key={`${attendanceSessionId}:${item.id}:${item.status}`}",
    );
    expect(source).toContain("mutation.error instanceof Error");
    expect(source).toContain("mutation.error.message");
  });
});
