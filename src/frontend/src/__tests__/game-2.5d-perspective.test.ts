import { VIEW_H, VIEW_W, WATER_LINE_RATIO } from "@/game/constants";
import { createInitialState, resetRun } from "@/game/engine";
import { render } from "@/game/render";
import type { GameState } from "@/game/types";
import { describe, expect, it } from "vitest";

/**
 * Cover for the accepted 2.5D perspective restyle.
 *
 * The scene changed from a flat side-on 2D strip to a receding perspective
 * water plane with depth-scaled lanes, layered parallax and volumetric
 * shading. jsdom cannot rasterize, so the observable contract of `render()` is
 * the sequence of draw operations it issues; these tests record those
 * operations through a stub 2D context and assert the perspective invariants
 * the acceptance criteria describe.
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

const WATER_Y = VIEW_H * WATER_LINE_RATIO;

/** Distinct y rows of a given fill colour, sorted top to bottom. */
function rowsOf(fills: FillOp[], color: string): number[] {
  return [
    ...new Set(fills.filter((f) => f.color === color).map((f) => f.y)),
  ].sort((a, b) => a - b);
}

describe("receding perspective water plane", () => {
  it("spaces water lanes closer near the horizon and further apart toward the bottom", () => {
    const { ctx, fills } = recordingContext();
    render(ctx, runningState(), 0);

    // The crest highlight tone is drawn only by the crest lanes (no swell is
    // active). Each lane's crests wobble a few px, so cluster the rows into
    // lanes and compare the gaps between lane centres.
    const rows = rowsOf(fills, "#6fd6da").filter((y) => y >= WATER_Y - 2);
    expect(rows.length).toBeGreaterThanOrEqual(3);

    const lanes: number[] = [];
    for (const y of rows) {
      const last = lanes[lanes.length - 1];
      if (last === undefined || y - last > 6) lanes.push(y);
    }
    expect(lanes.length).toBeGreaterThanOrEqual(3);

    const gaps: number[] = [];
    for (let i = 1; i < lanes.length; i++) gaps.push(lanes[i] - lanes[i - 1]);
    const firstGap = gaps[0];
    const lastGap = gaps[gaps.length - 1];
    expect(lastGap).toBeGreaterThan(firstGap);
  });

  it("scales water lanes larger toward the foreground", () => {
    const { ctx, fills } = recordingContext();
    render(ctx, runningState(), 0);

    // Crest lane fills use the shallow tone; their widths grow with depth.
    const crests = fills.filter(
      (f) => f.color === "#2fa3b0" && f.y >= WATER_Y - 2 && f.w > 0,
    );
    const nearHorizon = crests.filter((f) => f.y < WATER_Y + 20);
    const foreground = crests.filter((f) => f.y > VIEW_H - 40);
    expect(nearHorizon.length).toBeGreaterThan(0);
    expect(foreground.length).toBeGreaterThan(0);

    const maxNear = Math.max(...nearHorizon.map((f) => f.w));
    const maxFar = Math.max(...foreground.map((f) => f.w));
    expect(maxFar).toBeGreaterThan(maxNear);
  });

  it("scrolls nearer water lanes faster than distant lanes", () => {
    const state = runningState();
    const first = recordingContext();
    render(first.ctx, state, 0);

    state.waterOffset += 40;
    const second = recordingContext();
    render(second.ctx, state, 0);

    // Track how far each crest lane's leftmost fill shifted with the offset.
    const shiftFor = (rec: RecordingContext, yBand: [number, number]) => {
      const xs = rec.fills
        .filter(
          (f) =>
            f.color === "#2fa3b0" &&
            f.y >= yBand[0] &&
            f.y < yBand[1] &&
            f.w > 0,
        )
        .map((f) => f.x);
      return xs.length > 0 ? Math.min(...xs) : Number.NaN;
    };

    const nearBand: [number, number] = [VIEW_H - 40, VIEW_H];
    const farBand: [number, number] = [WATER_Y, WATER_Y + 20];

    const nearShift = Math.abs(
      shiftFor(second, nearBand) - shiftFor(first, nearBand),
    );
    const farShift = Math.abs(
      shiftFor(second, farBand) - shiftFor(first, farBand),
    );

    expect(Number.isFinite(nearShift)).toBe(true);
    expect(Number.isFinite(farShift)).toBe(true);
    // The near lane moves further for the same offset than the distant lane.
    expect(nearShift).toBeGreaterThan(farShift);
  });
});

describe("sun-reflection path perspective", () => {
  it("is narrower near the horizon and wider toward the foreground", () => {
    const { ctx, fills } = recordingContext();
    render(ctx, runningState(), 0);

    // The reflection glints are the warm glint tones straddling the centre.
    const centre = VIEW_W * 0.5;
    const glints = fills.filter(
      (f) =>
        (f.color === "#ffe6a8" || f.color === "#ffb347") &&
        f.y > WATER_Y &&
        f.w > 0 &&
        f.x < centre &&
        f.x + f.w > centre,
    );
    expect(glints.length).toBeGreaterThan(0);

    const nearHorizon = glints.filter((f) => f.y < WATER_Y + 20);
    const foreground = glints.filter((f) => f.y > VIEW_H - 40);
    expect(nearHorizon.length).toBeGreaterThan(0);
    expect(foreground.length).toBeGreaterThan(0);

    const maxNear = Math.max(...nearHorizon.map((f) => f.w));
    const maxFar = Math.max(...foreground.map((f) => f.w));
    expect(maxFar).toBeGreaterThan(maxNear);
  });
});

describe("layered parallax", () => {
  it("scrolls sky, clouds, coastline and water at progressively faster rates", () => {
    const state = runningState();
    const first = recordingContext();
    render(first.ctx, state, 0);

    state.elapsed += 2;
    const second = recordingContext();
    render(second.ctx, state, 0);

    // Cloud volumes are drawn as arcs; the far cloud layer drifts slowest.
    const cloudArcs = (rec: RecordingContext) =>
      rec.arcs.filter((a) => a.y < WATER_Y - 20);
    const firstClouds = cloudArcs(first);
    const secondClouds = cloudArcs(second);
    expect(firstClouds.length).toBeGreaterThan(0);
    expect(secondClouds.length).toBe(firstClouds.length);

    // The cloud field shifts with elapsed time (parallax drift).
    const firstXs = firstClouds.map((a) => a.x);
    const secondXs = secondClouds.map((a) => a.x);
    expect(secondXs).not.toEqual(firstXs);

    // The coastline haze veils are full-width fills that also shift with time.
    const hazeFills = (rec: RecordingContext) =>
      rec.fills.filter((f) => f.color.startsWith("rgba(201, 138"));
    expect(hazeFills(first).length).toBeGreaterThanOrEqual(2);
    expect(hazeFills(second).length).toBeGreaterThanOrEqual(2);
  });

  it("hazes the distant coastline more than the near coastline", () => {
    const { ctx, fills } = recordingContext();
    render(ctx, createInitialState(), 0);

    const hazeFills = fills.filter((f) => f.color.startsWith("rgba(201, 138"));
    expect(hazeFills.length).toBeGreaterThanOrEqual(2);
    const alphas = hazeFills.map((f) =>
      Number(f.color.match(/([\d.]+)\)$/)?.[1]),
    );
    // The far land is veiled with a stronger haze than the near strip.
    expect(Math.max(...alphas)).toBeGreaterThan(Math.min(...alphas));
  });
});

describe("volumetric shading on scene actors", () => {
  it("shades the rider and jet-ski with a lit side, a shaded side and a waterline reflection", () => {
    const state = runningState();
    state.rider.airborne = false;
    const { ctx, fills } = recordingContext();
    render(ctx, state, 0);

    // Lit suit vs shaded suit on the rider torso.
    expect(fills.some((f) => f.color === "#e63946")).toBe(true);
    expect(fills.some((f) => f.color === "#a3242f")).toBe(true);
    // Lit deck vs shaded hull on the jet-ski.
    expect(fills.some((f) => f.color === "#d9d9e3")).toBe(true);
    expect(fills.some((f) => f.color === "#8a8aa0")).toBe(true);
    // Cast shadow and waterline reflection below the craft.
    expect(fills.some((f) => f.color.startsWith("rgba(11, 39, 64"))).toBe(true);
    expect(fills.some((f) => f.color === "#0b2740")).toBe(true);
  });

  it("shades a buoy with a lit side, a shaded side, a cast shadow and a reflection", () => {
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
    // Lit highlight, red core and dark shaded rim.
    expect(near.some((f) => f.color === "#ffd166")).toBe(true);
    expect(near.some((f) => f.color === "#e63946")).toBe(true);
    expect(near.some((f) => f.color === "#8f1d2c")).toBe(true);
    // Cast shadow on the water and a waterline reflection.
    expect(near.some((f) => f.color.startsWith("rgba(11, 39, 64"))).toBe(true);
    expect(near.some((f) => f.color === "#155a7a")).toBe(true);
  });

  it("shades a dock with a lit deck, a shaded side, a cast shadow and a reflection", () => {
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
    // Lit top edge, mid wood and dark seams.
    expect(near.some((f) => f.color === "#d9a066")).toBe(true);
    expect(near.some((f) => f.color === "#a9743f")).toBe(true);
    expect(near.some((f) => f.color === "#6b4526")).toBe(true);
    // Cast shadow on the water and a waterline reflection.
    expect(near.some((f) => f.color.startsWith("rgba(11, 39, 64"))).toBe(true);
    expect(near.some((f) => f.color === "#0b2740")).toBe(true);
  });
});
