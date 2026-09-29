import { test, expect } from "./fixtures.js";

test("park campgrounds filter documented features and label missing fields", async ({
  page,
}) => {
  await page.goto("/?park=crla");
  const section = page.getByRole("region", {
    name: "Campgrounds",
    exact: true,
  });
  await expect(
    section.getByRole("heading", { name: "Mazama Campground" }),
  ).toBeVisible();
  await expect(
    section.getByRole("heading", { name: "Lost Creek Campground" }),
  ).toBeVisible();
  await expect(
    section.getByRole("heading", { name: "Primitive Camp" }),
  ).toBeVisible();
  await expect(section.getByText(/not current availability/)).toBeVisible();
  await expect(
    section
      .getByText("Fees not supplied by NPS. Check the official source.")
      .first(),
  ).toBeVisible();
  await expect(
    section.getByText("Amenities not supplied by NPS."),
  ).toBeVisible();
  await expect(
    section.getByRole("link", {
      name: "Official booking information for Mazama Campground",
    }),
  ).toHaveAttribute(
    "href",
    "https://www.recreation.gov/camping/campgrounds/fixture-mazama",
  );
  await expect(
    section.getByRole("link", {
      name: "Official booking information for Primitive Camp",
    }),
  ).toHaveCount(0);

  await section.getByLabel("Amenity").selectOption({ label: "Potable water" });
  await expect(
    section.getByText("Showing 1 of 3 NPS campgrounds."),
  ).toBeVisible();
  await expect(
    section.getByRole("heading", { name: "Mazama Campground" }),
  ).toBeVisible();
  await expect(
    section.getByRole("heading", { name: "Lost Creek Campground" }),
  ).toHaveCount(0);
  await section.getByLabel("Site type").selectOption({ label: "Horse" });
  await expect(
    section.getByText("Showing 0 of 3 NPS campgrounds."),
  ).toBeVisible();
  await expect(
    section.getByText("No campgrounds match these documented features."),
  ).toBeVisible();
  await section.getByLabel("Amenity").selectOption("");
  await expect(
    section.getByRole("heading", { name: "Lost Creek Campground" }),
  ).toBeVisible();
});

test("empty and failed campground feeds preserve park details", async ({
  page,
}) => {
  await page.goto("/?park=olym");
  await expect(
    page.getByText("No campgrounds returned by NPS for this park."),
  ).toBeVisible();
  await page.route("**/api/parks/crla/campgrounds", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      body: '{"status":503}',
    }),
  );
  await page.goto("/?park=crla");
  const section = page.getByRole("region", {
    name: "Campgrounds",
    exact: true,
  });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Crater Lake National Park",
  );
  await expect(section.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(
    section.getByText("No campgrounds returned by NPS for this park."),
  ).toHaveCount(0);
  await page.unroute("**/api/parks/crla/campgrounds");
  await section.getByRole("button", { name: "Retry campgrounds" }).click();
  await expect(
    section.getByRole("heading", { name: "Mazama Campground" }),
  ).toBeVisible();
});
