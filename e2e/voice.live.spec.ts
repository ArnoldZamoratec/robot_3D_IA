import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { darkPixelsIn } from "./pixels.ts";

// Live test: calls the real NVIDIA services through the local API. Opt-in: E2E_LIVE=1.
// Chrome's fake microphone plays a recorded Spanish question ("¿cuál es la capital de Francia?").
const wav = fileURLToPath(new URL("./fixtures/question-es.wav", import.meta.url));

test.skip(!process.env.E2E_LIVE, "Set E2E_LIVE=1 to run against the real AI provider.");
test.use({
  launchOptions: {
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${wav}%noloop`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  },
});

test("spoken question gets a spoken AI answer with mouth movement", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?avatar=placeholder");
  const status = page.getByTestId("status");
  const mouth = { x0: 0.42, x1: 0.58, y0: 0.45, y1: 0.62 };

  await page.getByRole("button", { name: "Start conversation" }).click();
  await expect(page.getByLabel("Microphone is on")).toBeVisible();
  await expect(status).toHaveText("Listening");
  const closedMouth = await darkPixelsIn(page, mouth);

  await expect(status).toHaveText("Thinking…", { timeout: 15_000 });
  const captions = page.getByLabel("Conversation captions");
  await expect(captions).toContainText(/francia/i, { timeout: 15_000 });

  await expect(status).toHaveText("Speaking", { timeout: 20_000 });
  await expect(captions).toContainText(/par[ií]s/i);

  // Lip sync: sample the mouth region while audio plays; it must open at some point.
  let maxDark = 0;
  for (let i = 0; i < 12; i++) {
    maxDark = Math.max(maxDark, await darkPixelsIn(page, mouth));
    await page.waitForTimeout(120);
  }
  expect(maxDark).toBeGreaterThan(closedMouth + 300);

  await expect(status).toHaveText("Listening", { timeout: 30_000 });
  await page.getByRole("button", { name: "End conversation" }).click();
  await expect(status).toHaveText("Disconnected");
  await expect(page.getByLabel("Microphone is on")).toHaveCount(0);
});
