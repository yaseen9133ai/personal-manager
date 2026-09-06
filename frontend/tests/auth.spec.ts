import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("shows the login form when logged out", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel(/username/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
});

test("shows an error on invalid credentials", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("wrong-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByTestId("login-error")).toContainText(/invalid/i);
});

test("logs in, sees the board, logs out, and sees the login form again", async ({
  page,
}) => {
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Kanban Studio", exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: /log out/i }).click();

  await expect(page.getByLabel(/username/i)).toBeVisible();
});
