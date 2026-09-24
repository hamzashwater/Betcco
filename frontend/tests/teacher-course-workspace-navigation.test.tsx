import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import arMessages from "../messages/ar.json";
import enMessages from "../messages/en.json";
import {
  CourseWorkspaceNavigation,
  CourseWorkspaceSection,
} from "@/features/teacher/course-workspace-navigation";

function renderNavigation(locale: "ar" | "en") {
  const messages = locale === "ar" ? arMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CourseWorkspaceNavigation />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/en/teacher/courses/course-id");
});

describe("CourseWorkspaceNavigation", () => {
  it("links every existing major workspace area to a stable fragment", () => {
    renderNavigation("en");
    const navigation = screen.getByRole("navigation", {
      name: "Course workspace sections",
    });
    expect(navigation).toHaveAttribute("dir", "ltr");
    const expectedLinks = [
      ["Course setup", "#details"],
      ["Access & availability", "#access"],
      ["Announcements", "#announcements"],
      ["Curriculum", "#curriculum"],
      ["Assignments & gradebook", "#assignments"],
      ["Publishing & review", "#review"],
    ];

    expectedLinks.forEach(([name, href]) => {
      expect(within(navigation).getByRole("link", { name })).toHaveAttribute(
        "href",
        href,
      );
    });
  });

  it("marks a deep-linked section as the current location", async () => {
    window.history.replaceState(
      null,
      "",
      "/en/teacher/courses/course-id#curriculum",
    );
    renderNavigation("en");

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Curriculum" })).toHaveAttribute(
        "aria-current",
        "location",
      ),
    );
    expect(
      screen.getByRole("link", { name: "Course setup" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("scrolls a deep-linked section into view after the workspace mounts", async () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
      writable: true,
    });
    window.history.replaceState(
      null,
      "",
      "/en/teacher/courses/course-id#curriculum",
    );

    try {
      render(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <CourseWorkspaceNavigation />
          <CourseWorkspaceSection id="curriculum">
            <p>Curriculum content</p>
          </CourseWorkspaceSection>
        </NextIntlClientProvider>,
      );

      await waitFor(() =>
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" }),
      );
    } finally {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView,
        writable: true,
      });
    }
  });

  it("updates the visible active state when a section link is selected", () => {
    renderNavigation("en");
    const assignments = screen.getByRole("link", {
      name: "Assignments & gradebook",
    });

    fireEvent.click(assignments);

    expect(assignments).toHaveAttribute("aria-current", "location");
    expect(
      screen.getByRole("link", { name: "Course setup" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("uses Arabic catalog labels and an explicit RTL direction", () => {
    renderNavigation("ar");
    const navigation = screen.getByRole("navigation", {
      name: "أقسام مساحة عمل الدورة",
    });

    expect(navigation).toHaveAttribute("dir", "rtl");
    expect(
      within(navigation).getByRole("link", { name: "إعداد الدورة" }),
    ).toHaveAttribute("href", "#details");
    expect(
      within(navigation).getByRole("link", {
        name: "المهام وسجل الدرجات",
      }),
    ).toHaveAttribute("href", "#assignments");
  });

  it("preserves existing editor content inside an anchored section", () => {
    render(
      <CourseWorkspaceSection id="assignments">
        <button type="button">Existing assignment action</button>
      </CourseWorkspaceSection>,
    );

    expect(screen.getByText("Existing assignment action")).toBeVisible();
    expect(
      screen.getByText("Existing assignment action").parentElement,
    ).toHaveAttribute("id", "assignments");
  });
});
