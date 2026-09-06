import type { Page } from "@playwright/test";

export async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  // exact: true -- the chat sidebar's "Ask Kanban Studio" heading otherwise
  // also matches this substring-based role query.
  await page
    .getByRole("heading", { name: "Kanban Studio", exact: true })
    .waitFor();
}
