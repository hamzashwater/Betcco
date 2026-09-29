import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AttendanceRow } from "@/features/admin/content-studio";
import { useTranslations } from "next-intl";

afterEach(cleanup);

const timestamp = "2026-03-17T14:05:00.000Z";
const translate = ((key: string) => key) as ReturnType<typeof useTranslations>;

describe("Content Studio attendance date display", () => {
  it.each([
    ["ar", "ar-JO"],
    ["en", "en-GB"],
  ])(
    "formats joined-at timestamps with BETCCO's %s locale",
    (locale, intlLocale) => {
      render(
        <AttendanceRow
          item={{
            id: "attendance-1",
            studentUserId: "student-1",
            studentName: "Student Example",
            status: "Present",
            joinedAtUtc: timestamp,
          }}
          locale={locale}
          t={translate}
          saving={false}
          onSave={() => undefined}
        />,
      );

      const expected = new Intl.DateTimeFormat(intlLocale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(timestamp));
      expect(screen.getByText(expected)).toBeInTheDocument();
    },
  );
});
