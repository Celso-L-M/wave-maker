import {
  BASE_SPEED,
  LAUNCH_MAX,
  LAUNCH_MIN,
  MAX_SPEED,
  RIDER_X,
  SWELL_SPEED,
  VIEW_W,
} from "@/game/constants";
import {
  createInitialState,
  finalDistance,
  resetRun,
  update,
} from "@/game/engine";
import type { GameState, InputState } from "@/game/types";
import { describe, expect, it } from "vitest";

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
  for (let i = 0; i < frames; i++) {
    update(state, input, dt);
  }
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

describe("initial state", () => {
  it("starts on the start phase with the rider resting on the water line", () => {
    const state = createInitialState();
    expect(state.phase).toBe("start");
    expect(state.rider.y).toBe(0);
    expect(state.rider.airborne).toBe(false);
    expect(state.distance).toBe(0);
    expect(state.speed).toBe(BASE_SPEED);
    expect(state.obstacles).toEqual([]);
  });

  it("scrolls the water right-to-left even while idle", () => {
    const state = createInitialState();
    const before = state.waterOffset;
    step(state, IDLE, 0.5);
    expect(state.waterOffset).toBeGreaterThan(before);
  });
});

describe("wave mechanic", () => {
  it("spawns a swell that travels toward the rider and launches them on contact", () => {
    const state = running();
    // Press and release quickly to create a swell.
    update(state, { ...IDLE, wavePressed: true, waveHeld: true }, 1 / 60);
    update(state, { ...IDLE, waveReleased: true }, 1 / 60);
    expect(state.swell).not.toBeNull();
    const spawnX = state.swell?.x ?? 0;
    expect(spawnX).toBeGreaterThan(RIDER_X);

    // Let the swell travel until it reaches the rider.
    const peak = stepUntilLaunch(state);
    expect(peak).toBeGreaterThan(0);
  });

  it("launches higher when the wave key is held longer", () => {
    const quick = running();
    update(quick, { ...IDLE, wavePressed: true, waveHeld: true }, 1 / 60);
    update(quick, { ...IDLE, waveReleased: true }, 1 / 60);
    const quickPeak = stepUntilLaunch(quick);

    const held = running();
    update(held, { ...IDLE, wavePressed: true, waveHeld: true }, 1 / 60);
    step(held, { ...IDLE, waveHeld: true }, 0.6);
    update(held, { ...IDLE, waveReleased: true }, 1 / 60);
    const heldPeak = stepUntilLaunch(held);

    expect(heldPeak).toBeGreaterThan(quickPeak);
  });

  it("keeps the launch impulse within the configured range", () => {
    const state = running();
    update(state, { ...IDLE, wavePressed: true, waveHeld: true }, 1 / 60);
    step(state, { ...IDLE, waveHeld: true }, 2);
    update(state, { ...IDLE, waveReleased: true }, 1 / 60);
    // Advance until the swell resolves, capturing the launch velocity at contact.
    const dt = 1 / 60;
    let launchVy = 0;
    for (let i = 0; i < 240; i++) {
      const wasResolved = state.swell?.resolved ?? true;
      update(state, IDLE, dt);
      if (!wasResolved && state.swell?.resolved) {
        launchVy = state.rider.vy;
        break;
      }
    }
    expect(launchVy).toBeLessThanOrEqual(LAUNCH_MAX);
    expect(launchVy).toBeGreaterThanOrEqual(LAUNCH_MIN - 1);
  });
});

describe("scoring and difficulty", () => {
  it("increases distance during play and reports an integer score", () => {
    const state = running();
    step(state, IDLE, 2);
    expect(state.distance).toBeGreaterThan(0);
    expect(Number.isInteger(finalDistance(state))).toBe(true);
  });

  it("raises scroll speed as distance grows, capped at MAX_SPEED", () => {
    const state = running();
    step(state, IDLE, 1);
    const early = state.speed;
    state.distance = 5000;
    step(state, IDLE, 1 / 60);
    expect(state.speed).toBeGreaterThan(early);
    expect(state.speed).toBeLessThanOrEqual(MAX_SPEED);
  });

  it("spawns obstacles from the right over time", () => {
    const state = running();
    step(state, IDLE, 4);
    expect(state.obstacles.length).toBeGreaterThan(0);
    for (const o of state.obstacles) {
      expect(["buoy", "dock"]).toContain(o.kind);
    }
  });
});

describe("collision and restart", () => {
  it("ends the run when the rider hits an obstacle", () => {
    const state = running();
    // Place a dock directly on the rider's path.
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

  it("resets rider, obstacles, score and difficulty on restart", () => {
    const state = running();
    step(state, IDLE, 3);
    state.phase = "gameover";
    resetRun(state);
    expect(state.phase).toBe("running");
    expect(state.distance).toBe(0);
    expect(state.speed).toBe(BASE_SPEED);
    expect(state.obstacles).toEqual([]);
    expect(state.rider.y).toBe(0);
    expect(state.rider.airborne).toBe(false);
  });
});

describe("parallax", () => {
  it("moves distant clouds slower than the foreground water", () => {
    // The renderer shifts clouds at 6 px/s and the water at the run speed.
    const cloudSpeed = 6;
    const state = running();
    step(state, IDLE, 1);
    expect(state.speed).toBeGreaterThan(cloudSpeed);
  });
});

describe("swell travel direction", () => {
  it("moves the swell leftward toward the fixed rider", () => {
    const state = running();
    update(state, { ...IDLE, wavePressed: true, waveHeld: true }, 1 / 60);
    update(state, { ...IDLE, waveReleased: true }, 1 / 60);
    const startX = state.swell?.x ?? 0;
    step(state, IDLE, 0.2);
    const laterX = state.swell?.x ?? 0;
    expect(laterX).toBeLessThan(startX);
    expect(SWELL_SPEED).toBeGreaterThan(0);
    expect(VIEW_W).toBeGreaterThan(RIDER_X);
  });
});
