import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

type MetadataCopy = {
  title: string;
  description: string;
  organizationDescription: string;
};
// The default publication identity is independently interpolated/mutated in
// metadata-localization.test.tsx; these HTTP assertions exercise the real build.
const brandName = "BETCCO";

for (const locale of ["ar", "en"] as const) {
  test(`${locale} publishes localized metadata, JSON-LD and a static PNG`, async ({
    page,
  }, testInfo) => {
    const response = await page.goto(`/${locale}`, { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    const origin = new URL(page.url()).origin;
    const messages = JSON.parse(
      await readFile(
        new URL(`../../messages/${locale}.json`, import.meta.url),
        "utf8",
      ),
    ) as { siteMetadata: MetadataCopy };
    const copy = messages.siteMetadata;
    const title = copy.title.replace("{brand}", brandName);
    const description = copy.description.replace("{brand}", brandName);
    await expect(page).toHaveTitle(title);
    for (const [selector, content] of [
      ['meta[name="description"]', description],
      ['meta[property="og:title"]', title],
      ['meta[property="og:description"]', description],
      ['meta[property="og:locale"]', locale === "ar" ? "ar_JO" : "en_US"],
      ['meta[property="og:type"]', "website"],
      ['meta[property="og:image"]', `${origin}/${locale}/opengraph-image`],
      ['meta[property="og:image:width"]', "1200"],
      ['meta[property="og:image:height"]', "630"],
      ['meta[name="twitter:card"]', "summary_large_image"],
      ['meta[name="twitter:title"]', title],
      ['meta[name="twitter:description"]', description],
      ['meta[name="robots"]', "index, follow"],
    ])
      await expect(page.locator(selector)).toHaveAttribute("content", content);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${origin}/${locale}`,
    );
    for (const language of ["ar", "en"])
      await expect(
        page.locator(`link[rel="alternate"][hreflang="${language}"]`),
      ).toHaveAttribute("href", `${origin}/${language}`);
    const serialized = await page
      .locator('script[type="application/ld+json"]')
      .textContent();
    expect(serialized).not.toContain("<");
    const structuredData: unknown = JSON.parse(serialized!);
    expect(structuredData).toEqual({
      "@context": "https://schema.org",
      "@type": "EducationalOrganization",
      name: brandName,
      url: `${origin}/${locale}`,
      description: copy.organizationDescription,
    });
    const image = await page.request.get(`/${locale}/opengraph-image`);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/png");
    const png = await image.body();
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    await writeFile(testInfo.outputPath(`${locale}-opengraph.png`), png);
    await testInfo.attach(`${locale} actual route PNG`, {
      body: png,
      contentType: "image/png",
    });
    await testInfo.attach(`${locale} published head evidence`, {
      body: JSON.stringify(
        {
          locale,
          url: page.url(),
          title,
          description,
          structuredData,
          imageHeaders: image.headers(),
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
  });
}

test("unsupported image locale is rejected and the legacy English URL remains valid", async ({
  request,
}) => {
  expect((await request.get("/fr/opengraph-image")).status()).toBe(404);
  const legacy = await request.get("/opengraph-image");
  const english = await request.get("/en/opengraph-image");
  expect(legacy.status()).toBe(200);
  expect(await legacy.body()).toEqual(await english.body());
});
