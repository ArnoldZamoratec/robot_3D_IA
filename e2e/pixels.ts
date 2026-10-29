import type { Page } from "@playwright/test";

/** Counts dark pixels inside a box (fractions of the viewport) of a page screenshot. */
export async function darkPixelsIn(page: Page, box: { x0: number; x1: number; y0: number; y1: number }) {
  const png = (await page.screenshot()).toString("base64");
  return page.evaluate(
    async ({ png, box }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const x = Math.round(box.x0 * img.width);
      const y = Math.round(box.y0 * img.height);
      const w = Math.round((box.x1 - box.x0) * img.width);
      const h = Math.round((box.y1 - box.y0) * img.height);
      const { data } = ctx.getImageData(x, y, w, h);
      let dark = 0;
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
        if (lum < 60) dark++;
      }
      return dark;
    },
    { png, box },
  );
}
