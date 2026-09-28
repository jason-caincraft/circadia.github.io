import { test as base, expect } from "@playwright/test";

// Every test receives a fresh browser context. Block and report external traffic,
// including images, so an accidental live dependency cannot silently pass.
export const test = base.extend<{
  offlineBoundary: void;
  mapTiles: "forbid" | "fixture" | "unavailable";
}>({
  mapTiles: ["forbid", { option: true }],
  offlineBoundary: [
    async ({ context, mapTiles }, use) => {
      const external: string[] = [];
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (
          mapTiles !== "forbid" &&
          url.origin === "https://tile.openstreetmap.org" &&
          /^\/\d+\/\d+\/\d+\.png$/.test(url.pathname)
        ) {
          // Local synthetic image only. No requests reach the live tile service.
          if (mapTiles === "unavailable") await route.abort("failed");
          else
            await route.fulfill({
              contentType: "image/png",
              body: Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
                "base64",
              ),
            });
          return;
        }
        if (
          ["http://127.0.0.1:5178", "http://127.0.0.1:5088"].includes(
            url.origin,
          )
        ) {
          await route.continue();
        } else {
          external.push(url.origin + url.pathname);
          await route.abort("blockedbyclient");
        }
      });
      await use();
      expect(
        external,
        "Browser tests must not depend on external HTTP",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
