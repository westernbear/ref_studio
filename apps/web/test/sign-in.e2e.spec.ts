import { expect, test } from "@playwright/test";

test.describe("shared sign-in", () => {
  test("validates, reveals, and safely clears a failed creator sign-in @sign-in", async ({
    page,
  }) => {
    await page.route("**/sign-in", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "AUTHENTICATION_REQUIRED" } }),
      });
    });
    await page.goto("/sign-in?returnTo=https://evil.invalid");

    const identifier = page.getByLabel("Identifier");
    const secret = page.getByLabel("Secret");
    await expect(
      page.getByRole("heading", { name: "CREATOR STUDIO" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Forgot Secret?" }),
    ).toHaveAttribute("href", "/support");
    await expect(page.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );

    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(identifier).toBeFocused();
    await identifier.fill("creator@example.invalid");
    await page.getByRole("button", { name: "Reveal" }).click();
    await expect(secret).toHaveAttribute("type", "text");
    await secret.fill("wrong-secret");
    await secret.press("Enter");

    await expect(page.getByRole("alert", { name: "Sign-in error" })).toHaveText(
      "The identifier or secret could not be verified.",
    );
    await expect(identifier).toHaveValue("creator@example.invalid");
    await expect(secret).toHaveValue("");
    await expect(secret).toBeFocused();
  });

  test("renders the admin variant with an internal return path @sign-in", async ({
    page,
  }) => {
    await page.goto("/admin/sign-in?returnTo=/admin/tenants");
    await expect(page.getByText("Admin Authorization Required")).toBeVisible();
    await expect(page.getByRole("link", { name: "Security" })).toHaveAttribute(
      "href",
      "/support",
    );
  });
});
