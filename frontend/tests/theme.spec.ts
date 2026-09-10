import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Deterministic starting point: with no stored preference, the app falls
// back to the OS/browser color-scheme preference, which we don't want this
// spec's assertions to depend on.
test.use({ colorScheme: "light" });

test("toggles between light and dark theme and persists the choice across a reload", async ({
  page,
}) => {
  await login(page);

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: /switch to dark theme/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: /switch to light theme/i })
  ).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: /switch to light theme/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("the theme toggle is available on the login screen too", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /switch to dark theme/i })
  ).toBeVisible();
});
