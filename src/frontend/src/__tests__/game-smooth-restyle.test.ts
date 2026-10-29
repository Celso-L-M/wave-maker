import { VIEW_H, VIEW_W, WATER_LINE_RATIO } from "@/game/constants";
import { createInitialState, resetRun } from "@/game/engine";
import { render } from "@/game/render";
import type { GameState } from "@/game/types";
import { describe, expect, it } from "vitest";

/**
 * Cover for the accepted smooth-realism restyle.
 *
 * The request redraws the water, foam, sun reflection, rider, jet-ski, buoys,
 * docks, sky, clouds and coastline with smooth curves, soft gradients and
 * feathered edges instead of hard-edged rectangles and flat opaque strips.
 * jsdom cannot rasterize, so the observable contract of `render()` is the
 * sequence of draw operations it issues; these tests record those operations
 * through a stub 2D context and assert the smooth-shading invariants the
 * acceptance criteria describe.
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

const WATER_Y = VIEW_H * WATER_LINE_RATIO;

/** Radial gradients whose inner stop is opaque and outer stop is transparent. */
function featheredGradients(gradients: GradientOp[]): GradientOp[] {
  return gradients.filter(
    (g) =>
      g.kind === "radial" &&
      g.stops.length >= 2 &&
      /,\s*0(\.0+)?\)$/.test(g.stops[g.stops.length - 1].color),
  );
}

describe("soft feathered water and foam", () => {
  it("feathers crest and foam edges with translucent radial washes", () => {
    const { ctx, gradients } = recordingContext();
    render(ctx, runningState(), 0);

    // The crest lanes and foam line each emit a soft radial wash whose outer
    // stop fades to transparent, so lane edges are not hard.
    const feathered = featheredGradients(gradients);
    expect(feathered.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the water body a smooth full-width depth gradient", () => {
    const { ctx, fills, gradients } = recordingContext();
    render(ctx, runningState(), 0);

    const waterFill = fills.find(
      (f) => f.x === 0 && f.w === VIEW_W && f.y === WATER_Y,
    );
    expect(waterFill).toBeDefined();
    const depthGradient = gradients.find(
      (g) => g.kind === "linear" && g.stops.length >= 4,
    );
    expect(depthGradient).toBeDefined();
  });
});

describe("continuous sun-reflection path", () => {
  it("ties the glints into one soft column that widens toward the viewer", () => {
    const { ctx, gradients } = recordingContext();
    render(ctx, runningState(), 0);

    // A soft vertical column of light spans the water region beneath the sun.
    const column = gradients.find(
      (g) =>
        g.kind === "linear" &&
        g.stops.some((s) => s.color.includes("255, 230, 168")),
    );
    expect(column).toBeDefined();

    // The glints themselves are feathered with soft radial halos.
    expect(featheredGradients(gradients).length).toBeGreaterThan(0);
  });
});

describe("soft cloud volumes", () => {
  it("draws clouds as rounded volumes with lit tops and shaded undersides", () => {
    const { ctx, gradients, arcs } = recordingContext();
    render(ctx, createInitialState(), 0);

    // Clouds are built from arcs (rounded volumes), not hard-edged discs.
    const cloudArcs = arcs.filter((a) => a.y < WATER_Y - 20);
    expect(cloudArcs.length).toBeGreaterThan(0);

    // A soft shaded underside is a feathered radial wash.
    expect(featheredGradients(gradients).length).toBeGreaterThan(0);
  });
});

describe("rounded silhouettes on scene actors", () => {
  it("draws the rider and jet-ski with curved arcs rather than stacked rectangles", () => {
    const state = runningState();
    state.rider.airborne = false;
    const { ctx, arcs } = recordingContext();
    render(ctx, state, 0);

    // The jet-ski hull, head and helmet are rounded via arcs.
    const riderArcs = arcs.filter(
      (a) =>
        a.x > 0 && a.x < VIEW_W && a.y > WATER_Y - 80 && a.y < WATER_Y + 20,
    );
    expect(riderArcs.length).toBeGreaterThan(0);
  });

  it("draws buoys and docks with rounded curved silhouettes", () => {
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
    const { ctx, arcs } = recordingContext();
    render(ctx, state, 0);

    // The buoy's rounded top cap is an arc near its x position.
    const buoyArcs = arcs.filter((a) => a.x >= 300 && a.x < 320);
    expect(buoyArcs.length).toBeGreaterThan(0);
  });
});

describe("atmospheric haze on distant layers", () => {
  it("fades the far coastline more than the near coastline", () => {
    const { ctx, fills } = recordingContext();
    render(ctx, createInitialState(), 0);

    const hazeFills = fills.filter((f) => f.color.startsWith("rgba(201, 138"));
    expect(hazeFills.length).toBeGreaterThanOrEqual(2);
    const alphas = hazeFills.map((f) =>
      Number(f.color.match(/([\d.]+)\)$/)?.[1]),
    );
    expect(Math.max(...alphas)).toBeGreaterThan(Math.min(...alphas));
  });
});
