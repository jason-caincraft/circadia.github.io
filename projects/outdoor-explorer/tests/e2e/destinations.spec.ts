import { test, expect } from "./fixtures.js";

const guidedTours = "B33DC9B6-0B7D-4322-BAD7-A13A34C584A3";

test("renders the regional catalog with deduplicated multi-state parks", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Find your next place to explore.",
  );
  await expect(
    page.getByRole("status").filter({ hasText: "3 destinations found" }),
  ).toBeVisible();
  const results = page.getByRole("region", {
    name: "Destinations",
    exact: true,
  });
  await expect(results.getByRole("article")).toHaveCount(3);
  await expect(
    results.getByRole("link", {
      name: "Yellowstone National Park",
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(results.getByText("ID, MT, WY", { exact: true })).toBeVisible();
  await expect(
    page
      .getByLabel("Activity")
      .getByRole("option", { name: "Guided Tours", exact: true }),
  ).toHaveCount(1);
  await expect(
    results.getByText("Photo unavailable", { exact: true }),
  ).toHaveCount(3);
});

test("combines state, keyword and activity filters and preserves them on reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Idaho", { exact: true }).uncheck();
  await page.getByLabel("Washington", { exact: true }).uncheck();
  await page.getByLabel("Place or keyword").fill("lake");
  await expect(
    page.getByLabel("Activity").getByRole("option", { name: "Guided Tours" }),
  ).toBeAttached();
  await page.getByLabel("Activity").selectOption(guidedTours);
  await page
    .getByRole("button", { name: "Search destinations", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Destinations", exact: true })
      .getByRole("article"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "Crater Lake National Park", exact: true }),
  ).toBeVisible();
  const params = new URL(page.url()).searchParams;
  expect(params.get("states")).toBe("OR");
  expect(params.get("q")).toBe("lake");
  expect(params.get("activityId")).toBe(guidedTours);
  await page.reload();
  await expect(page.getByLabel("Oregon", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Idaho", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Place or keyword")).toHaveValue("lake");
  await expect(page.getByLabel("Activity")).toHaveValue(guidedTours);
  await expect(
    page.getByRole("link", { name: "Crater Lake National Park", exact: true }),
  ).toBeVisible();
});

test("state filters include only matching destinations and retain activity options", async ({
  page,
}) => {
  await page.goto("/?states=WA");
  await expect(
    page.getByRole("link", { name: "Olympic National Park", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Destinations", exact: true })
      .getByRole("article"),
  ).toHaveCount(1);
  await expect(
    page.getByLabel("Activity").getByRole("option", { name: "Guided Tours" }),
  ).toBeAttached();
});

test("opens details, official sources, and restores search through browser history", async ({
  page,
}) => {
  await page.goto("/?states=OR&q=lake");
  await page
    .getByRole("link", { name: "Crater Lake National Park", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Crater Lake National Park",
  );
  await expect(page.getByRole("main")).toBeFocused();
  expect(new URL(page.url()).searchParams.get("park")).toBe("crla");
  await expect(
    page.getByRole("heading", { name: "Operating information", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Seasonal access", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Visit the official NPS destination page/ }),
  ).toHaveAttribute("href", "https://www.nps.gov/crla/index.htm");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Crater Lake National Park",
  );
  await page.goBack();
  await expect(page.getByLabel("Place or keyword")).toHaveValue("lake");
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Crater Lake National Park",
  );
  await page.getByRole("link", { name: /Back to destinations/ }).click();
  await expect(page.getByLabel("Place or keyword")).toHaveValue("lake");
  await expect(page.getByLabel("Oregon", { exact: true })).toBeChecked();
});

test("empty results and an absent destination have distinct messages", async ({
  page,
}) => {
  await page.goto("/?states=OR&q=no-such-fixture");
  await expect(
    page.getByText(/No destinations match these filters/),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.goto("/?park=acad");
  await expect(page.getByRole("alert")).toContainText(
    "This destination was not found in the regional catalog.",
  );
});

test("invalid shared filters can be reset and empty state selection prevents submission", async ({
  page,
}) => {
  await page.goto("/?states=CA");
  await expect(page.getByRole("alert")).toContainText(
    "This link contains invalid filters.",
  );
  await page.getByRole("link", { name: "Reset filters", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Destinations", exact: true })
      .getByRole("article"),
  ).toHaveCount(3);
  for (const name of ["Idaho", "Oregon", "Washington"])
    await page.getByLabel(name, { exact: true }).uncheck();
  await expect(
    page.getByRole("button", { name: "Search destinations", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Choose at least one state.", { exact: true }),
  ).toBeVisible();
});

test("loading is visible until real API responses arrive", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("http://127.0.0.1:5088/api/parks**", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/");
    await expect(
      page.getByRole("status").filter({ hasText: "Loading destinations" }),
    ).toBeVisible();
  } finally {
    release();
  }
  await expect(
    page
      .getByRole("region", { name: "Destinations", exact: true })
      .getByRole("article"),
  ).toHaveCount(3);
});

test("a failed request shows an error and retry recovers through the API", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:5088/api/parks**", (route) =>
    route.abort("failed"),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "Park data is temporarily unavailable.",
  );
  await page.unroute("http://127.0.0.1:5088/api/parks**");
  await page
    .getByRole("button", { name: "Retry destinations", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Destinations", exact: true })
      .getByRole("article"),
  ).toHaveCount(3);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("mobile search and details fit the viewport and support keyboard navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?states=OR");
  const link = page.getByRole("link", {
    name: "Crater Lake National Park",
    exact: true,
  });
  await expect(link).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Crater Lake National Park",
  );
  await expect(page.getByRole("main")).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("link", { name: /Back to destinations/ }),
  ).toBeVisible();
});
