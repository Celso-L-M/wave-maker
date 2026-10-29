import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Cover for the accepted smooth-scaling change at the stylesheet seam.
 *
 * The request switches the canvas from nearest-neighbour pixel scaling to
 * smooth scaling so the shaded scene is no longer chunky or pixelated. The
 * component test asserts the canvas carries the `smooth-canvas` class; this
 * test pins the other half of that contract — the class actually maps to
 * `image-rendering: auto` in the stylesheet, so the class is not a no-op and
 * the scene is not left on the browser's pixelated default.
 *
 * jsdom does not apply the app stylesheet, so the rule is read from the source
 * file rather than computed from a rendered element.
 */

const CSS_PATH = resolve(process.cwd(), "src/index.css");

function smoothCanvasRule(css: string): string {
  const match = css.match(/\.smooth-canvas\s*\{([^}]*)\}/);
  return match?.[1] ?? "";
}

describe("smooth-canvas stylesheet rule", () => {
  it("maps the smooth-canvas class to non-pixelated image rendering", () => {
    const rule = smoothCanvasRule(readFileSync(CSS_PATH, "utf8"));
    expect(rule).not.toBe("");
    expect(rule).toMatch(/image-rendering:\s*auto/);
    // The pixelated default is what the restyle removes.
    expect(rule).not.toMatch(/image-rendering:\s*pixelated/);
  });
});
