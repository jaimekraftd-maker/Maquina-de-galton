import { expect, test, type Page } from "@playwright/test";

const MIRA = "00000000-0000-4000-8000-000000000003";

async function startChatWith(page: Page, characterId: string) {
  await page.goto(`/characters/${characterId}`);
  await page.getByRole("button", { name: /start chat|new chat/i }).first().click();
  await page.waitForURL(/\/chat\/[0-9a-f-]{36}$/);
}

const composer = (page: Page) => page.getByRole("textbox", { name: /^Message / });
const messages = (page: Page) => page.getByRole("list", { name: "Messages" });

test("discover and search use real character data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Trending" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Featured characters" })).toBeVisible();

  await page.goto("/search?q=barista");
  await expect(page.getByText("1 character for “barista”")).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: /Mira Hoshizora/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mira Hoshizora" })).toBeVisible();

  await page.goto("/search?q=zzzz-no-match");
  await expect(page.getByText("No characters match “zzzz-no-match”")).toBeVisible();

  await page.goto("/?category=mystery");
  await expect(page.getByRole("heading", { level: 1, name: "Mystery" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /Lucien Ashgrave/ })).toBeVisible();
});

test("chat streams replies, persists, regenerates and edits", async ({ page }) => {
  await startChatWith(page, MIRA);
  await expect(page.getByText(/Welcome to Café Comet/)).toBeVisible();

  await composer(page).fill("Hello there");
  await composer(page).press("Enter");
  const reply = page.getByText(/\[fake reply \d+\] Mira Hoshizora hears you say "Hello there"/);
  await expect(reply).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible(); // stream finished

  // Persisted across reloads
  await page.reload();
  await expect(messages(page).getByText("Hello there", { exact: true })).toBeVisible();
  await expect(reply).toBeVisible();

  // Regenerate replaces the last reply with a new one
  const before = await reply.textContent();
  await reply.hover();
  await page.getByRole("button", { name: "Regenerate response" }).click();
  await expect(page.getByText(before!)).toHaveCount(0);
  await expect(page.getByText(/\[fake reply \d+\] Mira Hoshizora hears you say "Hello there"/)).toBeVisible();

  // Edit & resend the last user message
  await messages(page).getByText("Hello there", { exact: true }).hover();
  await page.getByRole("button", { name: "Edit and resend" }).click();
  await page.getByRole("textbox", { name: "Edit message" }).fill("Actually, one Nebula Latte please");
  await page.getByRole("button", { name: "Save & resend" }).click();
  await expect(page.getByText(/hears you say "Actually, one Nebula Latte please"/)).toBeVisible();
  await expect(page.getByText(/hears you say "Hello there"/)).toHaveCount(0);

  // Conversation title and sidebar update
  await page.reload();
  await expect(page.getByText(/hears you say "Actually, one Nebula Latte please"/)).toBeVisible();
});

test("stop generation keeps the partial reply", async ({ page }) => {
  await startChatWith(page, MIRA);
  await composer(page).fill("tell me something slow");
  await composer(page).press("Enter");
  await expect(page.getByText(/\[fake reply \d+\]/)).toBeVisible();
  await page.getByRole("button", { name: "Stop generating" }).click();
  await expect(page.getByText("Response was interrupted.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Response was interrupted.")).toBeVisible();
});

test("create, chat with, duplicate and delete a character", async ({ page }) => {
  await page.goto("/create");
  await page.getByRole("button", { name: "Save character" }).click();
  await expect(page.getByText("Name is required")).toBeVisible();
  await expect(page.getByText("Pick at least one category")).toBeVisible();

  await page.getByLabel("Character name").fill("Professor Quill");
  await page.getByLabel("Short description").fill("A fussy owl who teaches astronomy.");
  await page.getByRole("button", { name: "Sci-fi" }).click();
  await page.getByLabel("Tags").fill("owl,stars,");
  await page.getByLabel("Full description").fill("An ancient owl professor at the Celestial Academy.");
  await page.getByRole("textbox", { name: "Personality", exact: true }).fill("Pedantic but kind; loves a good question.");
  await page.getByLabel("Greeting message").fill("*Adjusts spectacles.* Ah, a new student!");
  await page.getByRole("button", { name: "Built-in art" }).click();
  await page.getByRole("button", { name: "Use built-in portrait sable" }).click();
  await expect(page.getByRole("complementary", { name: "Live preview" }).getByText("Professor Quill")).toBeAttached();
  await page.getByRole("button", { name: "Save character" }).click();

  await page.waitForURL(/\/characters\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Professor Quill" })).toBeVisible();
  const characterUrl = page.url();

  // Searchable immediately
  await page.goto("/search?q=owl");
  await expect(page.getByRole("main").getByRole("link", { name: /Professor Quill/ })).toBeVisible();

  // Chat uses the new definition
  await page.goto(characterUrl);
  await page.getByRole("button", { name: "Start chat" }).click();
  await page.waitForURL(/\/chat\//);
  await expect(page.getByText("Ah, a new student!")).toBeVisible();
  await composer(page).fill("Why do stars twinkle?");
  await composer(page).press("Enter");
  await expect(page.getByText(/Professor Quill hears you say "Why do stars twinkle\?"/)).toBeVisible();

  // Delete the conversation from the chat menu
  await page.getByRole("button", { name: "Conversation options" }).click();
  await page.getByRole("menuitem", { name: "Delete conversation" }).click();
  await page.getByRole("button", { name: "Delete conversation" }).click();
  await page.waitForURL(/\/library$/);

  // Duplicate, then delete both
  await page.goto(characterUrl);
  await page.getByRole("button", { name: "More character actions" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await page.waitForURL(/\/edit$/);
  await expect(page.getByLabel("Character name")).toHaveValue("Professor Quill (copy)");

  await page.goto("/library?tab=created");
  await expect(page.getByRole("main").getByRole("link", { name: /Professor Quill \(copy\)/ })).toBeVisible();

  for (const name of ["Professor Quill (copy)", "Professor Quill"]) {
    await page.goto("/library?tab=created");
    await page.getByRole("main").getByRole("link", { name: new RegExp(`^${name.replace(/[()]/g, "\\$&")}`) }).first().click();
    await page.getByRole("button", { name: "More character actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete character" }).click();
    await page.waitForURL(/\/library\?tab=created$/);
  }
  await expect(page.getByText("You haven't created any characters")).toBeVisible();
});

test("favorites and pinned conversations appear in the library", async ({ page }) => {
  await page.goto(`/characters/${MIRA}`);
  await page.getByRole("button", { name: "Add to favorites" }).click();
  await expect(page.getByRole("button", { name: "Remove from favorites" })).toBeVisible();
  await page.goto("/library?tab=favorites");
  await expect(page.getByRole("main").getByRole("link", { name: /Mira Hoshizora/ })).toBeVisible();

  await page.goto("/library");
  const first = page.getByRole("main").getByRole("listitem").filter({ hasText: "Mira Hoshizora" }).first();
  await first.getByRole("button", { name: /Options for/ }).click();
  await page.getByRole("menuitem", { name: "Pin to top" }).click();
  await expect(page.getByRole("heading", { name: "Pinned" })).toBeVisible();
});

test("mobile layout has no horizontal overflow", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  for (const path of ["/", "/search?q=a", `/characters/${MIRA}`, "/create", "/library"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
  }
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Discover" })).toBeVisible();
  await context.close();
});

test("installable on phones: manifest, icons and mobile meta", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/", short_name: "Nocturne" });
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  }
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/apple-touch-icon.png");
  expect((await request.get("/icons/apple-touch-icon.png")).status()).toBe(200);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover.*interactive-widget=resizes-content/);
});
