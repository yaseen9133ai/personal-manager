import type { Page } from "@playwright/test";

export async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.getByRole("heading", { name: "Kanban Studio" }).waitFor();
}
