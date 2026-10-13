import { expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export async function capturePracticeEvidence(page: Page, label: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const directory = process.env.BETCCO_PRACTICE_EVIDENCE_DIR;
  if (directory) {
    mkdirSync(directory, { recursive: true });
    await page.screenshot({
      path: join(directory, `${label}.png`),
      fullPage: true,
    });
  }
}
