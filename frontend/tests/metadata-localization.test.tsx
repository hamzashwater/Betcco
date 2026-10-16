import { Children, isValidElement, type ReactNode } from "react";
import { createTranslator } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { defaultBrand } from "@/lib/brand";

const state = vi.hoisted(() => ({ locale: "en" as "ar" | "en" }));
const image = vi.hoisted(() => vi.fn());
vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(element: unknown, options: unknown) {
      image(element, options);
    }
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: (locale: "ar" | "en") => {
    state.locale = locale;
  },
  getMessages: async () => (state.locale === "ar" ? ar : en),
  getTranslations: async (
    input:
      | "navigation.accessibility"
      | {
          locale: "ar" | "en";
          namespace: "siteMetadata" | "siteMetadata.socialImage";
        },
  ) => {
    const locale = typeof input === "string" ? state.locale : input.locale;
    const namespace = typeof input === "string" ? input : input.namespace;
    return createTranslator({
      locale,
      messages: locale === "ar" ? ar : en,
      namespace,
    });
  },
}));
vi.mock("@/lib/public-brand-settings.server", () => ({
  getPublicBrandSettings: async () => ({}),
}));

import LocaleLayout, { generateMetadata } from "@/app/[locale]/layout";
import {
  GET,
  generateStaticParams,
} from "@/app/[locale]/opengraph-image/route";
import { GET as legacyGET } from "@/app/opengraph-image/route";

type NodeProps = {
  children?: ReactNode;
  type?: string;
  dangerouslySetInnerHTML?: { __html: string };
  style?: Record<string, unknown>;
  lang?: string;
  dir?: string;
};
function elements(node: ReactNode): React.ReactElement<NodeProps>[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<NodeProps>(child)
      ? [child, ...elements(child.props.children)]
      : [],
  );
}
function text(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      isValidElement<NodeProps>(child)
        ? text(child.props.children)
        : String(child),
    )
    .join(" ");
}
const originalBrand = defaultBrand.BrandName;
afterEach(() => {
  defaultBrand.BrandName = originalBrand;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  image.mockClear();
});

describe("bounded server metadata and parsed JSON-LD", () => {
  it.each(["ar", "en"] as const)(
    "preserves %s metadata contracts and dynamic brand interpolation",
    async (locale) => {
      defaultBrand.BrandName = "Dynamic <Brand>";
      vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.test/");
      const copy = createTranslator({
        locale,
        messages: locale === "ar" ? ar : en,
        namespace: "siteMetadata",
      });
      const result = await generateMetadata({
        children: null,
        params: Promise.resolve({ locale }),
      });
      const title = copy("title", { brand: defaultBrand.BrandName });
      const description = copy("description", {
        brand: defaultBrand.BrandName,
      });
      expect(result.title).toBe(title);
      expect(result.description).toBe(description);
      expect(String(result.metadataBase)).toBe("https://example.test/");
      expect(result.openGraph).toEqual({
        title,
        description,
        type: "website",
        locale: locale === "ar" ? "ar_JO" : "en_US",
        images: [
          { url: `/${locale}/opengraph-image`, width: 1200, height: 630 },
        ],
      });
      expect(result.twitter).toEqual({
        card: "summary_large_image",
        title,
        description,
      });
      expect(result.robots).toEqual({ index: true, follow: true });
      expect(result.alternates).toEqual({
        canonical: `/${locale}`,
        languages: { ar: "/ar", en: "/en" },
      });
      expect(title).toContain("Dynamic <Brand>");
      expect(description).toContain("Dynamic <Brand>");
    },
  );
  it.each(["ar", "en"] as const)(
    "parses independent %s structured data and preserves escaping",
    async (locale) => {
      defaultBrand.BrandName = "Dynamic <script>brand";
      vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.test/");
      const tree = await LocaleLayout({
        children: null,
        params: Promise.resolve({ locale }),
      });
      const script = elements(tree).find(
        (node) =>
          node.type === "script" && node.props.type === "application/ld+json",
      );
      const serialized = script?.props.dangerouslySetInnerHTML?.__html;
      expect(serialized).toBeDefined();
      expect(serialized).not.toContain("<");
      expect(serialized).toContain("\\u003cscript>");
      expect(JSON.parse(serialized!)).toEqual({
        "@context": "https://schema.org",
        "@type": "EducationalOrganization",
        name: "Dynamic <script>brand",
        url: `https://example.test/${locale}`,
        description: (locale === "ar" ? ar : en).siteMetadata
          .organizationDescription,
      });
    },
  );
  it("preserves APP_PUBLIC_URL fallback and omission of an unavailable public URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined);
    vi.stubEnv("APP_PUBLIC_URL", "https://fallback.test/");
    const value = async () => {
      const tree = await LocaleLayout({
        children: null,
        params: Promise.resolve({ locale: "en" }),
      });
      return JSON.parse(
        elements(tree).find(
          (node) => node.props.type === "application/ld+json",
        )!.props.dangerouslySetInnerHTML!.__html,
      ) as Record<string, string>;
    };
    expect((await value()).url).toBe("https://fallback.test/en");
    vi.stubEnv("APP_PUBLIC_URL", undefined);
    expect(await value()).not.toHaveProperty("url");
  });
  it("rejects an unsupported metadata locale", async () => {
    await expect(
      generateMetadata({
        children: null,
        params: Promise.resolve({ locale: "fr" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("locale image routing and actual ImageResponse input", () => {
  it("statically bounds both locales", () => {
    expect(generateStaticParams()).toEqual([
      { locale: "ar" },
      { locale: "en" },
    ]);
  });
  it.each(["ar", "en"] as const)(
    "renders the correct %s image tree and dimensions",
    async (locale) => {
      const fetchFonts = vi.fn(async () => new Response(new ArrayBuffer(8)));
      vi.stubGlobal("fetch", fetchFonts);
      await GET(new Request(`https://example.test/${locale}/opengraph-image`), {
        params: Promise.resolve({ locale }),
      });
      const [tree, options] = image.mock.calls[0] as [
        React.ReactElement<NodeProps>,
        {
          width: number;
          height: number;
          fonts?: { name: string; weight: number }[];
        },
      ];
      expect(options).toMatchObject({ width: 1200, height: 630 });
      expect(tree.props.lang).toBe(locale);
      expect(tree.props.dir).toBe(locale === "ar" ? "rtl" : "ltr");
      const blocks = Children.toArray(tree.props.children).filter(
        isValidElement<NodeProps>,
      );
      const rendered = blocks
        .slice(1)
        .map((node) => text(node).replace(/\s+([.،؛:!?؟])/gu, "$1"));
      expect(rendered).toEqual(
        Object.values((locale === "ar" ? ar : en).siteMetadata.socialImage),
      );
      expect(text(blocks[0])).toBe(defaultBrand.BrandName);
      if (locale === "ar") {
        expect(text(tree)).not.toContain(en.siteMetadata.socialImage.headline);
        expect(text(tree)).not.toContain(
          en.siteMetadata.socialImage.description,
        );
        expect(blocks[1].props.style?.flexDirection).toBe("row-reverse");
        expect(options.fonts?.map((font) => [font.name, font.weight])).toEqual([
          ["Tajawal", 400],
          ["Tajawal", 900],
        ]);
        expect(fetchFonts).toHaveBeenCalledTimes(2);
      } else {
        expect(options.fonts).toBeUndefined();
        expect(fetchFonts).not.toHaveBeenCalled();
      }
    },
  );
  it("rejects unknown locales before translations or font requests", async () => {
    const fetchFonts = vi.fn();
    vi.stubGlobal("fetch", fetchFonts);
    await expect(
      GET(new Request("https://example.test/fr/opengraph-image"), {
        params: Promise.resolve({ locale: "fr" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(image).not.toHaveBeenCalled();
    expect(fetchFonts).not.toHaveBeenCalled();
  });
  it("preserves the legacy English image URL", async () => {
    await legacyGET(new Request("https://example.test/opengraph-image"));
    expect(text(image.mock.calls[0][0] as ReactNode)).toContain(
      en.siteMetadata.socialImage.headline,
    );
  });
});
