import { describe, expect, it } from "vitest";
import {
  formatLocalizedDate,
  formatLocalizedDateTime,
  getDateTimeIntlLocale,
} from "@/i18n/date-time";

const timestamp = "2026-03-17T14:05:00.000Z";

describe("locale-aware date and time formatting", () => {
  it("maps BETCCO Arabic and English to deliberate Intl locales", () => {
    expect(getDateTimeIntlLocale("ar")).toBe("ar-JO");
    expect(getDateTimeIntlLocale("en")).toBe("en-GB");
    expect(getDateTimeIntlLocale("unsupported")).toBe("ar-JO");
  });

  it("formats the same UTC date with the active Arabic locale", () => {
    const options: Intl.DateTimeFormatOptions = { dateStyle: "medium" };
    expect(formatLocalizedDate(timestamp, "ar", options)).toBe(
      new Intl.DateTimeFormat("ar-JO", options).format(new Date(timestamp)),
    );
  });

  it("formats the same UTC date with the active English locale", () => {
    const options: Intl.DateTimeFormatOptions = { dateStyle: "medium" };
    expect(formatLocalizedDate(timestamp, "en", options)).toBe(
      new Intl.DateTimeFormat("en-GB", options).format(new Date(timestamp)),
    );
  });

  it("formats the same timestamp with the active Arabic date and time locale", () => {
    const options: Intl.DateTimeFormatOptions = {
      dateStyle: "medium",
      timeStyle: "short",
    };
    expect(formatLocalizedDateTime(timestamp, "ar", options)).toBe(
      new Intl.DateTimeFormat("ar-JO", options).format(new Date(timestamp)),
    );
  });

  it("formats the same timestamp with the active English date and time locale", () => {
    const options: Intl.DateTimeFormatOptions = {
      dateStyle: "medium",
      timeStyle: "short",
    };
    expect(formatLocalizedDateTime(timestamp, "en", options)).toBe(
      new Intl.DateTimeFormat("en-GB", options).format(new Date(timestamp)),
    );
  });

  it("returns an empty value rather than throwing for absent or invalid timestamps", () => {
    expect(formatLocalizedDate(undefined, "ar")).toBe("");
    expect(formatLocalizedDateTime(null, "en")).toBe("");
    expect(formatLocalizedDate("not-a-date", "ar")).toBe("");
  });

  it("keeps an explicitly selected timezone when requested", () => {
    expect(
      formatLocalizedDate(timestamp, "en", {
        dateStyle: "medium",
        timeZone: "UTC",
      }),
    ).toBe(
      new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(timestamp)),
    );
  });
});
