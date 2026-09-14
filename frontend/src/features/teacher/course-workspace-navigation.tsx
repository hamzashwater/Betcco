"use client";

import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";

export const courseWorkspaceSections = [
  "details",
  "access",
  "announcements",
  "curriculum",
  "assignments",
  "quizzes",
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
  const [activeSection, setActiveSection] =
    useState<CourseWorkspaceSectionId>("details");

  useEffect(() => {
    const syncActiveSection = () => setActiveSection(sectionFromHash());
    syncActiveSection();
    window.addEventListener("hashchange", syncActiveSection);
    return () => window.removeEventListener("hashchange", syncActiveSection);
  }, []);

  return (
    <nav
      aria-label={t("label")}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="elevated-surface sticky top-[4.5rem] z-40 mt-6 rounded-2xl border border-border p-2 backdrop-blur-xl lg:top-[7.5rem]"
    >
      <ol className="flex gap-1 overflow-x-auto" role="list">
        {courseWorkspaceSections.map((section) => {
          const isActive = activeSection === section;
          return (
            <li key={section} className="shrink-0">
              <a
                href={`#${section}`}
                aria-current={isActive ? "location" : undefined}
                onClick={() => setActiveSection(section)}
                className={`focus-ring inline-flex rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
                  isActive
                    ? "bg-primary text-slate-950 shadow-sm"
                    : "text-muted hover:bg-white/5 hover:text-foreground"
                }`}
              >
                {t(section)}
              </a>
            </li>
          );
        })}
      </ol>
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
    <div id={id} className="scroll-mt-[11rem]">
      {children}
    </div>
  );
}
