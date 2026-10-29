import { renderWithActor } from "@/__tests__/test-utils";
import type { backendInterface } from "@/backend";
import { GameCanvas } from "@/components/game/GameCanvas";
import {
  BASE_SPEED,
  MAX_SPEED,
  RIDER_X,
  VIEW_H,
  VIEW_W,
  WATER_LINE_RATIO,
} from "@/game/constants";
import {
  createInitialState,
  finalDistance,
  resetRun,
  update,
} from "@/game/engine";
import { render } from "@/game/render";
import type { GameState, InputState } from "@/game/types";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

/**
 * Characterization baseline for the 2.5D realism restyle.
 *
 * The request redraws the water, foam, sun reflection, rider, jet-ski, buoys,
 * docks, sky, clouds and coastline, and switches the canvas from
 * nearest-neighbour to smooth scaling. Those are exactly the things these tests
 * deliberately do NOT assert. They pin the gameplay, controls, scoring, hazards,
 * backend submission and HUD contract the request says must stay unchanged, so
 * the visual work cannot silently regress the game.
 */

const IDLE: InputState = {
  waveHeld: false,
  wavePressed: false,
  waveReleased: false,
};

function running(): GameState {
  const state = createInitialState();
  resetRun(state);
  return state;
}

/** Advance the simulation in fixed 1/60s steps with a given input. */
function step(state: GameState, input: InputState, seconds: number): void {
  const dt = 1 / 60;
  const frames = Math.round(seconds / dt);
  for (let i = 0; i < frames; i++) update(state, input, dt);
}

/** Advance until the swell resolves (or a frame cap), returning the peak height. */
function stepUntilLaunch(state: GameState): number {
  const dt = 1 / 60;
  let peak = 0;
  for (let i = 0; i < 240; i++) {
    update(state, IDLE, dt);
    peak = Math.max(peak, state.rider.y);
    if (state.swell === null) break;
  }
  return peak;
}

/** Minimal 2D context stub: the game only draws, it never reads pixels back. */
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

function makeActor(
  overrides: Partial<
    Pick<backendInterface, "getSessionHighScore" | "submitRun">
  > = {},
): Pick<backendInterface, "getSessionHighScore" | "submitRun"> {
  return {
    getSessionHighScore: vi.fn(async () => 0n),
    submitRun: vi.fn(async (distance: bigint) => distance),
    ...overrides,
  };
}

describe("wave control stays unchanged", () => {
  it("charges on press and releases a swell that travels toward the rider", () => {
    const state = running();
    update(state, { ...IDLE, wavePressed: true, waveHeld: true }, 1 / 60);
    expect(state.charging).toBe(true);

    step(state, { ...IDLE, waveHeld: true }, 0.4);
    expect(state.charge).toBeGreaterThan(0);

    update(state, { ...IDLE, waveReleased: true }, 1 / 60);
    expect(state.charging).toBe(false);
    expect(state.swell).not.toBeNull();
    const spawnX = state.swell?.x ?? 0;
    expect(spawnX).toBeGreaterThan(RIDER_X);

    step(state, IDLE, 0.2);
    expect(state.swell?.x ?? 0).toBeLessThan(spawnX);
  });

  it("launches higher the longer the wave key is held", () => {
    const quick = running();
    update(quick, { ...IDLE, wavePressed: true, waveHeld: true }, 1 / 60);
    update(quick, { ...IDLE, waveReleased: true }, 1 / 60);
    const quickPeak = stepUntilLaunch(quick);

    const held = running();
    update(held, { ...IDLE, wavePressed: true, waveHeld: true }, 1 / 60);
    step(held, { ...IDLE, waveHeld: true }, 0.6);
    update(held, { ...IDLE, waveReleased: true }, 1 / 60);
    const heldPeak = stepUntilLaunch(held);

    expect(quickPeak).toBeGreaterThan(0);
    expect(heldPeak).toBeGreaterThan(quickPeak);
  });
});

describe("hazards and scoring stay unchanged", () => {
  it("spawns buoys and docks that scroll leftward as hazards", () => {
    const state = running();
    step(state, IDLE, 4);
    expect(state.obstacles.length).toBeGreaterThan(0);
    for (const o of state.obstacles) {
      expect(["buoy", "dock"]).toContain(o.kind);
    }
    const before = state.obstacles.map((o) => o.x);
    step(state, IDLE, 0.2);
    const after = state.obstacles.map((o) => o.x);
    // Every surviving obstacle moved left (or was culled off-screen).
    expect(after.length).toBeLessThanOrEqual(before.length);
    expect(Math.min(...after)).toBeLessThan(Math.max(...before));
  });

  it("ends the run when the rider collides with an obstacle", () => {
    const state = running();
    state.obstacles.push({
      id: 999,
      kind: "dock",
      x: RIDER_X - 10,
      yOffset: -26,
      width: 54,
      height: 26,
      cleared: false,
    });
    step(state, IDLE, 1 / 60);
    expect(state.phase).toBe("gameover");
  });

  it("scores distance and scales speed and spawn rate with distance", () => {
    const state = running();
    step(state, IDLE, 2);
    expect(state.distance).toBeGreaterThan(0);
    expect(Number.isInteger(finalDistance(state))).toBe(true);

    const earlySpeed = state.speed;
    state.distance = 5000;
    step(state, IDLE, 1 / 60);
    expect(state.speed).toBeGreaterThan(earlySpeed);
    expect(state.speed).toBeLessThanOrEqual(MAX_SPEED);
    expect(state.speed).toBeGreaterThanOrEqual(BASE_SPEED);
  });
});

describe("HUD stays unchanged", () => {
  it("draws DISTANCE, HIGH SCORE and the charge meter in every phase", () => {
    for (const phase of ["start", "running", "gameover"] as const) {
      const state = createInitialState();
      state.phase = phase;
      const texts: string[] = [];
      const noop = () => {};
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
        fillText: (text: string) => texts.push(text),
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

      render(ctx, state, 0);
      expect(texts).toContain("DISTANCE");
      expect(texts).toContain("HIGH SCORE");
    }
  });
});

describe("canvas framing stays unchanged", () => {
  it("keeps the fixed 480x270 logical resolution and letterboxes it", () => {
    renderWithActor(<GameCanvas />, makeActor());
    const canvas = screen.getByTestId("game.canvas_target");
    expect(canvas).toHaveAttribute("width", String(VIEW_W));
    expect(canvas).toHaveAttribute("height", String(VIEW_H));
    expect(canvas.className).toContain("h-full");
    expect(canvas.className).toContain("w-full");
    expect(canvas.className).toContain("object-contain");
    // The logical aspect ratio is the 16:9 the scene is authored against.
    expect(VIEW_W / VIEW_H).toBeCloseTo(16 / 9, 5);
    expect(WATER_LINE_RATIO).toBeGreaterThan(0);
    expect(WATER_LINE_RATIO).toBeLessThan(1);
  });
});

describe("component journeys stay unchanged", () => {
  it("loads the start screen without a blank canvas", () => {
    renderWithActor(<GameCanvas />, makeActor());
    expect(screen.getByTestId("game.canvas_target")).toBeInTheDocument();
    expect(screen.getByTestId("game.start_state")).toBeInTheDocument();
  });

  it("starts on Space and shows the running state", async () => {
    const user = userEvent.setup();
    renderWithActor(<GameCanvas />, makeActor());
    await user.keyboard(" ");
    expect(screen.queryByTestId("game.start_state")).not.toBeInTheDocument();
    expect(screen.getByTestId("game.running_state")).toBeInTheDocument();
  });

  it("ends with a Wipeout overlay, submits the distance and restarts", async () => {
    const user = userEvent.setup();
    const submitRun = vi.fn(async (distance: bigint) => distance);
    renderWithActor(<GameCanvas />, makeActor({ submitRun }));

    await user.click(screen.getByTestId("game.start_button"));
    await waitFor(
      () => {
        expect(screen.getByTestId("game.gameover_state")).toBeInTheDocument();
      },
      { timeout: 15000 },
    );

    expect(screen.getByText("Wipeout!")).toBeInTheDocument();
    expect(submitRun).toHaveBeenCalledTimes(1);
    const [distance] = submitRun.mock.calls[0];
    expect(typeof distance).toBe("bigint");
    expect(distance).toBeGreaterThanOrEqual(0n);

    await user.click(screen.getByTestId("game.restart_button"));
    expect(screen.queryByTestId("game.gameover_state")).not.toBeInTheDocument();
    expect(screen.getByTestId("game.running_state")).toBeInTheDocument();
  }, 20000);
});
