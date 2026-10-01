import { test, expect } from "@playwright/test";

test("landing renders SuperView", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("SuperView").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign up" }).first()).toBeVisible();
});

test("login page exists", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});

test("signup page exists", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
});
