import { expect, test } from "@playwright/test";

const courseId = "00000000-0000-0000-0000-000000000100";
const lessonId = "00000000-0000-0000-0000-000000000102";

const player = {
  id: courseId,
  title: "Media course",
  resumeLessonId: lessonId,
  currentLessonId: lessonId,
  previousLessonId: null,
  nextLessonId: null,
  requestedLessonRejected: false,
  modules: [
    {
      id: "00000000-0000-0000-0000-000000000110",
      title: "Media unit",
      isLocked: false,
      lessons: [
        {
          id: lessonId,
          title: "Playable lesson",
          type: "Video",
          body: "Video introduction",
          durationSeconds: 2,
          isLocked: false,
          resources: [],
          video: {
            id: "00000000-0000-0000-0000-000000000120",
            displayName: "sample.webm",
            contentType: "video/webm",
          },
          isCompleted: false,
          lastPositionSeconds: 0,
        },
      ],
    },
  ],
};

for (const locale of ["en", "ar"] as const) {
  for (const viewport of [
    { width: 1280, height: 844 },
    { width: 390, height: 844 },
  ]) {
    test(`${locale} video plays on ${viewport.width}px without overflow or player errors`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await mockStudentSession(page);
      await page.goto(`/${locale}`);
      const clip = Buffer.from(await recordWebm(page));
      const pageErrors: string[] = [];
      const mediaErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("response", (response) => {
        if (
          response.url().includes(`/learning/lessons/${lessonId}/video`) &&
          response.status() >= 400
        )
          mediaErrors.push(`${response.status()} ${response.url()}`);
      });
      await page.route(
        `**/api/v1/learning/courses/${courseId}/player*`,
        (route) => route.fulfill({ json: player }),
      );
      await page.route(
        `**/api/v1/learning/lessons/${lessonId}/video*`,
        (route) => {
          const range = route.request().headers().range;
          const start = range
            ? Number(range.match(/bytes=(\d+)/)?.[1] ?? 0)
            : 0;
          const end = clip.length - 1;
          return route.fulfill({
            status: range ? 206 : 200,
            contentType: "video/webm",
            headers: {
              "Accept-Ranges": "bytes",
              "Content-Range": `bytes ${start}-${end}/${clip.length}`,
            },
            body: clip.subarray(start),
          });
        },
      );

      await page.goto(`/${locale}/student/learn/${courseId}`);
      const video = page.locator(
        `video[src*="/learning/lessons/${lessonId}/video"]`,
      );
      await expect(video).toBeVisible();
      await expect(page.locator("section[dir]").first()).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
      await expect
        .poll(() =>
          video.evaluate((element: HTMLVideoElement) => element.readyState),
        )
        .toBeGreaterThanOrEqual(2);
      await video.evaluate(async (element: HTMLVideoElement) => {
        element.muted = true;
        await element.play();
      });
      await expect
        .poll(() =>
          video.evaluate((element: HTMLVideoElement) => element.currentTime),
        )
        .toBeGreaterThan(0.1);
      await video.evaluate((element: HTMLVideoElement) => {
        element.pause();
        element.currentTime = 0.5;
      });
      await expect
        .poll(() =>
          video.evaluate((element: HTMLVideoElement) => element.currentTime),
        )
        .toBeGreaterThanOrEqual(0.45);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(viewport.width);
      expect(pageErrors).toEqual([]);
      expect(mediaErrors).toEqual([]);
    });
  }
}

test("video error offers a keyboard retry", async ({ page }) => {
  await mockStudentSession(page);
  await page.goto("/en");
  const clip = Buffer.from(await recordWebm(page));
  await page.route(`**/api/v1/learning/courses/${courseId}/player*`, (route) =>
    route.fulfill({ json: player }),
  );
  await page.route(`**/api/v1/learning/lessons/${lessonId}/video*`, (route) =>
    route.request().url().includes("retry=0")
      ? route.fulfill({ status: 404 })
      : route.fulfill({ contentType: "video/webm", body: clip }),
  );
  await page.goto(`/en/student/learn/${courseId}`);
  const retry = page.getByRole("button", { name: "Retry video" });
  await expect(retry).toBeVisible();
  await retry.focus();
  await page.keyboard.press("Enter");
  const video = page.locator("video[src*='retry=1']");
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.readyState),
    )
    .toBeGreaterThanOrEqual(2);
});

async function mockStudentSession(page: import("@playwright/test").Page) {
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/cart") return route.fulfill({ json: { items: [] } });
    if (path === "/api/v1/catalog/courses")
      return route.fulfill({ json: { items: [], totalCount: 0 } });
    if (path === "/api/v1/taxonomy")
      return route.fulfill({
        json: { tracks: [], grades: [], specializations: [], subjects: [] },
      });
    if (path === "/api/v1/student-tools/overview")
      return route.fulfill({ json: { notes: [], bookmarks: [] } });
    if (path.startsWith("/api/v1/gradebook/student/courses/"))
      return route.fulfill({
        json: {
          courseId,
          courseTitle: "Media course",
          lessonProgressPercent: 0,
          lessonsCompleted: 0,
          lessonsTotal: 1,
          assignmentsCompleted: 0,
          assignmentsTotal: 0,
          predictedGrade: {
            predictedGrade: "NotYetAchieved",
            passAchieved: 0,
            passRequired: 0,
            meritAchieved: 0,
            meritRequired: 0,
            distinctionAchieved: 0,
            distinctionRequired: 0,
          },
          units: [],
          criteria: [],
        },
      });
    return route.fulfill({ json: [] });
  });
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      json: { displayName: "Media Student", roles: ["Student"] },
    }),
  );
}

async function recordWebm(
  page: import("@playwright/test").Page,
): Promise<number[]> {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext("2d")!;
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp8",
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.start(100);
    const timer = window.setInterval(() => {
      context.fillStyle = `hsl(${Date.now() % 360} 70% 45%)`;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }, 50);
    await new Promise((resolve) => window.setTimeout(resolve, 1600));
    recorder.stop();
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    window.clearInterval(timer);
    stream.getTracks().forEach((track) => track.stop());
    return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
  });
}
