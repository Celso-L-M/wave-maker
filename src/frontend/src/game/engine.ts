import {
  BASE_SPEED,
  CHARGE_RATE,
  GRAVITY,
  LAUNCH_MAX,
  LAUNCH_MIN,
  MAX_FALL,
  MAX_SPEED,
  METRES_PER_PX,
  RIDER_H,
  RIDER_W,
  RIDER_X,
  SPAWN_MAX,
  SPAWN_MIN,
  SPEED_PER_METRE,
  SWELL_SPEED,
  VIEW_H,
  VIEW_W,
  WATER_LINE_RATIO,
} from "./constants";
import type { GameState, InputState, Obstacle } from "./types";

let obstacleSeq = 0;

export function createInitialState(): GameState {
  return {
    phase: "start",
    distance: 0,
    speed: BASE_SPEED,
    waterOffset: 0,
    rider: { y: 0, vy: 0, airborne: false, tilt: 0 },
    swell: null,
    charge: 0,
    charging: false,
    obstacles: [],
    spawnTimer: 1.4,
    elapsed: 0,
    shake: 0,
    impact: 0,
  };
}

export function resetRun(state: GameState): void {
  const fresh = createInitialState();
  fresh.phase = "running";
  Object.assign(state, fresh);
}

function spawnObstacle(state: GameState): void {
  const kind: Obstacle["kind"] = Math.random() < 0.5 ? "buoy" : "dock";
  const width = kind === "buoy" ? 22 : 54;
  const height = kind === "buoy" ? 34 : 26;
  state.obstacles.push({
    id: obstacleSeq++,
    kind,
    x: VIEW_W + width,
    yOffset: kind === "buoy" ? -height : -height + 4,
    width,
    height,
    cleared: false,
  });
}

function nextSpawnDelay(state: GameState): number {
  const t = Math.min(1, state.distance / 900);
  const base = SPAWN_MAX - (SPAWN_MAX - SPAWN_MIN) * t;
  return base * (0.7 + Math.random() * 0.6);
}

/** AABB overlap between the rider box and an obstacle box. */
function riderHitsObstacle(state: GameState, o: Obstacle): boolean {
  const waterY = VIEW_H * WATER_LINE_RATIO;
  const riderTop = waterY - state.rider.y - RIDER_H;
  const riderBottom = waterY - state.rider.y;
  const riderLeft = RIDER_X - RIDER_W / 2;
  const riderRight = RIDER_X + RIDER_W / 2;

  const oTop = waterY + o.yOffset;
  const oBottom = oTop + o.height;
  const oLeft = o.x;
  const oRight = o.x + o.width;

  // Shrink the rider box slightly so grazing the very edge feels fair.
  const pad = 4;
  return (
    riderRight - pad > oLeft &&
    riderLeft + pad < oRight &&
    riderBottom - pad > oTop &&
    riderTop + pad < oBottom
  );
}

export function update(state: GameState, input: InputState, dt: number): void {
  if (state.phase !== "running") {
    // Idle drift so the start / game-over screens still feel alive.
    state.waterOffset += BASE_SPEED * 0.4 * dt;
    state.shake = Math.max(0, state.shake - dt * 40);
    state.impact = Math.max(0, state.impact - dt * 2);
    return;
  }

  state.elapsed += dt;

  // Speed ramps with distance.
  state.speed = Math.min(
    MAX_SPEED,
    BASE_SPEED + state.distance * SPEED_PER_METRE,
  );
  state.waterOffset += state.speed * dt;
  state.distance += state.speed * dt * METRES_PER_PX;

  // --- Wave charge / release ---
  if (input.wavePressed && !state.swell && !state.charging) {
    state.charging = true;
    state.charge = 0;
  }
  if (state.charging && input.waveHeld) {
    state.charge = Math.min(1, state.charge + CHARGE_RATE * dt);
  }
  if (state.charging && input.waveReleased) {
    state.charging = false;
    state.swell = {
      x: VIEW_W + 20,
      power: Math.max(0.18, state.charge),
      resolved: false,
    };
    state.charge = 0;
  }

  // --- Swell travel ---
  if (state.swell) {
    state.swell.x -= SWELL_SPEED * dt;
    if (!state.swell.resolved && state.swell.x <= RIDER_X + 6) {
      state.swell.resolved = true;
      const power = state.swell.power;
      state.rider.vy = LAUNCH_MIN + (LAUNCH_MAX - LAUNCH_MIN) * power;
      state.rider.airborne = true;
      state.shake = Math.max(state.shake, 3 + power * 4);
    }
    if (state.swell.x < -40) {
      state.swell = null;
    }
  }

  // --- Rider physics ---
  const rider = state.rider;
  if (rider.airborne || rider.y > 0) {
    rider.vy -= GRAVITY * dt;
    rider.vy = Math.max(rider.vy, -MAX_FALL);
    rider.y += rider.vy * dt;
    if (rider.y <= 0) {
      rider.y = 0;
      rider.vy = 0;
      rider.airborne = false;
    }
  }
  // Tilt follows vertical velocity while airborne.
  const targetTilt = rider.airborne
    ? Math.max(-0.5, Math.min(0.5, -rider.vy / 1400))
    : 0;
  rider.tilt += (targetTilt - rider.tilt) * Math.min(1, dt * 8);

  // --- Obstacles ---
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnObstacle(state);
    state.spawnTimer = nextSpawnDelay(state);
  }
  for (const o of state.obstacles) {
    o.x -= state.speed * dt;
  }
  state.obstacles = state.obstacles.filter((o) => o.x + o.width > -20);

  // --- Collision ---
  for (const o of state.obstacles) {
    if (!o.cleared && riderHitsObstacle(state, o)) {
      state.phase = "gameover";
      state.shake = 10;
      state.impact = 1;
      state.charging = false;
      state.charge = 0;
      state.swell = null;
      return;
    }
  }

  state.shake = Math.max(0, state.shake - dt * 40);
  state.impact = Math.max(0, state.impact - dt * 2);
}

/** Final integer distance for the run. */
export function finalDistance(state: GameState): number {
  return Math.floor(state.distance);
}
