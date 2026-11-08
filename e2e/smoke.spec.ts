import { expect, test } from "@playwright/test";

test("a new owner creates an organisation and hits the Free plan limit", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your organisations" })).toBeVisible();

  const orgName = `Smoke Test ${Date.now()}`;
  await page.getByLabel("Name").fill(orgName);
  await page.getByRole("button", { name: "Create organisation" }).click();

  await expect(page).toHaveURL(/\/o\/smoke-test-/);
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await expect(page.getByTestId("usage-projects")).toHaveText("0 / 3");

  for (const [i, name] of ["Alpha", "Beta", "Gamma"].entries()) {
    await page.getByLabel("Project name").fill(name);
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByTestId("usage-projects")).toHaveText(`${i + 1} / 3`);
  }

  await expect(page.getByTestId("project-list").getByRole("listitem")).toHaveCount(3);
  await expect(page.getByLabel("Project name")).toBeDisabled();
  await expect(page.getByRole("link", { name: "Upgrade to Pro" })).toBeVisible();

  await page.getByRole("link", { name: "See plans" }).click();
  await expect(page.getByTestId("current-plan")).toHaveText("Free");
});

test("signed-out visitors are sent to sign in", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
  await context.close();
});
