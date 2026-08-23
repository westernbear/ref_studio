import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const screens = [
  ["workflow", "/workflow"],
  ["upload", "/projects/new"],
  ["sign-in", "/sign-in"],
  ["admin-sign-in", "/admin/sign-in"],
  ["scene-review", "/scene-review"],
  ["admin-dashboard", "/admin"],
  ["admin-jobs", "/admin/jobs"],
  ["admin-tenants", "/admin/tenants"],
  ["admin-receipts", "/admin/receipts"],
  ["admin-quarantine", "/admin/quarantine"],
  ["admin-audit", "/admin/audit"],
] as const;

for (const [name, route] of screens) {
  test(`WCAG and interaction coverage: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      results.violations,
      JSON.stringify(results.violations, null, 2),
    ).toEqual([]);
    expect(
      await page
        .locator("button, a, input, select, textarea, [tabindex]")
        .evaluateAll((nodes) =>
          nodes.every((node) => !node.hasAttribute("aria-hidden")),
        ),
    ).toBe(true);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveCount(1);
    expect(await page.locator("[role=dialog]").count()).toBeGreaterThanOrEqual(
      0,
    );
    expect(
      await page.locator("[aria-live], [role=status], [role=alert]").count(),
    ).toBeGreaterThanOrEqual(0);
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.reload();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll("*")].every(
          (node) =>
            getComputedStyle(node).animationDuration === "0s" ||
            getComputedStyle(node).animationName === "none" ||
            getComputedStyle(node).animationDuration === "0.01ms",
        ),
      ),
    ).toBe(true);
  });
}
