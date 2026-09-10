import { expect, test, type Page } from "@playwright/test";

test.skip(
  !process.env.BETCCO_E2E_API,
  "Requires the development BETCCO API and PostgreSQL.",
);

test("student can log out and log back in without refreshing", async ({
  page,
}) => {
  const identifier = Date.now();
  const password = `Aa!${identifier}Student`;
  const student = {
    email: `switch-first-${identifier}@betcco.test`,
    name: "First Student",
  };

  await registerAndConfirm(page, student.email, student.name, password);

  await signIn(page, student.email, password);
  await expect(page).toHaveURL(/\/en\/student\/dashboard$/);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/en\/login$/);

  await signIn(page, student.email, password);
  await expect(page).toHaveURL(/\/en\/student\/dashboard$/);
  await expect(page.getByRole("link", { name: student.name })).toBeVisible();
});

async function registerAndConfirm(
  page: Page,
  email: string,
  name: string,
  password: string,
) {
  await page.goto("/en/register");
  const [firstName, ...lastNameParts] = name.split(" ");
  await page.getByLabel("First name").fill(firstName);
  await page.getByLabel("Last name").fill(lastNameParts.join(" ") || "Student");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Country").selectOption("JO");
  await page.getByLabel("Phone").fill("0790000000");
  await page.getByLabel("Gender").selectOption("PreferNotToSay");
  await page.getByLabel("Date of birth").fill("2000-01-01");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.locator('input[name="termsAccepted"]').check();
  const createAccount = page.getByRole("button", { name: "Create account" });
  await expect(createAccount).toBeEnabled();
  await createAccount.click();
  await expect(page.getByRole("status")).toContainText("Account created");

  const status = await page.evaluate(async (studentEmail) => {
    const response = await fetch("/api/v1/auth/test/confirm-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: studentEmail }),
    });
    return response.status;
  }, email);
  expect(status).toBe(200);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(email);
  await page.locator('input[name="password"]').fill(password);
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().includes("/api/v1/auth/login") &&
      candidate.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await response).status()).toBe(200);
}
