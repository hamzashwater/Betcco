import { describe, expect, it } from "vitest";
import {
  isKnownWebKitUatAccessControlNoise,
  isSameOriginServerError,
} from "./e2e/uat-error-classification";

const project = "webkit-iphone-14";
const rscError =
  "/localhost:3000/en/cookies?_rsc=8d8B_2pnp2U8FYJi due to access control checks.";
const apiError =
  "/localhost:3000/api/v1/catalog/courses?locale=en&pageSize=12 due to access control checks.";
const isKnown = (
  projectName: string,
  message: string,
  baseUrl = "https://localhost:3000",
) => isKnownWebKitUatAccessControlNoise(projectName, message, baseUrl);

describe("WebKit UAT access-control classification", () => {
  it("recognizes only the observed localhost public RSC and API family on WebKit iPhone", () => {
    expect(isKnown(project, rscError)).toBe(true);
    expect(
      isKnown(
        project,
        "/localhost:3000/ar?_rsc=ISaK84uJVmx0al4B due to access control checks.",
      ),
    ).toBe(true);
    expect(isKnown(project, apiError)).toBe(true);
    expect(
      isKnown(
        project,
        "/localhost:3000/api/v1/taxonomy?locale=en due to access control checks.",
      ),
    ).toBe(true);
  });

  it("keeps the same error fatal in Chromium and Firefox", () => {
    expect(isKnown("chromium-desktop-1440", rscError)).toBe(false);
    expect(isKnown("firefox-tablet-834", rscError)).toBe(false);
  });

  it("does not classify external or production hosts", () => {
    expect(
      isKnown(
        project,
        "/example.com/en/cookies?_rsc=abc due to access control checks.",
      ),
    ).toBe(false);
    expect(
      isKnown(
        project,
        "https://betcco.com/en/cookies?_rsc=abc due to access control checks.",
      ),
    ).toBe(false);
    expect(isKnown(project, rscError, "https://betcco.com")).toBe(false);
  });

  it.each([
    "TypeError: Cannot read properties of undefined",
    "ReferenceError: missingValue is not defined",
    "Hydration failed because the server rendered HTML didn't match the client.",
    "Minified React error #418",
    "Application crashed while rendering the page",
    "/localhost:3000/en/cookies?_rsc=abc unrelated failure.",
    "/localhost:3000/api/v1/auth/login due to access control checks.",
  ])("keeps application and unrelated WebKit errors fatal: %s", (message) => {
    expect(isKnown(project, message)).toBe(false);
  });
});

describe("same-origin server responses", () => {
  const baseUrl = "https://localhost:3000";

  it("makes localhost HTTP 500 and 503 fatal", () => {
    expect(isSameOriginServerError(`${baseUrl}/en`, 500, baseUrl)).toBe(true);
    expect(
      isSameOriginServerError(`${baseUrl}/api/v1/taxonomy`, 503, baseUrl),
    ).toBe(true);
  });

  it("does not label a 4xx response or another origin as a same-origin 5xx", () => {
    expect(isSameOriginServerError(`${baseUrl}/en`, 404, baseUrl)).toBe(false);
    expect(
      isSameOriginServerError("https://example.com/api", 500, baseUrl),
    ).toBe(false);
  });
});
