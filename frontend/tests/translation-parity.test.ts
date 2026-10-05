import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import arabicMessages from "../messages/ar.json";
import englishMessages from "../messages/en.json";

const parityNamespaces = [
  "navigation",
  "footer",
  "cookieConsent",
  "auth",
  "auth.accountLayout",
  "auth.accountProfile",
  "auth.accountSecurity",
  "auth.studentEmailChange",
  "studentWorkspace",
  "teacherWorkspace",
] as const;

function namespaceValue(value: unknown, namespace: string): unknown {
  return namespace.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || !(key in current))
      return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function shape(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => shape(item, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) =>
      shape(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

describe("shared shell, authentication, account, student, and teacher workspace translation parity", () => {
  it.each(parityNamespaces)("has matching AR/EN keys in %s", (namespace) => {
    const arabicShape = shape(namespaceValue(arabicMessages, namespace)).sort();
    const englishShape = shape(
      namespaceValue(englishMessages, namespace),
    ).sort();
    expect(englishShape).toEqual(arabicShape);
    expect(arabicShape.every(Boolean)).toBe(true);
  });

  it("keeps teacher area copy in messages with no missing or unused teacher keys", () => {
    const source = readFileSync(
      "src/features/teacher/teacher-area.tsx",
      "utf8",
    );
    expect(source).not.toMatch(/[\u0600-\u06ff]/u);
    expect(source).not.toMatch(/locale\s*===\s*["']ar["']/u);
    const usedKeys = [
      ...new Set(
        [...source.matchAll(/\bt\(\s*"([^"]+)"/gu)].map((match) => match[1]),
      ),
    ].sort();
    expect(usedKeys).toEqual(shape(englishMessages.teacherWorkspace).sort());
  });
});
