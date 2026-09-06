import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("board changes persist across a page reload", async ({ page }) => {
  await login(page);

  const backlogColumn = page.getByTestId("column-col-backlog");
  const reviewColumn = page.getByTestId("column-col-review");

  await backlogColumn.getByRole("button", { name: /add a card/i }).click();
  await backlogColumn.getByPlaceholder("Card title").fill("Persisted card");
  await backlogColumn.getByPlaceholder("Details").fill("Should survive a reload");
  await backlogColumn.getByRole("button", { name: /add card/i }).click();
  await expect(backlogColumn.getByText("Persisted card")).toBeVisible();

  const card = backlogColumn.getByText("Persisted card");
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
  await expect(reviewColumn.getByText("Persisted card")).toBeVisible();

  const backlogTitleInput = backlogColumn.getByLabel("Column title");
  await backlogTitleInput.fill("Ideas");
  await backlogTitleInput.blur();

  await page.reload();

  await expect(
    page.getByTestId("column-col-backlog").getByLabel("Column title")
  ).toHaveValue("Ideas");
  await expect(
    page.getByTestId("column-col-review").getByText("Persisted card")
  ).toBeVisible();
});
