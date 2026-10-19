import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { projectTeacherRouteBoundary } from "./helpers/teacher-route-boundary-projection";

const source = readFileSync("src/components/site-navigation.tsx", "utf8");
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
// Independently verified b420f76 main source; also retained by the #196 freeze.
const mainHash =
  "fa379962fe96368da2ebad1da2ff984656da8e7c489dc4cd42bae7e67a6966ce";

describe("exact Teacher section repair preserves the complete navigation contract", () => {
  it("changes only the explicit helper and two Teacher classification predicates", () => {
    expect(hash(projectTeacherRouteBoundary(source))).toBe(mainHash);
  });

  it.each([
    [
      "pathname.startsWith(`${sectionRoot}/`)",
      "pathname.startsWith(sectionRoot)",
    ],
    ["pathname === sectionRoot", "true"],
    [
      "isTeacherWorkspacePath(pathname, locale)",
      "pathname.startsWith(`/${locale}/teacher`)",
    ],
    ['queryKey: ["current-user"]', 'queryKey: ["changed-user"]'],
    ["href: `/${locale}/teacher/courses`", "href: `/${locale}/changed`"],
    ["pathname.startsWith(`/${locale}/admin`)", "false"],
    ["enabled: !isWorkspace && (megaOpen || drawerOpen)", "enabled: true"],
    ["destination.hash = window.location.hash;", 'destination.hash = "";'],
  ])("rejects drift at %s", (from, to) => {
    expect(source).toContain(from);
    expect(
      hash(projectTeacherRouteBoundary(source.replace(from, to))),
    ).not.toBe(mainHash);
  });
});
