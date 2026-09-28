import { test, expect } from "./fixtures.js";

test.use({ mapTiles: "fixture" });

test("map is opt-in, retains the list, and deduplicates multi-state markers", async ({
  page,
}) => {
  await page.goto("/");
  const results = page.getByRole("region", {
    name: "Destinations",
    exact: true,
  });
  await expect(results.getByRole("article")).toHaveCount(3);
  await expect(
    page.getByRole("group", { name: "Interactive park map" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Show map", exact: true }).click();
  const map = page.getByRole("region", { name: "Park map", exact: true });
  await expect(map.getByRole("button", { name: /Map marker:/ })).toHaveCount(2);
  await expect(map).toContainText("2 mapped; 1 without valid coordinates");
  await expect(results.getByRole("article")).toHaveCount(3);
  await expect(
    map.getByRole("button", { name: "Map marker: Yellowstone National Park" }),
  ).toHaveCount(1);
  await expect(
    map.getByRole("link", { name: "OpenStreetMap", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hide map", exact: true }).click();
  await expect(map).toHaveCount(0);
  await expect(results.getByRole("article")).toHaveCount(3);
  // Exercise map disposal and reinitialization.
  await page.getByRole("button", { name: "Show map", exact: true }).click();
  await expect(page.getByRole("button", { name: /Map marker:/ })).toHaveCount(
    2,
  );
});

test("state, keyword, and activity filters produce the same list and markers; popups open details", async ({
  page,
}) => {
  const activity = "B33DC9B6-0B7D-4322-BAD7-A13A34C584A3";
  await page.goto(`/?states=OR&q=lake&activityId=${activity}`);
  const results = page.getByRole("region", {
    name: "Destinations",
    exact: true,
  });
  await expect(results.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Show map", exact: true }).click();
  await expect(page.getByRole("button", { name: /Map marker:/ })).toHaveCount(
    1,
  );
  const marker = page.getByRole("button", {
    name: "Map marker: Crater Lake National Park",
  });
  await marker.focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("link", { name: "View Crater Lake National Park", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Crater Lake National Park",
  );
  await expect(page.getByRole("main")).toBeFocused();
  await page.getByRole("link", { name: /Back to destinations/ }).click();
  await expect(page.getByLabel("Place or keyword")).toHaveValue("lake");
  await page.getByLabel("Oregon", { exact: true }).uncheck();
  await page.getByLabel("Washington", { exact: true }).check();
  await page.getByLabel("Place or keyword").fill("");
  await page.getByLabel("Activity", { exact: true }).selectOption("");
  await page
    .getByRole("button", { name: "Search destinations", exact: true })
    .click();
  await expect(results.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Show map", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Park map", exact: true }),
  ).toContainText("0 mapped; 1 without valid coordinates");
  await expect(page.getByRole("button", { name: /Map marker:/ })).toHaveCount(
    0,
  );
  await expect(
    results.getByRole("link", { name: "Olympic National Park", exact: true }),
  ).toBeVisible();
});

test("empty map keeps the empty-result explanation", async ({ page }) => {
  await page.goto("/?q=nonexistent");
  await expect(page.getByText(/No destinations match/)).toBeVisible();
  await page.getByRole("button", { name: "Show map", exact: true }).click();
  await expect(
    page.getByText("No matching destinations have valid map coordinates."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Map marker:/ })).toHaveCount(
    0,
  );
});

test("map library failure preserves list navigation", async ({ page }) => {
  await page.route("**/node_modules/.vite/deps/leaflet.js*", (route) =>
    route.abort("failed"),
  );
  await page.goto("/?states=OR");
  await page.getByRole("button", { name: "Show map", exact: true }).click();
  await expect(
    page.getByText("The map could not load. Use the destination list below."),
  ).toBeVisible();
  const results = page.getByRole("region", {
    name: "Destinations",
    exact: true,
  });
  await expect(results.getByRole("article")).toHaveCount(1);
  await results
    .getByRole("link", { name: "Crater Lake National Park", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Crater Lake National Park",
  );
});

test("authorized location filters list and map together, survives detail navigation, and clears on reload", async ({
  page,
  context,
}) => {
  await context.setGeolocation({ latitude: 42.94, longitude: -122.1 });
  await context.grantPermissions(["geolocation"]);
  await page.goto("/");
  const results = page.getByRole("region", {
    name: "Destinations",
    exact: true,
  });
  await expect(results.getByRole("article")).toHaveCount(3);
  await page.getByRole("button", { name: "Show map", exact: true }).click();
  await page
    .getByRole("button", { name: "Use my location", exact: true })
    .click();
  await expect(results.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Map marker:/ })).toHaveCount(
    1,
  );
  await expect(results).toContainText(
    "1 matching destinations without valid coordinates excluded",
  );
  await page.getByLabel("Approximate radius").selectOption("1000");
  await expect(results.getByRole("article")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Map marker:/ })).toHaveCount(
    2,
  );
  await results
    .getByRole("link", { name: "Crater Lake National Park", exact: true })
    .click();
  await page.getByRole("link", { name: /Back to destinations/ }).click();
  await expect(page.getByLabel("Approximate radius")).toHaveValue("1000");
  expect(page.url()).not.toContain("42.94");
  await page
    .getByRole("button", { name: "Clear location filter", exact: true })
    .click();
  await expect(results.getByRole("article")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Use my location", exact: true })
    .click();
  await expect(results.getByRole("article")).toHaveCount(1);
  await page.reload();
  await expect(results.getByRole("article")).toHaveCount(3);
  await expect(page.getByLabel("Approximate radius")).toHaveCount(0);
});

test("denied geolocation leaves the results usable", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Use my location", exact: true })
    .click();
  await expect(
    page.getByText(
      "Location permission was denied. Continue with other filters.",
    ),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Destinations", exact: true })
      .getByRole("article"),
  ).toHaveCount(3);
});

test.describe("tile fallback", () => {
  test.use({ mapTiles: "unavailable" });
  test("failed tiles retain keyboard markers, attribution, and accessible mobile list", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Show map", exact: true }).click();
    await expect(
      page.getByText(
        "Map tiles are unavailable. Markers and the destination list remain usable.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Map marker:/ })).toHaveCount(
      2,
    );
    await expect(
      page
        .getByRole("region", { name: "Destinations", exact: true })
        .getByRole("article"),
    ).toHaveCount(3);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const marker = page.getByRole("button", {
      name: "Map marker: Crater Lake National Park",
    });
    await marker.focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("link", {
        name: "View Crater Lake National Park",
        exact: true,
      })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Crater Lake National Park",
    );
  });
});
