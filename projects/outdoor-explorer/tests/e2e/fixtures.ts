import { test as base, expect } from "@playwright/test";

// Every test receives a fresh browser context. Block and report external traffic,
// including images, so an accidental live dependency cannot silently pass.
export const test = base.extend<{ offlineBoundary: void }>({
  offlineBoundary: [
    async ({ context }, use) => {
      const external: string[] = [];
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
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
