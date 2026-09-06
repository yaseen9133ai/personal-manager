import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("loads the kanban board", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await login(page);
  const backlogColumn = page.getByTestId("column-col-backlog");
  const reviewColumn = page.getByTestId("column-col-review");

  await backlogColumn.getByRole("button", { name: /add a card/i }).click();
  await backlogColumn.getByPlaceholder("Card title").fill("Card to move");
  await backlogColumn.getByRole("button", { name: /add card/i }).click();
  await expect(backlogColumn.getByText("Card to move")).toBeVisible();

  const card = backlogColumn.getByText("Card to move");
  const cardBox = await card.boundingBox();
  const columnBox = await reviewColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(reviewColumn.getByText("Card to move")).toBeVisible();
});

test("deletes a card", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Card to delete");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Card to delete")).toBeVisible();

  // dnd-kit's sortable attributes give the card's <article> role="button"
  // too, and its computed accessible name absorbs the nested delete
  // button's aria-label -- matching by role/name is ambiguous, so target
  // the actual <button> element directly instead.
  const card = firstColumn
    .locator('[data-testid^="card-"]')
    .filter({ hasText: "Card to delete" });
  await card.locator("button").click();
  await expect(firstColumn.getByText("Card to delete")).not.toBeVisible();
});
