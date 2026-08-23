import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "../..");
const evidenceDir = resolve(root, ".omo/evidence/wave7/task-42-visual");
const screens = [
  ["ref_studio_landing", "/"],
  ["admin_sign_in", "/admin/sign-in"],
  ["upload_validation", "/projects/new"],
  ["scene_review", "/scene-review"],
  ["admin_jobs", "/admin/jobs"],
  ["admin_tenants", "/admin/tenants"],
  ["admin_receipts", "/admin/receipts"],
  ["admin_quarantine", "/admin/quarantine"],
  ["admin_audit", "/admin/audit"],
] as const;

test("frozen visual contract structure and screenshots", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  for (const [name, route] of screens) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();
    await page.screenshot({
      path: resolve(evidenceDir, `${name}-1440x900.png`),
      fullPage: true,
    });
    for (const width of [390, 320, 768]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.reload();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      if (width === 390)
        expect(
          await page.locator("main, [role=main], body").first().isVisible(),
        ).toBe(true);
    }
  }
});
