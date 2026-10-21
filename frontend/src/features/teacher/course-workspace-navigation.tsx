"use client";

import { useLocale, useTranslations } from "next-intl";
import authoringStyles from "./course-authoring.module.css";
import { type ReactNode, useEffect, useState } from "react";

export const courseWorkspaceSections = [
  "details",
  "access",
  "announcements",
  "curriculum",
  "assignments",
  "review",
] as const;

export type CourseWorkspaceSectionId = (typeof courseWorkspaceSections)[number];

function sectionFromHash(): CourseWorkspaceSectionId {
  if (typeof window === "undefined") return "details";
  const section = window.location.hash.slice(1);
  return courseWorkspaceSections.includes(section as CourseWorkspaceSectionId)
    ? (section as CourseWorkspaceSectionId)
    : "details";
}

export function CourseWorkspaceNavigation() {
  const locale = useLocale();
  const t = useTranslations("teacherCourseWorkspace.navigation");
  const presentation = useTranslations("teacherAuthoringPresentation");
  const [activeSection, setActiveSection] =
    useState<CourseWorkspaceSectionId>("details");

  useEffect(() => {
    const syncActiveSection = () => setActiveSection(sectionFromHash());
    syncActiveSection();

    const initialSection = window.location.hash.slice(1);
    const scrollTimer = courseWorkspaceSections.includes(
      initialSection as CourseWorkspaceSectionId,
    )
      ? window.setTimeout(() => {
          document
            .getElementById(initialSection)
            ?.scrollIntoView({ block: "start" });
        }, 0)
      : undefined;

    window.addEventListener("hashchange", syncActiveSection);
    return () => {
      if (scrollTimer !== undefined) window.clearTimeout(scrollTimer);
      window.removeEventListener("hashchange", syncActiveSection);
    };
  }, []);

  return (
    <nav
      aria-label={t("label")}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={authoringStyles.navigation}
    >
      <p className="ui-type-meta px-3 py-1 text-text-muted">{t("label")}</p>
      <ol className="flex gap-1 overflow-x-auto" role="list">
        {courseWorkspaceSections.map((section) => {
          const isActive = activeSection === section;
          return (
            <li key={section} className="shrink-0">
              <a
                href={`#${section}`}
                aria-current={isActive ? "location" : undefined}
                onClick={() => setActiveSection(section)}
                className={`focus-ring ui-type-label inline-flex min-h-11 items-center rounded-lg border-b-2 px-3 py-2 transition-colors duration-120 motion-reduce:transition-none ${
                  isActive
                    ? "border-selection-marker! bg-selection-surface text-selection-text"
                    : "border-transparent! text-text-secondary hover:bg-surface-row-hover"
                }`}
              >
                {t(section)}
              </a>
            </li>
          );
        })}
      </ol>
      <p className={authoringStyles.currentSection}>
        {presentation("currentSection", { section: t(activeSection) })}
      </p>
    </nav>
  );
}

export function CourseWorkspaceSection({
  id,
  children,
}: {
  id: CourseWorkspaceSectionId;
  children: ReactNode;
}) {
  return (
    <div id={id} className={authoringStyles.anchor}>
      {children}
    </div>
  );
}
