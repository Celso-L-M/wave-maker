import { renderWithActor } from "@/__tests__/test-utils";
import type { backendInterface } from "@/backend";
import { GameCanvas } from "@/components/game/GameCanvas";
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

/**
 * Cover for the accepted smooth-scaling change.
 *
 * The request switches the canvas from nearest-neighbour pixel scaling to
 * smooth scaling so the shaded scene is no longer chunky or pixelated. jsdom
 * cannot rasterize, so the observable contract is the smoothing flags the game
 * sets on the 2D context and the CSS class on the canvas element.
 */

interface SmoothingContext {
  ctx: CanvasRenderingContext2D;
  smoothing: { enabled: boolean; quality: string };
}

function smoothingContext(): SmoothingContext {
  const noop = () => {};
  const smoothing: { enabled: boolean; quality: string } = {
    enabled: false,
    quality: "low",
  };
  const ctx = {
    canvas: document.createElement("canvas"),
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    arc: noop,
    clip: noop,
    fill: noop,
    fillRect: noop,
    fillText: noop,
    stroke: noop,
    clearRect: noop,
    setTransform: noop,
    scale: noop,
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    get imageSmoothingEnabled() {
      return smoothing.enabled;
    },
    set imageSmoothingEnabled(value: boolean) {
      smoothing.enabled = value;
    },
    get imageSmoothingQuality() {
      return smoothing.quality;
    },
    set imageSmoothingQuality(value: string) {
      smoothing.quality = value;
    },
    fillStyle: "",
    font: "",
    textAlign: "left",
    textBaseline: "top",
  } as unknown as CanvasRenderingContext2D;
  return { ctx, smoothing };
}

let getContextSpy: MockInstance<typeof HTMLCanvasElement.prototype.getContext>;
let smoothing: SmoothingContext["smoothing"];

beforeEach(() => {
  const stub = smoothingContext();
  smoothing = stub.smoothing;
  getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(stub.ctx);
});

afterEach(() => {
  getContextSpy.mockRestore();
});

function makeActor(): Pick<
  backendInterface,
  "getSessionHighScore" | "submitRun"
> {
  return {
    getSessionHighScore: vi.fn(async () => 0n),
    submitRun: vi.fn(async (distance: bigint) => distance),
  };
}

describe("smooth canvas scaling", () => {
  it("enables high-quality image smoothing on the 2D context", () => {
    renderWithActor(<GameCanvas />, makeActor());
    expect(smoothing.enabled).toBe(true);
    expect(smoothing.quality).toBe("high");
  });

  it("marks the canvas element for smooth (non-pixelated) rendering", () => {
    renderWithActor(<GameCanvas />, makeActor());
    const canvas = screen.getByTestId("game.canvas_target");
    expect(canvas.className).toContain("smooth-canvas");
  });
});
