import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { darkPixelsIn } from "./pixels.ts";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
});

test("renders the 3D stage with the placeholder avatar and idle state", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?avatar=placeholder");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByTestId("status")).toHaveText("Idle");
  await expect(page.getByText("Placeholder avatar")).toBeVisible();
  expect(errors).toEqual([]);
});

test("facial controls change the rendered mouth", async ({ page }) => {
  await page.goto("/?avatar=placeholder");
  await expect(page.getByText("Placeholder avatar")).toBeVisible();
  await page.waitForTimeout(500);
  const mouthBox = { x0: 0.42, x1: 0.58, y0: 0.45, y1: 0.62 };
  const closed = await darkPixelsIn(page, mouthBox);
  await page.getByText("Face controls").click();
  await page.locator("#fc-jawOpen").fill("1");
  await page.waitForTimeout(300);
  const open = await darkPixelsIn(page, mouthBox);
  expect(open).toBeGreaterThan(closed + 1000);
});

test("shows a recoverable error when the server has no provider key", async ({ page }) => {
  await page.route("/api/health", (route) => route.fulfill({ json: { ok: true, voiceConfigured: false } }));
  await page.goto("/?avatar=placeholder");
  await page.getByRole("button", { name: "Start conversation" }).click();
  await expect(page.getByTestId("status")).toHaveText("Error");
  await expect(page.getByRole("alert")).toContainText("no AI provider key");
  await expect(page.getByRole("button", { name: "Retry" })).toBeEnabled();
  await expect(page.getByLabel("Microphone is on")).toHaveCount(0); // mic never opened
});

test("loads the realistic GLB avatar and binds its blendshapes", async ({ page }) => {
  test.skip(!existsSync("public/models/facecap.glb"), "Run `npm run setup:avatar` first.");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?avatar=/models/facecap.glb");
  await page.getByText("Face controls").click();
  await expect(page.locator(".panel-meta")).toContainText("GLB rig · 13 channels bound", { timeout: 20_000 });
  await expect(page.getByText("Placeholder avatar")).toHaveCount(0);
  await expect(page.getByText(/Loading avatar/)).toHaveCount(0);
  expect(errors).toEqual([]);
});
