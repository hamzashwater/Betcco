import { expect, test } from "@playwright/test";

test.skip(
  !process.env.BETCCO_E2E_API,
  "Requires the development BETCCO API and PostgreSQL.",
);

test("student completes the verified course purchase and starts learning", async ({
  page,
}) => {
  const email = `student-${Date.now()}@betcco.test`;
  const password = `Aa!${Date.now()}Student`;

  await page.goto("/en/register");
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill("Student");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Country").selectOption("JO");
  await page.getByLabel("Phone").fill("0790000000");
  await page.getByLabel("Gender").selectOption("PreferNotToSay");
  await page.getByLabel("Date of birth").fill("2000-01-01");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.locator('input[name="termsAccepted"]').check();
  const createAccount = page.getByRole("button", {
    name: "Create account",
  });
  await expect(createAccount).toBeEnabled();
  await createAccount.click();
  await expect(page.getByRole("status")).toContainText("Account created");

  const confirmationStatus = await page.evaluate(async (studentEmail) => {
    const response = await fetch("/api/v1/auth/test/confirm-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: studentEmail }),
    });
    return response.status;
  }, email);
  expect(confirmationStatus).toBe(200);

  await page.goto("/en/login");
  await page.getByLabel("Email").fill(email);
  await page.locator('input[name="password"]').fill(password);
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/auth/login") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await loginResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/en\/student\/dashboard$/);

  await page.goto("/en/courses/btec-programming-foundations");
  await expect(
    page.getByRole("heading", { name: "BTEC Programming Foundations" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("status")).toContainText("Course added to cart");

  await page.goto("/en/cart");
  await page.getByRole("link", { name: "Proceed to checkout" }).click();
  await page.getByRole("button", { name: "Create checkout session" }).click();
  await page.getByRole("button", { name: "Complete test payment" }).click();
  await expect(page).toHaveURL(/\/en\/student\/courses$/);
  await expect(
    page.getByRole("heading", { name: "BTEC Programming Foundations" }),
  ).toBeVisible();

  await page
    .getByRole("link", {
      name: "Start learning: BTEC Programming Foundations",
    })
    .click();
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(
    page.getByRole("button", { name: "Mark complete" }),
  ).toBeVisible();
});
