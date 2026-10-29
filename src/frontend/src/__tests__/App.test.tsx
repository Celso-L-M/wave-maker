import App from "@/App";
import { renderWithActor } from "@/__tests__/test-utils";
import type { backendInterface } from "@/backend";
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

/**
 * Cover for the full-viewport framing added by the visual restyle.
 *
 * App now wraps GameCanvas in a fixed, full-viewport main with a sunset-glow
 * backdrop and a cabinet frame. These tests pin that framing contract so the
 * game keeps filling the viewport without distortion on any viewport size.
 */

function stubContext(): CanvasRenderingContext2D {
  const noop = () => {};
  return {
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
    imageSmoothingEnabled: false,
    fillStyle: "",
    font: "",
    textAlign: "left",
    textBaseline: "top",
  } as unknown as CanvasRenderingContext2D;
}

let getContextSpy: MockInstance<typeof HTMLCanvasElement.prototype.getContext>;

beforeEach(() => {
  getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(stubContext());
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

describe("App full-viewport framing", () => {
  it("renders the game canvas without a blank screen", () => {
    renderWithActor(<App />, makeActor());
    expect(screen.getByTestId("game.canvas_target")).toBeInTheDocument();
    expect(screen.getByTestId("game.start_state")).toBeInTheDocument();
  });

  it("fills the viewport with a fixed, overflow-hidden frame", () => {
    const { container } = renderWithActor(<App />, makeActor());
    const main = container.querySelector("main");
    expect(main).not.toBeNull();
    expect(main?.className).toContain("fixed");
    expect(main?.className).toContain("inset-0");
    expect(main?.className).toContain("overflow-hidden");
  });

  it("keeps the canvas letterboxed inside the frame", () => {
    renderWithActor(<App />, makeActor());
    const canvas = screen.getByTestId("game.canvas_target");
    expect(canvas.className).toContain("object-contain");
    expect(canvas.className).toContain("h-full");
    expect(canvas.className).toContain("w-full");
  });
});
