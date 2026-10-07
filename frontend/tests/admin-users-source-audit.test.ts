import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import {
  audit,
  contractHash,
  functionsIn,
  scopes,
} from "./helpers/admin-users-i18n-audit";
import messages from "../messages/en.json";
import arabicMessages from "../messages/ar.json";
import copyBaseline from "./fixtures/admin-users-copy-baseline.json";
const files = Object.entries(scopes).map(([path, names]) => ({
  path,
  names,
  source: readFileSync(path, "utf8"),
}));
function leaves(v: unknown, prefix = ""): string[] {
  return v && typeof v === "object"
    ? Object.entries(v).flatMap(([key, child]) =>
        leaves(child, prefix ? `${prefix}.${key}` : key),
      )
    : [prefix];
}
describe("scoped Admin user/identity source and contract audit", () => {
  it.each(["ar", "en"] as const)(
    "preserves all 159 base-main static/interpolated wording cases in %s",
    (locale) => {
      const catalogue = locale === "ar" ? arabicMessages : messages;
      const t = createTranslator({
        locale,
        messages: catalogue,
        namespace: "adminWorkspace",
      });
      const cases = copyBaseline.cases as {
        key: string;
        ar: string;
        en: string;
        values: Record<string, string | number>;
        arValues?: Record<string, string | number>;
      }[];
      for (const entry of cases)
        expect(
          t(
            entry.key as Parameters<typeof t>[0],
            locale === "ar" ? (entry.arValues ?? entry.values) : entry.values,
          ),
          entry.key,
        ).toBe(entry[locale]);
    },
  );
  it("keeps every existing A5.5.1 namespace value byte-for-byte equivalent", () => {
    for (const [locale, catalogue] of [
      ["ar", arabicMessages],
      ["en", messages],
    ] as const) {
      const original: Record<string, unknown> = JSON.parse(
        JSON.stringify(catalogue.adminWorkspace),
      );
      delete original.students;
      delete original.teacherInvites;
      delete original.accountIdentities;
      delete (original.shared as Record<string, unknown>).cancel;
      expect(
        createHash("sha256").update(JSON.stringify(original)).digest("hex"),
      ).toBe(EXISTING_CATALOGUE_HASHES[locale]);
    }
  });
  it.each(files)(
    "has zero static UI, locale-copy branches or unclassified uses in $path",
    ({ source, names }) => {
      expect(
        functionsIn(source, names).functions.map((fn) => fn.name!.text),
      ).toEqual(names);
      expect(audit(source, names).findings).toEqual([]);
    },
  );
  it("classifies only the Teacher date formatter and its locale binding", () => {
    expect(
      files.flatMap(({ source, names }) => audit(source, names).localeUses),
    ).toEqual([
      { owner: "TeacherInvites", kind: "OTHER", text: "useLocale binding" },
      {
        owner: "TeacherInvites",
        kind: "FORMATTER",
        text: "formatLocalizedDateTime(value, locale)",
      },
    ]);
  });
  it("uses every added key and reuses shared loading/cancel and dashboard eyebrow", () => {
    const keys = [
      ...new Set(
        files.flatMap(({ source, names }) => audit(source, names).keys),
      ),
    ].sort();
    const expected = leaves(messages.adminWorkspace).filter(
      (key) =>
        /^(students|teacherInvites|accountIdentities)\./.test(key) ||
        [
          "shared.cancel",
          "shared.loadingIndicator",
          "dashboard.eyebrow",
        ].includes(key),
    );
    expect(keys).toEqual(expected.sort());
    expect(keys).toHaveLength(113);
  });
  it.each(files)(
    "freezes base-main technical contracts in $path",
    ({ source, names, path }) => {
      expect(functionsIn(source, names).functions.map(contractHash)).toEqual(
        BASELINES[path],
      );
    },
  );
  it.each([
    ['t("students.title")', '"Student management"'],
    ['t("students.title")', '"إدارة الطلاب"'],
    ['t("teacherInvites.send")', 'locale === "ar" ? "إرسال" : "Send"'],
    ['t("students.resetDevice")', "`Reset device for ${student.displayName}`"],
  ])("detects reintroduced static copy: %s", (before, after) => {
    const file = files.find(({ source }) => source.includes(before))!;
    expect(file).toBeDefined();
    expect(
      audit(file.source.replace(before, after), file.names).findings.length,
    ).toBeGreaterThan(0);
  });
  it.each([
    ["role=Student&pageSize=100", "role=Teacher&pageSize=100"],
    [
      "JSON.stringify({ reason: resetReason })",
      "JSON.stringify({ reason: resetReason.trim() })",
    ],
    ["setSelectedStudentIds(result.failedIds)", "setSelectedStudentIds([])"],
    ['"teachers-for-evaluation"', '"teachers-for-evaluations"'],
    ['role === "SupportAdmin"', 'role === "Teacher"'],
    [
      "page * 25 >= users.data.totalCount",
      "page * 50 >= users.data.totalCount",
    ],
  ])("detects behavior drift: %s", (before, after) => {
    const file = files.find(({ source }) => source.includes(before))!;
    expect(file).toBeDefined();
    expect(
      functionsIn(file.source.replace(before, after), file.names).functions.map(
        contractHash,
      ),
    ).not.toEqual(BASELINES[file.path]);
  });
});
// Frozen from main 76fc4deac263645daea28eb6bca4deb537c5f11b before migration.
const BASELINES: Record<string, string[]> = {
  "src/features/admin/admin-area.tsx": [
    "e0f593577da45ab329bae63335a2ae6133e7d3f948c5fbd64bdd00f075890e54",
    "48ac41b1ea7f21f77ea28d2a43f5883e7fcb44a7e152312fbfb57590b2b9b7d5",
  ],
  "src/features/admin/account-identity-management.tsx": [
    "edca5b4064304d88778b5690697eed3e1b44daadc5e92acff6b56125e061baeb",
  ],
};
const EXISTING_CATALOGUE_HASHES = {
  ar: "47077fe637ff6aabc1cf99e86c029a16b23431a0acf4517ddb1006efbf78e484",
  en: "82a6c902107b5f69f44af17056b72cd4cd07b5213705e2f30ff6d6f34724c39f",
};
