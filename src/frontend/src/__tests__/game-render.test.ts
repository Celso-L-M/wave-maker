import { RIDER_X, VIEW_H, VIEW_W, WATER_LINE_RATIO } from "@/game/constants";
import { createInitialState, resetRun } from "@/game/engine";
import { render } from "@/game/render";
import type { GameState } from "@/game/types";
import { describe, expect, it } from "vitest";

/**
 * Cover for the Wave Maker visual restyle.
 *
 * The scene is shaded with smooth gradients and soft volumes rather than hard
 * pixel bands, so the observable contract of `render()` is the sequence of draw
 * operations it issues: the smooth multi-stop sunset sky, the soft glowing sun
 * disc, the layered water with a sun-reflection path, and the HUD panels. These
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

interface GradientOp {
  kind: "linear" | "radial";
  stops: Array<{ at: number; color: string }>;
}

interface RecordingContext {
  ctx: CanvasRenderingContext2D;
  fills: FillOp[];
  gradients: GradientOp[];
  texts: Array<{ text: string; x: number; y: number; color: string }>;
  arcs: Array<{ x: number; y: number; r: number }>;
}

function recordingContext(): RecordingContext {
  const fills: FillOp[] = [];
  const gradients: GradientOp[] = [];
  const texts: Array<{ text: string; x: number; y: number; color: string }> =
    [];
  const arcs: Array<{ x: number; y: number; r: number }> = [];
  const noop = () => {};
  const state = { fillStyle: "" };
  const makeGradient = (kind: "linear" | "radial") => {
    const op: GradientOp = { kind, stops: [] };
    gradients.push(op);
    return {
      addColorStop(at: number, color: string) {
        op.stops.push({ at, color });
      },
    };
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
    createLinearGradient: () => makeGradient("linear"),
    createRadialGradient: () => makeGradient("radial"),
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

/** Fills that start at the left edge and span the full logical width. */
function fullWidthBands(fills: FillOp[]): FillOp[] {
  return fills.filter((f) => f.x === 0 && f.w === VIEW_W);
}

describe("sky rendering", () => {
  it("paints a smooth multi-stop sunset gradient from the top of the canvas", () => {
    const { ctx, fills, gradients } = recordingContext();
    render(ctx, createInitialState(), 0);

    // The sky is one full-width gradient fill spanning the top of the canvas.
    const skyFill = fullWidthBands(fills).find(
      (f) => f.y === 0 && f.y + f.h <= VIEW_H * WATER_LINE_RATIO + 1,
    );
    expect(skyFill).toBeDefined();

    // The gradient carries several distinct colour stops (indigo → amber).
    const skyGradient = gradients.find((g) => g.stops.length >= 5);
    expect(skyGradient).toBeDefined();
    const stopColors = new Set(skyGradient?.stops.map((s) => s.color));
    expect(stopColors.size).toBeGreaterThanOrEqual(5);
  });

  it("draws a warm glow gradient near the horizon", () => {
    const { ctx, gradients } = recordingContext();
    render(ctx, createInitialState(), 0);
    // The sky bloom and the sun halo are both gradients.
    expect(gradients.length).toBeGreaterThanOrEqual(2);
  });

  it("draws the sun as a soft glowing disc rather than scanline cuts", () => {
    const { ctx, fills, gradients, arcs } = recordingContext();
    render(ctx, createInitialState(), 0);

    const sunX = VIEW_W * 0.5;
    const sunY = VIEW_H * 0.46;

    // The disc is an arc centred on the sun anchor.
    const disc = arcs.find(
      (a) => Math.abs(a.x - sunX) < 2 && Math.abs(a.y - sunY) < 2 && a.r > 20,
    );
    expect(disc).toBeDefined();

    // A radial gradient provides the soft glow.
    expect(gradients.some((g) => g.kind === "radial")).toBe(true);

    // No hard 2px scanline strips are cut across the sun disc itself.
    const scanlines = fills.filter(
      (f) =>
        f.y > sunY &&
        f.y < sunY + 60 &&
        f.w > 0 &&
        f.w < 120 &&
        f.h === 2 &&
        f.x < sunX &&
        f.x + f.w > sunX,
    );
    expect(scanlines.length).toBe(0);
  });
});

describe("water rendering", () => {
  it("fills the water region with layered tones", () => {
    const { ctx, fills } = recordingContext();
    render(ctx, runningState(), 0);

    const waterY = VIEW_H * WATER_LINE_RATIO;
    const waterFills = fills.filter((f) => f.y >= waterY - 4);
    const colors = new Set(waterFills.map((f) => f.color));
    // Deep, mid, shallow, crest and foam tones all appear in the water.
    expect(colors.size).toBeGreaterThanOrEqual(4);
  });

  it("draws a sun-reflection path down the centre of the water", () => {
    const { ctx, fills } = recordingContext();
    render(ctx, runningState(), 0);

    const waterY = VIEW_H * WATER_LINE_RATIO;
    const centre = VIEW_W * 0.5;
    // Reflection glints are narrow strips straddling the horizontal centre.
    const glints = fills.filter(
      (f) =>
        f.y > waterY &&
        f.w > 0 &&
        f.w < 120 &&
        f.x < centre &&
        f.x + f.w > centre,
    );
    expect(glints.length).toBeGreaterThanOrEqual(6);
  });

  it("animates the water as the scroll offset advances", () => {
    const state = runningState();
    const first = recordingContext();
    render(first.ctx, state, 0);

    state.waterOffset += 37;
    const second = recordingContext();
    render(second.ctx, state, 0);

    // The crest/foam positions shift with the offset, so the fill set changes.
    expect(second.fills).not.toEqual(first.fills);
  });

  it("paints a smooth depth gradient from the horizon to the foreground", () => {
    const { ctx, fills, gradients } = recordingContext();
    render(ctx, runningState(), 0);

    const waterY = VIEW_H * WATER_LINE_RATIO;
    // The water body is one full-width gradient fill spanning the water region.
    const waterFill = fills.find(
      (f) => f.x === 0 && f.w === VIEW_W && f.y === waterY,
    );
    expect(waterFill).toBeDefined();

    // The depth gradient carries several distinct colour stops.
    const depthGradient = gradients.find((g) => g.stops.length >= 4);
    expect(depthGradient).toBeDefined();
    const stopColors = new Set(depthGradient?.stops.map((s) => s.color));
    expect(stopColors.size).toBeGreaterThanOrEqual(4);
  });
});

describe("coastline rendering", () => {
  it("hazes the distant land more than the near land", () => {
    const { ctx, fills } = recordingContext();
    render(ctx, createInitialState(), 0);

    // The far land is veiled with a stronger haze than the near strip.
    const hazeFills = fills.filter((f) => f.color.startsWith("rgba(201, 138"));
    expect(hazeFills.length).toBeGreaterThanOrEqual(2);
    const alphas = hazeFills.map((f) =>
      Number(f.color.match(/([\d.]+)\)$/)?.[1]),
    );
    expect(Math.max(...alphas)).toBeGreaterThan(Math.min(...alphas));
  });

  it("retains the lighthouse and palm silhouettes on the near land", () => {
    const { ctx, fills, gradients } = recordingContext();
    render(ctx, createInitialState(), 0);

    // The lighthouse beacon is a radial glow and its lit face is a warm fill.
    expect(gradients.some((g) => g.kind === "radial")).toBe(true);
    const litFace = fills.find((f) => f.color === "#ffd166");
    expect(litFace).toBeDefined();
    // Palm silhouettes are drawn in the dark palm tone.
    const palms = fills.filter((f) => f.color === "#1c0f33");
    expect(palms.length).toBeGreaterThan(0);
  });
});

describe("rider rendering", () => {
  it("draws a spray trail on the water while riding", () => {
    const state = runningState();
    state.rider.airborne = false;
    const { ctx, fills } = recordingContext();
    render(ctx, state, 0);

    // Spray fans off the hull behind the rider in foam tones.
    const spray = fills.filter(
      (f) =>
        f.x < RIDER_X - 20 && (f.color === "#eafcff" || f.color === "#9fe3e8"),
    );
    expect(spray.length).toBeGreaterThan(0);
  });

  it("draws a wake while airborne", () => {
    const state = runningState();
    state.rider.airborne = true;
    state.rider.y = 40;
    const { ctx, fills } = recordingContext();
    render(ctx, state, 0);

    // The airborne wake trails behind the rider in the dim foam tone.
    const wake = fills.filter(
      (f) => f.x < RIDER_X - 20 && f.color === "#9fe3e8",
    );
    expect(wake.length).toBeGreaterThan(0);
  });
});

describe("obstacle rendering", () => {
  it("shades a buoy with a lit highlight and a waterline reflection", () => {
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

    const near = fills.filter((f) => f.x >= 300 && f.x < 320);
    // Dimensional shading: dark rim, red core and a lit highlight.
    expect(near.some((f) => f.color === "#8f1d2c")).toBe(true);
    expect(near.some((f) => f.color === "#e63946")).toBe(true);
    expect(near.some((f) => f.color === "#ffd166")).toBe(true);
    // A soft shadow / reflection sits below the waterline.
    expect(near.some((f) => f.color.startsWith("rgba(11, 39, 64"))).toBe(true);
  });

  it("shades a dock with lit planks and a waterline reflection", () => {
    const state = runningState();
    state.obstacles.push({
      id: 2,
      kind: "dock",
      x: 420,
      yOffset: -22,
      width: 54,
      height: 26,
      cleared: false,
    });
    const { ctx, fills } = recordingContext();
    render(ctx, state, 0);

    const near = fills.filter((f) => f.x >= 420 && f.x < 474);
    // Deck planks with a lit top edge and dark seams.
    expect(near.some((f) => f.color === "#a9743f")).toBe(true);
    expect(near.some((f) => f.color === "#d9a066")).toBe(true);
    expect(near.some((f) => f.color === "#6b4526")).toBe(true);
    // A soft shadow sits on the water below the dock.
    expect(near.some((f) => f.color.startsWith("rgba(11, 39, 64"))).toBe(true);
  });
});

describe("HUD rendering", () => {
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
});

describe("scene composition", () => {
  it("draws the rider and obstacles above the water", () => {
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

    // The buoy body is a red fill near its x position.
    const buoy = fills.find(
      (f) => f.x >= 300 && f.x < 320 && f.color === "#e63946",
    );
    expect(buoy).toBeDefined();
  });

  it("does not throw when the scene is empty", () => {
    const { ctx } = recordingContext();
    expect(() => render(ctx, createInitialState(), 0)).not.toThrow();
  });
});
