import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/projects/new",
  "/scene-review",
  "/admin",
  "/admin/jobs",
  "/admin/tenants",
  "/admin/receipts",
  "/admin/quarantine",
  "/admin/audit",
] as const;

test("keeps visible control IDs unique after removing static admin screens @control-manifest", async ({
  page,
}) => {
  const seen = new Set<string>();
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();
    const ids = await page
      .locator("[data-control-id]:visible")
      .evaluateAll((nodes) =>
        nodes
          .map((node) => node.getAttribute("data-control-id"))
          .filter((value): value is string => value !== null),
      );
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => seen.add(id));
  }
  expect([...seen].some((id) => id.startsWith("upload_validation:"))).toBe(
    true,
  );
  expect([...seen].some((id) => id.startsWith("ref_studio_landing:"))).toBe(
    false,
  );
  expect([...seen].some((id) => id.startsWith("admin_"))).toBe(false);
  expect([...seen].some((id) => id.startsWith("job_"))).toBe(false);
  expect([...seen].some((id) => id.startsWith("scene_"))).toBe(false);
});
