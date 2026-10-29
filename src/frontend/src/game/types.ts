export type GamePhase = "start" | "running" | "gameover";

export interface Swell {
  /** World x position of the swell crest (screen px). */
  x: number;
  /** Charge strength 0..1 captured at release; drives launch height. */
  power: number;
  /** True once the swell has already launched the rider. */
  resolved: boolean;
}

export interface Obstacle {
  id: number;
  kind: "buoy" | "dock";
  x: number;
  /** Vertical offset of the obstacle base relative to the water line. */
  yOffset: number;
  width: number;
  height: number;
  cleared: boolean;
}

export interface Rider {
  /** Vertical offset above the water line (positive = airborne). */
  y: number;
  vy: number;
  airborne: boolean;
  /** Visual tilt in radians, driven by vertical motion. */
  tilt: number;
}

export interface GameState {
  phase: GamePhase;
  /** Distance travelled in metres (integer score). */
  distance: number;
  /** Current scroll speed in px/second. */
  speed: number;
  /** Water scroll offset for the foreground layer. */
  waterOffset: number;
  rider: Rider;
  swell: Swell | null;
  /** Charge accumulated while the wave key is held, 0..1. */
  charge: number;
  charging: boolean;
  obstacles: Obstacle[];
  /** Seconds until the next obstacle spawns. */
  spawnTimer: number;
  /** Seconds elapsed in the current run. */
  elapsed: number;
  /** Screen-shake magnitude in px, decays each frame. */
  shake: number;
  /** Flash timer for the wipeout impact. */
  impact: number;
}

export interface InputState {
  waveHeld: boolean;
  /** Set true for one frame when the wave key is first pressed. */
  wavePressed: boolean;
  /** Set true for one frame when the wave key is released. */
  waveReleased: boolean;
}
