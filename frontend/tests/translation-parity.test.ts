import { describe, expect, it } from "vitest";
import arabicMessages from "../messages/ar.json";
import englishMessages from "../messages/en.json";

const parityNamespaces = [
  "navigation",
  "footer",
  "cookieConsent",
  "auth",
] as const;

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

describe("shared shell and authentication translation parity", () => {
  it.each(parityNamespaces)("has matching AR/EN keys in %s", (namespace) => {
    const arabicShape = shape(arabicMessages[namespace]).sort();
    const englishShape = shape(englishMessages[namespace]).sort();
    expect(englishShape).toEqual(arabicShape);
    expect(arabicShape.every(Boolean)).toBe(true);
  });
});
