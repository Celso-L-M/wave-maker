/** Logical resolution the game is authored against; scaled to fit the viewport. */
export const VIEW_W = 480;
export const VIEW_H = 270;

/** Water line as a fraction of the logical height. */
export const WATER_LINE_RATIO = 0.72;

/** Rider horizontal anchor (fixed on the left side of the screen). */
export const RIDER_X = 96;

export const GRAVITY = 1500;
export const MAX_FALL = 900;

/** Base scroll speed and how much it grows with distance. */
export const BASE_SPEED = 150;
export const SPEED_PER_METRE = 0.35;
export const MAX_SPEED = 420;

/** Distance metres gained per second at the current speed. */
export const METRES_PER_PX = 0.06;

/** Swell travel speed (px/second) toward the rider. */
export const SWELL_SPEED = 520;

/** Launch impulse range: quick tap vs full charge. */
export const LAUNCH_MIN = 430;
export const LAUNCH_MAX = 900;

/** Charge build rate per second while the wave key is held. */
export const CHARGE_RATE = 1.6;

/** Obstacle spawn cadence (seconds), shrinking as the run progresses. */
export const SPAWN_MIN = 0.9;
export const SPAWN_MAX = 2.1;

export const RIDER_W = 34;
export const RIDER_H = 26;

/** Sun anchor and size, as fractions of the logical viewport. */
export const SUN_X_RATIO = 0.5;
export const SUN_Y_RATIO = 0.46;
export const SUN_RADIUS = 58;

/** Atmospheric haze strength applied to the distant coastline (0..1). */
export const HAZE_FAR = 0.55;
export const HAZE_NEAR = 0.22;
