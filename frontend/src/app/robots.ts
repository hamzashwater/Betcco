import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/ar/admin/",
          "/en/admin/",
          "/ar/student/",
          "/en/student/",
          "/ar/teacher/",
          "/en/teacher/",
          "/ar/cart",
          "/en/cart",
          "/ar/checkout",
          "/en/checkout",
        ],
      },
    ],
    sitemap: "/sitemap.xml",
  };
}
