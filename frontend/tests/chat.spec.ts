import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("chat can create a card and the board updates without a reload", async ({
  page,
}) => {
  await login(page);

  const message = "Add a card called Ship v1 to the Backlog column.";
  await page.getByLabel(/chat message/i).fill(message);
  await page.getByRole("button", { name: /send/i }).click();

  await expect(
    page.getByTestId("chat-messages").getByText(message)
  ).toBeVisible();
  await expect(page.getByTestId("chat-message-assistant")).toBeVisible({
    timeout: 20_000,
  });

  const backlogColumn = page.getByTestId("column-col-backlog");
  await expect(backlogColumn.getByText("Ship v1")).toBeVisible();
});

test("chat shows a reply without changing the board for an off-topic question", async ({
  page,
}) => {
  await login(page);

  await page.getByLabel(/chat message/i).fill("What is the capital of France?");
  await page.getByRole("button", { name: /send/i }).click();

  await expect(page.getByTestId("chat-message-assistant")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("New chat clears the conversation", async ({ page }) => {
  await login(page);

  await page.getByLabel(/chat message/i).fill("Hello there");
  await page.getByRole("button", { name: /send/i }).click();
  await expect(page.getByTestId("chat-message-assistant")).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole("button", { name: /new chat/i }).click();

  await expect(
    page.getByTestId("chat-messages").getByText("Hello there")
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /new chat/i })
  ).not.toBeVisible();
});

test("Hide chat gives the board the full width back", async ({ page }) => {
  await login(page);

  await expect(page.getByTestId("chat-messages")).toBeVisible();

  await page.getByRole("button", { name: /hide chat/i }).click();
  await expect(page.getByTestId("chat-messages")).not.toBeVisible();

  await page.getByRole("button", { name: /show chat/i }).click();
  await expect(page.getByTestId("chat-messages")).toBeVisible();
});
