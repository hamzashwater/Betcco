import { Providers } from "@/components/providers";
import {
  getDefaultBrand,
  publicBrandSettingsQueryKey,
  resolveBrandSettings,
  type BrandSettings,
} from "@/lib/brand";
import {
  getPublicBrandSettings,
  PUBLIC_BRAND_SETTINGS_TIMEOUT_MS,
} from "@/lib/public-brand-settings.server";
import { QueryClient, dehydrate, useQuery } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const englishSecondary =
  "From learning to assignments and assessment criteria — everything a BTEC student needs in one place.";
const arabicSecondary =
  "من الدرس إلى المهمة، ومن المهمة إلى تحقيق المعايير — كل ما يحتاجه طالب BTEC في مكان واحد.";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("locale-aware brand settings", () => {
  test("uses English semantics for English fallbacks and Arabic semantics for Arabic fallbacks", () => {
    expect(getDefaultBrand("en").BrandSecondaryMessage).toBe(englishSecondary);
    expect(getDefaultBrand("ar").BrandSecondaryMessage).toBe(arabicSecondary);
    expect(getDefaultBrand("en-US").BtecDisclaimer).toMatch(
      /^BETCCO is an independent educational platform/,
    );
    expect(getDefaultBrand("ar-JO").BtecDisclaimer).toMatch(
      /^BETCCO منصة تعليمية مستقلة/,
    );
  });

  test("merges fetched settings over the fallback for the same locale", () => {
    const brand = resolveBrandSettings("en", {
      BrandSecondaryMessage: "Configured English message",
    });

    expect(brand.BrandSecondaryMessage).toBe("Configured English message");
    expect(brand.BrandTagline).toBe("BETCCO — Learn. Apply. Achieve.");
  });

  test("loads and normalizes the requested locale from the public settings API", async () => {
    vi.stubEnv("BETCCO_API_URL", "http://api.betcco.test/");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          BrandSecondaryMessage: "Configured English message",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const brand = await getPublicBrandSettings("en-US");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.betcco.test/api/v1/settings/public?locale=en",
      {
        cache: "no-store",
        signal: expect.any(AbortSignal) as AbortSignal,
      },
    );
    expect(brand.BrandSecondaryMessage).toBe("Configured English message");
    expect(brand.BtecDisclaimer).toMatch(
      /^BETCCO is an independent educational platform/,
    );
  });

  test("uses the localized fallback for a non-success response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 503 })),
    );

    const brand = await getPublicBrandSettings("ar-JO");

    expect(brand.BrandSecondaryMessage).toBe(arabicSecondary);
    expect(brand.BrandTagline).toBe("BETCCO — تعلّم. طبّق. حقق المعايير.");
  });

  test("uses the localized fallback when the response contains malformed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("{", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(getPublicBrandSettings("en")).resolves.toMatchObject({
      BrandSecondaryMessage: englishSecondary,
      BrandTagline: "BETCCO — Learn. Apply. Achieve.",
    });
  });

  test("merges valid partial settings without accepting invalid or cross-locale fallback values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            BrandSecondaryMessage: "Configured English message",
            BrandTagline: null,
            BtecDisclaimer: 42,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const brand = await getPublicBrandSettings("en-US");

    expect(brand.BrandSecondaryMessage).toBe("Configured English message");
    expect(brand.BrandTagline).toBe("BETCCO — Learn. Apply. Achieve.");
    expect(brand.BtecDisclaimer).toMatch(
      /^BETCCO is an independent educational platform/,
    );
    expect(brand.BtecDisclaimer).not.toMatch(/^BETCCO منصة تعليمية مستقلة/);
  });

  test("aborts a stalled request and returns the localized fallback", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation((_input, init) => {
        requestSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener(
            "abort",
            () => reject(requestSignal?.reason),
            { once: true },
          );
        });
      });
    vi.stubGlobal("fetch", fetchMock);

    const brandPromise = getPublicBrandSettings("ar");
    await vi.advanceTimersByTimeAsync(PUBLIC_BRAND_SETTINGS_TIMEOUT_MS);

    await expect(brandPromise).resolves.toMatchObject({
      BrandSecondaryMessage: arabicSecondary,
      BrandTagline: "BETCCO — تعلّم. طبّق. حقق المعايير.",
    });
    expect(requestSignal?.aborted).toBe(true);
  });

  test.each([
    ["en", englishSecondary],
    ["ar", arabicSecondary],
  ])(
    "hydrates the %s query with the same locale data used for SSR",
    (locale, expectedSecondary) => {
      const queryClient = new QueryClient();
      queryClient.setQueryData(
        publicBrandSettingsQueryKey(locale),
        getDefaultBrand(locale),
      );
      const queryFn = vi.fn<() => Promise<BrandSettings>>();

      render(
        <Providers dehydratedState={dehydrate(queryClient)}>
          <BrandProbe locale={locale} queryFn={queryFn} />
        </Providers>,
      );

      expect(screen.getByText(expectedSecondary)).toBeInTheDocument();
      expect(queryFn).not.toHaveBeenCalled();
    },
  );
});

function BrandProbe({
  locale,
  queryFn,
}: {
  locale: string;
  queryFn: () => Promise<BrandSettings>;
}) {
  const settings = useQuery({
    queryKey: publicBrandSettingsQueryKey(locale),
    queryFn,
    staleTime: 30_000,
  });
  const brand = resolveBrandSettings(locale, settings.data);
  return <p>{brand.BrandSecondaryMessage}</p>;
}
