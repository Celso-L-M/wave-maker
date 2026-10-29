import { RIDER_X, VIEW_H, VIEW_W, WATER_LINE_RATIO } from "@/game/constants";
import { createInitialState, resetRun } from "@/game/engine";
import { render } from "@/game/render";
import type { GameState } from "@/game/types";
import { describe, expect, it } from "vitest";

/**
 * Characterization baseline for the Wave Maker visual restyle.
 *
 * The scene is being restyled from chunky pixel banding to smooth 2D shading,
 * so these tests deliberately assert nothing about the banded sky, the
 * scanline sun, or any specific palette colour. They pin the invariants the
 * restyle must preserve: the scene is composed from `GameState` each frame, the
 * motion is driven by the run state, and the rider, obstacles and HUD are drawn
 * in every phase.
 *
 * The scene is drawn with fill/arc/gradient primitives, so the observable
 * contract of `render()` is the sequence of draw operations it issues. These
 * tests record those operations through a stub 2D context instead of asserting
 * on real pixels, which jsdom cannot rasterize.
 */

interface FillOp {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

interface RecordingContext {
  ctx: CanvasRenderingContext2D;
  fills: FillOp[];
  gradients: string[];
  texts: Array<{ text: string; x: number; y: number; color: string }>;
  arcs: Array<{ x: number; y: number; r: number }>;
}

function recordingContext(): RecordingContext {
  const fills: FillOp[] = [];
  const gradients: string[] = [];
  const texts: Array<{ text: string; x: number; y: number; color: string }> =
    [];
  const arcs: Array<{ x: number; y: number; r: number }> = [];
  const noop = () => {};
  const state = { fillStyle: "" };
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
    arc(x: number, y: number, r: number) {
      arcs.push({ x, y, r });
    },
    clip: noop,
    fill: noop,
    stroke: noop,
    clearRect: noop,
    setTransform: noop,
    scale: noop,
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => {
      gradients.push("linear");
      return { addColorStop: noop };
    },
    createRadialGradient: () => {
      gradients.push("radial");
      return { addColorStop: noop };
    },
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ x, y, w, h, color: String(state.fillStyle) });
    },
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y, color: String(state.fillStyle) });
    },
    imageSmoothingEnabled: false,
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(value: string) {
      state.fillStyle = value;
    },
    font: "",
    textAlign: "left",
    textBaseline: "top",
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fills, gradients, texts, arcs };
}

function runningState(): GameState {
  const state = createInitialState();
  resetRun(state);
  return state;
}

describe("scene is composed from run state", () => {
  it("draws the whole scene without throwing for an empty start state", () => {
    const { ctx } = recordingContext();
    expect(() => render(ctx, createInitialState(), 0)).not.toThrow();
  });

  it("draws the whole scene without throwing for a populated running state", () => {
    const state = runningState();
    state.obstacles.push({
      id: 1,
      kind: "buoy",
      x: 300,
      yOffset: -20,
      width: 20,
      height: 30,
      cleared: false,
    });
    state.obstacles.push({
      id: 2,
      kind: "dock",
      x: 420,
      yOffset: -22,
      width: 54,
      height: 26,
      cleared: false,
    });
    const { ctx } = recordingContext();
    expect(() => render(ctx, state, 0)).not.toThrow();
  });

  it("issues draw operations for the scene rather than leaving the canvas blank", () => {
    const { ctx, fills, texts } = recordingContext();
    render(ctx, runningState(), 0);
    expect(fills.length).toBeGreaterThan(0);
    expect(texts.length).toBeGreaterThan(0);
  });
});

describe("motion is driven by the run state", () => {
  it("shifts the scene as the elapsed time advances", () => {
    const state = runningState();
    const first = recordingContext();
    render(first.ctx, state, 0);

    state.elapsed += 1.5;
    const second = recordingContext();
    render(second.ctx, state, 0);

    // Sky/cloud/shoreline positions are keyed off elapsed, so the fill set moves.
    expect(second.fills).not.toEqual(first.fills);
  });

  it("shifts the water as the scroll offset advances", () => {
    const state = runningState();
    const first = recordingContext();
    render(first.ctx, state, 0);

    state.waterOffset += 37;
    const second = recordingContext();
    render(second.ctx, state, 0);

    expect(second.fills).not.toEqual(first.fills);
  });

  it("keeps the water region below the water line", () => {
    const { ctx, fills } = recordingContext();
    render(ctx, runningState(), 0);
    const waterY = VIEW_H * WATER_LINE_RATIO;
    // The scene paints the full water region from the water line down.
    const waterFills = fills.filter((f) => f.y >= waterY - 4);
    expect(waterFills.length).toBeGreaterThan(0);
  });
});

describe("rider and obstacles are drawn above the water", () => {
  it("draws the rider near its fixed x position", () => {
    const { ctx, fills } = recordingContext();
    render(ctx, runningState(), 0);
    // The rider is translated to RIDER_X, so its hull fills straddle that x.
    const riderFills = fills.filter(
      (f) => f.x < RIDER_X + 40 && f.x + f.w > RIDER_X - 40,
    );
    expect(riderFills.length).toBeGreaterThan(0);
  });

  it("draws each obstacle at its own x position", () => {
    const state = runningState();
    state.obstacles.push({
      id: 1,
      kind: "buoy",
      x: 300,
      yOffset: -20,
      width: 20,
      height: 30,
      cleared: false,
    });
    const { ctx, fills } = recordingContext();
    render(ctx, state, 0);
    const buoyFills = fills.filter((f) => f.x >= 300 && f.x < 320);
    expect(buoyFills.length).toBeGreaterThan(0);
  });

  it("draws the swell when one is active", () => {
    const state = runningState();
    state.swell = { x: 260, power: 0.8, resolved: false };
    const { ctx, fills } = recordingContext();
    render(ctx, state, 0);
    // The swell is a triangle around its x position near the water line.
    const swellFills = fills.filter(
      (f) =>
        f.x < 260 && f.x + f.w > 260 && f.y < VIEW_H * WATER_LINE_RATIO + 4,
    );
    expect(swellFills.length).toBeGreaterThan(0);
  });
});

describe("HUD is drawn in every phase", () => {
  it("draws the distance readout, high score and charge meter panels", () => {
    const { ctx, texts } = recordingContext();
    render(ctx, runningState(), 42);

    const labels = texts.map((t) => t.text);
    expect(labels).toContain("DISTANCE");
    expect(labels).toContain("HIGH SCORE");
    // The high score value is rendered as a zero-padded readout.
    expect(labels).toContain("0042");
  });

  it("renders the HUD in every game phase", () => {
    for (const phase of ["start", "running", "gameover"] as const) {
      const state = createInitialState();
      state.phase = phase;
      const { ctx, texts } = recordingContext();
      render(ctx, state, 0);
      expect(texts.map((t) => t.text)).toContain("DISTANCE");
    }
  });

  it("draws the HUD text within the logical canvas bounds", () => {
    const { ctx, texts } = recordingContext();
    render(ctx, runningState(), 0);
    // HUD labels and readouts sit in the top strip of the canvas.
    const hudTexts = texts.filter((t) => t.y < 100);
    expect(hudTexts.length).toBeGreaterThan(0);
    for (const t of hudTexts) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(VIEW_W);
    }
  });
});
