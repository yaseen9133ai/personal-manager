import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("loads the kanban board", async ({ page }) => {
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Kanban Studio", exact: true })
  ).toBeVisible();
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

test("edits a card's title and details", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Card to edit");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Card to edit")).toBeVisible();

  // Once editing starts, the title moves from text content into an input's
  // value -- a hasText-filtered locator would stop matching (input values
  // aren't part of an element's text content), so resolve the stable
  // data-testid once up front and re-locate by that instead.
  const cardBeforeEditing = firstColumn
    .locator('[data-testid^="card-"]')
    .filter({ hasText: "Card to edit" });
  const cardTestId = await cardBeforeEditing.getAttribute("data-testid");
  await cardBeforeEditing.locator("button", { hasText: "Edit" }).click();

  const card = page.getByTestId(cardTestId!);
  await card.getByLabel("Card title").fill("Edited title");
  await card.getByLabel("Card details").fill("Edited details");
  await card.locator("button", { hasText: "Save" }).click();

  await expect(firstColumn.getByText("Edited title")).toBeVisible();
  await expect(firstColumn.getByText("Edited details")).toBeVisible();
});

test("cancels editing a card without saving changes", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Original title");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Original title")).toBeVisible();

  const cardBeforeEditing = firstColumn
    .locator('[data-testid^="card-"]')
    .filter({ hasText: "Original title" });
  const cardTestId = await cardBeforeEditing.getAttribute("data-testid");
  await cardBeforeEditing.locator("button", { hasText: "Edit" }).click();

  const card = page.getByTestId(cardTestId!);
  await card.getByLabel("Card title").fill("Should not be saved");
  await card.locator("button", { hasText: "Cancel" }).click();

  await expect(firstColumn.getByText("Original title")).toBeVisible();
  await expect(firstColumn.getByText("Should not be saved")).not.toBeVisible();
});

test("deletes a card", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Card to delete");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Card to delete")).toBeVisible();

  // dnd-kit's sortable attributes give the card's <article> role="button"
  // too, and its computed accessible name absorbs the nested buttons'
  // aria-labels -- target by visible button text instead of role/name.
  const card = firstColumn
    .locator('[data-testid^="card-"]')
    .filter({ hasText: "Card to delete" });
  await card.locator("button", { hasText: "Remove" }).click();
  await expect(firstColumn.getByText("Card to delete")).not.toBeVisible();
});
