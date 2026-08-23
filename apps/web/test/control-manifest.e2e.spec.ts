import { expect, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "../..");
const manifestUrl = resolve(root, "tests/control-manifest.json");
const evidenceUrl = resolve(
  root,
  ".omo/evidence/wave7/task-41-reference-video-studio-saas.json",
);

test("executes the frozen control manifest at desktop and narrow viewports @control-manifest", async ({
  page,
}) => {
  const expected = JSON.parse(await readFile(manifestUrl, "utf8")) as {
    controls: Array<{ id: string }>;
  };
  const seen = new Set<string>();
  const collect = async (): Promise<void> => {
    const values = await page
      .locator("[data-control-id]:visible")
      .evaluateAll((nodes) =>
        nodes
          .map((node) => node.getAttribute("data-control-id"))
          .filter((value): value is string => value !== null),
      );
    values.forEach((value) => seen.add(value));
  };
  const visit = async (path: string, width = 1440): Promise<void> => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(path);
    await collect();
  };

  await visit("/");
  await page.getByRole("button", { name: "Open notifications" }).click();
  await collect();
  await page.getByRole("button", { name: "Close drawer" }).click();
  await page.getByRole("button", { name: "Open settings" }).click();
  await collect();
  await visit("/projects/new", 390);
  await visit("/scene-review");
  await page.getByRole("button", { name: /Street_Debris_Scatter/ }).click();
  await collect();
  await page.getByRole("button", { name: "Background", exact: true }).click();
  await collect();
  await page
    .getByRole("button", { name: "Re-review current snapshot" })
    .click();
  await collect();
  await visit("/admin/sign-in", 390);
  await visit("/admin", 390);
  await page.getByRole("button", { name: "Menu" }).click();
  await collect();
  await visit("/admin/jobs");
  await page.getByLabel("Filter state").selectOption("COMPLETED");
  await page.getByRole("button", { name: /RND-8990-W/ }).click();
  await collect();
  await page.getByRole("button", { name: "Close" }).click();
  await visit("/admin/tenants");
  await page.getByLabel("Search tenants").fill("Aegis");
  await page
    .getByRole("button", { name: "More actions for Aegis Corporation" })
    .click();
  await collect();
  await page.getByRole("button", { name: "Open detail", exact: true }).click();
  await expect(page.locator(".tenant-drawer")).toBeVisible();
  await collect();
  await page
    .getByRole("button", { name: "Manage access" })
    .evaluate((element) => (element as HTMLButtonElement).click());
  await collect();
  await page
    .locator(".confirm")
    .getByRole("button", { name: "Cancel" })
    .evaluate((element) => (element as HTMLButtonElement).click());
  await visit("/admin/tenants", 390);
  await page.getByLabel("Search tenants").fill("Aegis");
  await page.getByRole("button", { name: "Cards" }).click();
  await collect();
  await visit("/admin/receipts");
  await page.getByText("Accessible list fallback").click();
  await collect();
  await page.getByRole("button", { name: "Export scoped log" }).click();
  await collect();
  await page.getByRole("button", { name: "Cancel" }).click();
  await visit("/admin/quarantine");
  await page.getByRole("button", { name: "View Evidence" }).first().click();
  await collect();
  await page.getByRole("button", { name: "Release selected" }).click();
  await collect();
  await page.getByRole("checkbox").check();
  await collect();
  await page.getByRole("button", { name: "Confirm release" }).click();
  await visit("/admin/audit");
  await page.locator('[data-control-id="admin_audit_log:8"]').click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await collect();
  await page.getByRole("button", { name: "Close audit details" }).click();
  await page.getByRole("button", { name: "Export filtered" }).click();
  await collect();

  const actual = [...seen].sort();
  const oracle = expected.controls.map((control) => control.id).sort();
  expect(actual).toEqual(oracle);
  await mkdir(resolve(root, ".omo/evidence/wave7/"), { recursive: true });
  await writeFile(
    evidenceUrl,
    `${JSON.stringify({ task: 41, status: "passed", viewportRuns: ["1440x900", "390x844"], uniqueSourceControls: actual.length, expectedSourceControls: oracle.length, controls: actual }, null, 2)}\n`,
  );
});
