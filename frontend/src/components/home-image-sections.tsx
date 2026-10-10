"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

type PlatformVisual = {
  image: string;
  title: string;
  description: string;
};

export function HomeImageSections() {
  const locale = useLocale();
  const copy = useTranslations("publicDiscovery.images");
  const platformVisuals: PlatformVisual[] = [
    {
      image: "/images/betcco/pack/platform/it-specialization.webp",
      title: copy("clearDigitalSpecializations"),
      description: copy("chooseTheTrackAndSpecializationThatMatch"),
    },
    {
      image: "/images/betcco/pack/platform/online-courses.webp",
      title: copy("structuredCourses"),
      description: copy("learnFromStructuredContentThatMovesFrom"),
    },
    {
      image: "/images/betcco/pack/platform/expert-teacher.webp",
      title: copy("specialistTeachers"),
      description: copy("clearLearningCommunicationAndFollowUpConnected"),
    },
    {
      image: "/images/betcco/pack/platform/btec-projects.webp",
      title: copy("btecProjects"),
      description: copy("turnKnowledgeIntoPracticalAssignmentsLinkedTo"),
    },
    {
      image: "/images/betcco/pack/platform/assessment-feedback.webp",
      title: copy("usefulFeedback"),
      description: copy("seeWhatYouAchievedAndWhatTo"),
    },
    {
      image: "/images/betcco/pack/platform/student-progress.webp",
      title: copy("visibleProgress"),
      description: copy("trackYourLessonsAndAchievementsInOne"),
    },
    {
      image: "/images/betcco/pack/platform/certificate-success.webp",
      title: copy("documentedAchievements"),
      description: copy("keepAClearRecordOfYourLearning"),
    },
    {
      image: "/images/betcco/pack/platform/about-betcco.webp",
      title: copy("betccoInOnePlace"),
      description: copy("lessonsAssignmentsCriteriaAndEvaluationInOne"),
    },
  ];

  const roleVisuals = [
    {
      image: "/images/betcco/pack/dashboards/student-dashboard.webp",
      title: copy("forStudents"),
      description: copy("learnProgressAndSubmitAssignmentsWithConfidence"),
    },
    {
      image: "/images/betcco/pack/dashboards/teacher-dashboard.webp",
      title: copy("forTeachers"),
      description: copy("createStructuredContentAndFollowYourStudents"),
    },
    {
      image: "/images/betcco/pack/dashboards/admin-dashboard.webp",
      title: copy("forAdministrators"),
      description: copy("manageThePlatformCoursesAndUsersFrom"),
    },
  ] as const;

  return (
    <>
      <section className="shell py-14 md:py-20">
        <div className="max-w-3xl">
          <p className="text-sm font-bold text-primary">
            {copy("theBetccoExperience")}
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            {copy("everythingYouNeedToLearnApplyAnd")}
          </h2>
          <p className="mt-3 leading-7 text-muted">
            {copy("fromChoosingASpecializationToAssessmentAnd")}
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {platformVisuals.map((visual) => (
            <article
              key={visual.image}
              className="card group relative min-h-72 overflow-hidden p-5"
            >
              <Image
                src={visual.image}
                alt={visual.title}
                fill
                sizes="(max-width: 640px) calc(100vw - 2rem), (max-width: 1280px) calc(50vw - 2rem), 25vw"
                className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,10,25,.08),rgba(5,10,25,.9))]" />
              <div className="relative flex min-h-60 flex-col justify-end">
                <h3 className="text-lg font-black text-white">
                  {visual.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  {visual.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="shell py-14 md:py-20">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-sm font-bold text-primary">
              {copy("aSpaceForEveryRole")}
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              {copy("onePlatformTailoredToEveryUser")}
            </h2>
          </div>
          <Link
            href={`/${locale}/register`}
            className="focus-ring inline-flex items-center gap-2 text-sm font-bold text-primary"
          >
            {copy("startAsAStudent")}
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {roleVisuals.map((visual) => (
            <article key={visual.image} className="card overflow-hidden">
              <div className="relative aspect-[16/9] overflow-hidden border-b border-border">
                <Image
                  src={visual.image}
                  alt={visual.title}
                  fill
                  sizes="(max-width: 1024px) calc(100vw - 2rem), 33vw"
                  className="object-cover"
                />
              </div>
              <div className="p-5">
                <h3 className="font-black text-foreground">{visual.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {visual.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="shell pb-20 pt-8 md:pb-28">
        <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-[var(--surface-solid)] px-6 py-10 shadow-[var(--shadow)] sm:px-10 md:py-14">
          <Image
            src="/images/betcco/pack/cta/join-betcco-cta.webp"
            alt=""
            fill
            sizes="(max-width: 1180px) calc(100vw - 2rem), 1180px"
            className="object-cover opacity-45"
          />
          <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(5,10,25,.94),rgba(5,10,25,.52))]" />
          <Image
            src="/images/betcco/pack/transparent-elements/digital-book.png"
            alt=""
            width={300}
            height={300}
            className="absolute -bottom-24 -end-12 hidden size-72 object-contain opacity-80 lg:block"
          />
          <div className="relative max-w-2xl">
            <p className="text-sm font-black text-secondary">BETCCO</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl">
              {copy("startYourLearningJourneyWithMoreClarity")}
            </h2>
            <p className="mt-4 max-w-xl leading-7 text-slate-200">
              {copy("exploreCoursesOrCreateAStudentAccount")}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={`/${locale}/courses`}
                className="premium-button focus-ring inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-white"
              >
                {copy("browseCourses")}
                <ArrowLeft size={18} className="rtl:rotate-180" />
              </Link>
              <Link
                href={`/${locale}/register`}
                className="focus-ring rounded-xl border border-white/35 bg-white/10 px-5 py-3 font-bold text-white hover:bg-white/15"
              >
                {copy("createAnAccount")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
