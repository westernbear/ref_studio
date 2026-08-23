import { expect, test } from "@playwright/test";

test("covers immutable receipt timeline, detail, fallback, export, and blocked states @admin-receipts", async ({
  page,
}) => {
  const seen = new Set<string>();
  const collect = async () => {
    for (const value of await page
      .locator('[data-control-id^="admin_receipt_chain:"]')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-control-id")),
      ))
      if (value) seen.add(value);
  };
  await page.goto("/admin/receipts");
  await expect(
    page.getByRole("heading", { name: "Receipt chain" }),
  ).toBeVisible();
  await collect();
  await page.getByText("Accessible list fallback").click();
  await collect();
  await page.getByRole("button", { name: /RC-8893-B-10/ }).click();
  await expect(page.locator(".receipt-blocked")).toContainText(
    "Approval-dependent actions blocked",
  );
  await page.getByRole("button", { name: "Copy receipt ID" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Copied receipt ID RC-8893-B-10",
  );
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.getByRole("button", { name: "Count records" }).click();
  await page.getByRole("button", { name: "Explain order" }).click();
  await page.getByRole("button", { name: "Artifact provenance" }).click();
  await page.getByRole("button", { name: "Actor and time" }).click();
  await page.getByRole("button", { name: "Decision reason" }).click();
  await page.getByRole("button", { name: "Export scoped log" }).click();
  await collect();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Confirm export" }).click(),
  ]);
  expect(download.suggestedFilename()).toContain("receipt-export-RC-8893-B-10");
  await expect(page.locator(".receipt-export-note")).toContainText(
    "restricted paths and tenant identifiers are excluded",
  );
  await collect();
  await page.goto("/admin/receipts?receipt=RC-8890-Y-00");
  await expect(page.getByRole("heading", { name: "T1: INIT" })).toBeVisible();
  const firstNode = page.getByRole("button", { name: /T1: INIT/ });
  await firstNode.focus();
  await firstNode.press("ArrowDown");
  await expect(page.locator('[data-receipt-id="RC-8891-Z-01"]')).toBeVisible();
  await page.goto("/admin/receipts?receipt=RC-8894-C-11");
  await expect(page.locator(".receipt-blocked")).toContainText(
    "hash provenance alone is insufficient",
  );
  await collect();
  expect([...seen].sort()).toEqual(
    Array.from(
      { length: 14 },
      (_, index) => `admin_receipt_chain:${index + 1}`,
    ).sort(),
  );
  expect(seen.size).toBe(14);
  await expect(
    page.getByRole("button", { name: /edit|delete|remove/i }),
  ).toHaveCount(0);
});
