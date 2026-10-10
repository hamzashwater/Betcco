import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import HomePage from "@/app/[locale]/page";
import CoursesPage from "@/app/[locale]/courses/page";
import { HomeImageSections } from "@/components/home-image-sections";
import { CatalogGrid } from "@/features/courses/catalog-grid";
import { CourseCard } from "@/features/courses/course-card";
import { CourseDetailView } from "@/features/courses/course-detail";
import { TrackCards } from "@/features/courses/track-cards";
import { api } from "@/lib/api";
import {
  course,
  detail,
  preview,
  taxonomy,
} from "./helpers/public-discovery-fixtures";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("@gsap/react", () => ({ useGSAP: vi.fn() }));
vi.mock("@/components/animation/reveal", () => ({
  Reveal: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  StaggerReveal: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/home-hero-carousel", () => ({
  HomeHeroCarousel: () => null,
}));

type State = {
  auth: "Student" | "Teacher" | "guest" | "pending";
  catalog: "data" | "empty" | "error" | "pending";
  summary: "data" | "error";
  detail: "data" | "error";
  preview: "data" | "empty" | "error" | "pending";
  mutation: "success" | "raw" | "fallback";
};
let state: State;
beforeEach(() => {
  state = {
    auth: "Student",
    catalog: "data",
    summary: "data",
    detail: "data",
    preview: "data",
    mutation: "success",
  };
  vi.clearAllMocks();
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === "/auth/me") {
      if (state.auth === "pending") return new Promise(() => {});
      if (state.auth === "guest") throw new Error("Unauthorized");
      return { roles: [state.auth] };
    }
    if (path === "/platform/summary") {
      if (state.summary === "error") throw new Error("Summary error");
      return {
        publishedCourses: 4,
        publishedLessons: 12,
        activeTeachers: 2,
        enrolledStudents: 7,
      };
    }
    if (path.startsWith("/taxonomy")) return taxonomy;
    if (path.startsWith("/cart/courses/")) {
      if (state.mutation === "raw") throw new Error("RAW server error خطأ");
      if (state.mutation === "fallback") throw "Non-Error failure";
      return { items: [course] };
    }
    if (path.includes("/preview/")) {
      if (state.preview === "pending") return new Promise(() => {});
      if (state.preview === "error") throw new Error("Preview error");
      return state.preview === "empty"
        ? { ...preview, body: "", resources: [] }
        : preview;
    }
    if (path.startsWith("/catalog/courses/raw-course")) {
      if (state.detail === "error") throw new Error("Unavailable");
      return detail;
    }
    if (path.startsWith("/catalog/courses?")) {
      if (state.catalog === "pending") return new Promise(() => {});
      if (state.catalog === "error") throw new Error("Catalogue error");
      return {
        items: state.catalog === "empty" ? [] : [course],
        page: 1,
        pageSize: 12,
        totalCount: 1,
      };
    }
    throw new Error(`Unexpected scoped request ${path}`);
  });
});
afterEach(cleanup);
function mount(children: React.ReactNode, locale: "ar" | "en") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 60_000 },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "ar" ? ar : en}
      >
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return client;
}
for (const locale of ["en", "ar"] as const) {
  const m = (locale === "ar" ? ar : en).publicDiscovery;
  describe(`public discovery copy and contracts ${locale}`, () => {
    it("renders home headings, counters, image alt and locale navigation", async () => {
      mount(<HomePage />, locale);
      expect(await screen.findByText(m.home.publishedCourses)).toBeVisible();
      expect(
        screen.getByRole("heading", { name: m.home.latestPublishedCourses }),
      ).toBeVisible();
      expect(
        screen.getByRole("img", { name: m.images.clearDigitalSpecializations }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", {
          name: (locale === "ar" ? ar : en).navigation.allTracks,
        }),
      ).toHaveAttribute("href", `/${locale}/tracks`);
      expect(
        await screen.findByRole("link", { name: new RegExp(course.track) }),
      ).toHaveAttribute("href", `/${locale}/tracks/raw-track`);
    });
    it("keeps summary error and bounded user retry", async () => {
      state.summary = "error";
      mount(<HomePage />, locale);
      expect(
        await screen.findByText(m.home.platformStatisticsCouldNotBeLoadedRight),
      ).toBeVisible();
      state.summary = "data";
      await userEvent.click(
        screen.getByRole("button", { name: m.home.tryAgain }),
      );
      expect(await screen.findByText(m.home.publishedCourses)).toBeVisible();
      expect(
        vi.mocked(api).mock.calls.filter(([p]) => p === "/platform/summary"),
      ).toHaveLength(2);
    });
    it("translates all image-card text and retains all eleven meaningful alt names", () => {
      mount(<HomeImageSections />, locale);
      expect(screen.getAllByRole("img")).toHaveLength(11);
      expect(
        screen.getByRole("heading", { name: m.images.forTeachers }),
      ).toBeVisible();
      expect(
        screen.getByRole("link", { name: m.images.createAnAccount }),
      ).toHaveAttribute("href", `/${locale}/register`);
    });
    it("preserves search/filter/sort URL parameters and dependent filter resets", async () => {
      mount(<CoursesPage />, locale);
      expect(await screen.findByText(course.title)).toBeVisible();
      await userEvent.type(
        screen.getByPlaceholderText(m.catalog.searchCourses),
        "query",
      );
      await userEvent.selectOptions(
        screen.getByRole("combobox", { name: m.catalog.track }),
        "raw-track",
      );
      await userEvent.selectOptions(
        screen.getByRole("combobox", { name: m.catalog.specialization }),
        "raw-specialization",
      );
      await userEvent.selectOptions(
        screen.getByRole("combobox", { name: m.catalog.subject }),
        "raw-subject",
      );
      await userEvent.selectOptions(
        screen.getByRole("combobox", { name: m.catalog.sort }),
        "price-asc",
      );
      await waitFor(() =>
        expect(api).toHaveBeenCalledWith(
          `/catalog/courses?locale=${locale}&pageSize=12&search=query&track=raw-track&specialization=raw-specialization&subject=raw-subject&sort=price-asc`,
        ),
      );
      await userEvent.click(
        screen.getByRole("button", { name: m.catalog.clearFilters }),
      );
      expect(screen.getByPlaceholderText(m.catalog.searchCourses)).toHaveValue(
        "query",
      );
      expect(
        screen.getByRole("combobox", { name: m.catalog.sort }),
      ).toHaveValue("price-asc");
      expect(
        screen.getByRole("combobox", { name: m.catalog.track }),
      ).toHaveValue("");
    });
    it.each(["empty", "error"] as const)(
      "renders catalogue %s distinctly",
      async (mode) => {
        state.catalog = mode;
        mount(<CatalogGrid />, locale);
        expect(
          await screen.findByText(
            mode === "empty"
              ? m.grid.noCoursesMatchYourFiltersYet
              : m.grid.coursesCouldNotBeLoadedTryAgain,
          ),
        ).toBeVisible();
      },
    );
    it("preserves catalogue skeleton while pending", () => {
      state.catalog = "pending";
      mount(<CatalogGrid />, locale);
      expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
      expect(
        screen.queryByText(m.grid.noCoursesMatchYourFiltersYet),
      ).not.toBeInTheDocument();
    });
    it("preserves student add payload, raw data and cart cache", async () => {
      const client = mount(<CourseCard course={course} />, locale);
      await userEvent.click(
        await screen.findByRole("button", { name: m.card.add }),
      );
      expect(await screen.findByRole("status")).toHaveTextContent(
        m.card.courseAddedToCart,
      );
      expect(api).toHaveBeenCalledWith(
        `/cart/courses/${course.id}?locale=${locale}`,
        { method: "POST" },
      );
      expect(client.getQueryData(["cart", locale])).toEqual({
        items: [course],
      });
      expect(screen.getByText(course.teacherName)).toBeVisible();
      expect(
        screen.getByRole("link", { name: m.card.viewCart }),
      ).toHaveAttribute("href", `/${locale}/cart`);
    });
    it.each(["Teacher", "guest"] as const)(
      "keeps %s purchase gate and login target",
      async (auth) => {
        state.auth = auth;
        mount(<CourseCard course={course} />, locale);
        await userEvent.click(
          await screen.findByRole("button", {
            name:
              auth === "Teacher"
                ? m.card.studentAccountOnly
                : m.card.signInToPurchase,
          }),
        );
        if (auth === "Teacher")
          expect(await screen.findByRole("status")).toHaveTextContent(
            m.card.purchasingIsAvailableToStudentAccountsOnly,
          );
        else expect(push).toHaveBeenCalledWith(`/${locale}/login`);
        expect(
          vi
            .mocked(api)
            .mock.calls.some(([p]) => p.startsWith("/cart/courses/")),
        ).toBe(false);
      },
    );
    it.each(["raw", "fallback"] as const)(
      "preserves %s error precedence",
      async (mutation) => {
        state.mutation = mutation;
        mount(<CourseCard course={course} />, locale);
        await userEvent.click(
          await screen.findByRole("button", { name: m.card.add }),
        );
        expect(await screen.findByRole("status")).toHaveTextContent(
          mutation === "raw"
            ? "RAW server error خطأ"
            : m.card.unableToAddCourse,
        );
      },
    );
    it("retains bilingual server fields, both accessible nav names and preview resource links", async () => {
      mount(<CourseDetailView slug={course.slug} />, locale);
      expect(
        await screen.findByRole("navigation", { name: m.detail.breadcrumb }),
      ).toBeVisible();
      expect(
        screen.getByRole("navigation", { name: m.detail.courseSections }),
      ).toBeVisible();
      expect(
        screen.getByText(
          locale === "ar"
            ? detail.outcomes[0].arabic
            : detail.outcomes[0].english,
        ),
      ).toBeVisible();
      await userEvent.click(
        screen.getByRole("button", { name: m.detail.open }),
      );
      expect(await screen.findByText(preview.body)).toBeVisible();
      expect(
        screen.getByRole("link", { name: preview.resources[0].displayName }),
      ).toHaveAttribute("href", preview.resources[0].externalUrl);
      expect(api).toHaveBeenCalledWith(
        `/catalog/courses/${course.slug}/preview/lesson-1?locale=${locale}`,
      );
      await userEvent.click(
        screen.getByRole("button", { name: m.detail.close }),
      );
      expect(screen.queryByText(preview.body)).not.toBeInTheDocument();
    });
    it.each(["pending", "empty", "error"] as const)(
      "renders preview %s",
      async (mode) => {
        state.preview = mode;
        mount(<CourseDetailView slug={course.slug} />, locale);
        await userEvent.click(
          await screen.findByRole("button", { name: m.detail.open }),
        );
        expect(
          await screen.findByText(
            mode === "pending"
              ? m.detail.loadingPreview
              : mode === "empty"
                ? m.detail.noTextIsAvailableForThisPreview
                : m.detail.thisPreviewCouldNotBeOpenedNow,
          ),
        ).toBeVisible();
      },
    );
    it("renders unavailable detail and both track descriptions", async () => {
      state.detail = "error";
      mount(
        <>
          <CourseDetailView slug={course.slug} />
          <TrackCards />
        </>,
        locale,
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        m.detail.thisCourseIsUnavailable,
      );
      expect(
        await screen.findByText(m.tracks.betccoSPrimaryBtecFocusedTrack),
      ).toBeVisible();
      expect(
        screen.getByText(m.tracks.anAdministratorManagedAcademicTrack),
      ).toBeVisible();
    });
  });
}
