import { test, expect } from "./fixtures.js";

test("park details show scoped notices with official sources and provider dates", async ({
  page,
}) => {
  await page.goto("/?park=crla");
  const alerts = page.getByRole("region", {
    name: "Visitor alerts",
    exact: true,
  });
  const roads = page.getByRole("region", { name: "Road events", exact: true });
  await expect(
    alerts.getByRole("heading", { name: "Fixture trail closure" }),
  ).toBeVisible();
  await expect(
    roads.getByRole("heading", { name: "Fixture road work" }),
  ).toBeVisible();
  await expect(
    alerts.getByRole("link", { name: "NPS source: Fixture trail closure" }),
  ).toHaveAttribute(
    "href",
    "https://www.nps.gov/crla/planyourvisit/conditions.htm",
  );
  await expect(
    roads.getByRole("link", { name: "NPS source: Fixture road work" }),
  ).toHaveAttribute("href", "https://www.nps.gov/crla/index.htm");
  await expect(alerts.getByText(/Provider last indexed:/)).toBeVisible();
  await expect(roads.getByText(/Provider source updated:/)).toBeVisible();
  await expect(alerts.getByRole("status")).toContainText(
    "National Park Service",
  );
  await expect(
    page.getByText(/do not mean safe travel or open roads/),
  ).toBeVisible();
  await page.goto("/?park=olym");
  await expect(
    page.getByText("No alerts returned by NPS for this park."),
  ).toBeVisible();
  await expect(
    page.getByText("No road events returned by NPS for this park."),
  ).toBeVisible();
  await expect(
    page.getByText("Fixture trail closure", { exact: true }),
  ).toHaveCount(0);
});

test("conditions load independently while park details remain available", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/parks/crla/alerts", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/?park=crla");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Crater Lake National Park",
    );
    await expect(
      page.getByText("Loading visitor alerts…", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Fixture road work" }),
    ).toBeVisible();
    await expect(
      page.getByText("No alerts returned by NPS for this park."),
    ).toHaveCount(0);
  } finally {
    release();
  }
  await expect(
    page.getByRole("heading", { name: "Fixture trail closure" }),
  ).toBeVisible();
});

for (const feed of ["alerts", "road-events"]) {
  test(`${feed} failure is unavailable, preserves details, and retries`, async ({
    page,
  }) => {
    const route = `**/api/parks/crla/${feed}`;
    await page.route(route, (request) =>
      request.fulfill({
        status: 503,
        contentType: "application/problem+json",
        body: '{"status":503}',
      }),
    );
    await page.goto("/?park=crla");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Crater Lake National Park",
    );
    await expect(
      page.getByRole("heading", { name: "Operating information", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(
      "temporarily unavailable",
    );
    await expect(
      page.getByText(
        `No ${feed === "alerts" ? "alerts" : "road events"} returned by NPS for this park.`,
      ),
    ).toHaveCount(0);
    await page.unroute(route);
    await page
      .getByRole("button", {
        name: `Retry ${feed === "alerts" ? "visitor alerts" : "road events"}`,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: feed === "alerts" ? "Fixture trail closure" : "Fixture road work",
      }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}
