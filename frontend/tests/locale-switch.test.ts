import { describe, expect, it } from "vitest";
import {
  getAlternateLocale,
  getLocaleSwitchPathname,
} from "@/i18n/locale-switch";

describe("locale switch destinations", () => {
  it.each([
    ["ar", "en"],
    ["en", "ar"],
  ])("uses the configured alternate locale for %s", (locale, alternate) => {
    expect(getAlternateLocale(locale)).toBe(alternate);
  });

  it.each([
    ["/ar", "ar", "en", "/en"],
    ["/en", "en", "ar", "/ar"],
    ["/ar/courses", "ar", "en", "/en/courses"],
    ["/en/login", "en", "ar", "/ar/login"],
    ["/ar/courses/example-course", "ar", "en", "/en/courses/example-course"],
    ["/ar/student/dashboard", "ar", "en", "/en/student/dashboard"],
    ["/en/teacher/courses", "en", "ar", "/ar/teacher/courses"],
  ])(
    "switches only the leading locale in %s",
    (path, current, target, expected) => {
      expect(getLocaleSwitchPathname(path, current, target)).toBe(expected);
    },
  );

  it.each([
    ["/ar/en/courses", "ar", "en"],
    ["/en/ar/courses", "en", "ar"],
  ])(
    "leaves an already duplicated locale prefix untouched in %s",
    (path, current, target) => {
      expect(getLocaleSwitchPathname(path, current, target)).toBe(path);
    },
  );

  it.each([
    ["/fr/courses", "ar", "en"],
    ["/ar/courses", "fr", "en"],
    ["/ar/courses", "ar", "fr"],
  ])("leaves unsupported route input unchanged", (path, current, target) => {
    expect(getLocaleSwitchPathname(path, current, target)).toBe(path);
  });
});
