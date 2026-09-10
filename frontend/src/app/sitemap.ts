import type { MetadataRoute } from "next";

const publicPaths = [
  "",
  "/courses",
  "/tracks",
  "/teachers",
  "/packages",
  "/live",
  "/blog",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_PUBLIC_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
  return ["ar", "en"].flatMap((locale) =>
    publicPaths.map((path) => ({
      url: `${base}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: path === "" ? "weekly" : "monthly",
      priority: path === "" ? 1 : 0.7,
    })),
  );
}
