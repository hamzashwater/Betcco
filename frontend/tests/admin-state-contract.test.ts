import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baseline from "./fixtures/ui-d01-04-admin-baseline.json";
import {
  projectAdminStateSource,
  withoutAdminStateAdditions,
} from "./helpers/admin-state-projection";
const source = readFileSync("src/features/admin/admin-area.tsx", "utf8");
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
describe("exact Admin state adoption preserves all other contracts", () => {
  it("returns the complete source to verified main only through reviewed hunks", () => {
    expect(baseline.base).toBe("7464f0d73dabb0e07385d23b85592f568091063c");
    expect(hash(projectAdminStateSource(source))).toBe(baseline.sourceHash);
  });
  it.each([
    ["status === 401 && !cached", "Boolean(error)"],
    ["status === 403", "Boolean(error)"],
    ["error instanceof ApiError ? error.status : undefined", "401"],
    ["if (!result.data)", "if (result.isError || !result.data)"],
    ["if (!approvals.data)", "if (approvals.isError || !approvals.data)"],
    [
      '["admin-dashboard", period, customFrom, customTo]',
      '["admin-dashboard", period]',
    ],
    ['queryKey: ["approvals"]', 'queryKey: ["changed-approvals"]'],
    ['method: "POST"', 'method: "GET"'],
    [
      'reason: approved ? null : reasons[id] || "Needs revision"',
      "reason: null",
    ],
    ["setSelectedCourseId(undefined)", 'setSelectedCourseId("changed")'],
    ["selectedCourseId !== course.id || review.isPending", "review.isPending"],
    ["T23:59:59.999Z", "T00:00:00.000Z"],
    ["/${locale}/admin/${href}", "/${locale}/teacher/${href}"],
  ])("rejects drift at %s", (from, to) => {
    expect(source).toContain(from);
    expect(hash(projectAdminStateSource(source.replace(from, to)))).not.toBe(
      baseline.sourceHash,
    );
  });
  it("keeps API/auth, shared #194, Student/Teacher/AI/navigation/tokens/fonts/dependencies byte-identical", () => {
    for (const [file, expected] of Object.entries(baseline.protectedFiles))
      expect(hash(readFileSync(file)), file).toBe(expected);
  });
  it.each(["en", "ar"] as const)(
    "accepts only two exact %s copy leaves",
    (locale) => {
      const value = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
      expect(value.adminWorkspace.dashboard.requestError).toBe(
        baseline.additions[locale].dashboard.requestError,
      );
      expect(value.adminWorkspace.courseApprovals.signIn).toBe(
        baseline.additions[locale].courseApprovals.signIn,
      );
      const changed = structuredClone(value);
      changed.adminWorkspace.dashboard.requestError += " altered";
      expect(() => withoutAdminStateAdditions(changed)).toThrow(
        "Unverified Admin state addition",
      );
      expect(
        withoutAdminStateAdditions(value).adminWorkspace,
      ).not.toHaveProperty("dashboard.requestError");
    },
  );
});
