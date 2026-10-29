import {
  HAZE_FAR,
  HAZE_NEAR,
  RIDER_H,
  RIDER_W,
  RIDER_X,
  SUN_RADIUS,
  SUN_X_RATIO,
  SUN_Y_RATIO,
  VIEW_H,
  VIEW_W,
  WATER_LINE_RATIO,
} from "./constants";
import type { GameState, Obstacle } from "./types";

const WATER_Y = VIEW_H * WATER_LINE_RATIO;
const SUN_X = VIEW_W * SUN_X_RATIO;
const SUN_Y = VIEW_H * SUN_Y_RATIO;

/**
 * Sunset palette. The scene is shaded with smooth gradients and soft volumes
 * rather than hard pixel bands, so most colours are used as gradient stops or
 * translucent washes. The named tones below are also the observable contract
 * the render tests assert on, so they stay stable.
 */
const P = {
  // Sky gradient stops: indigo dusk → violet → magenta → coral → amber horizon.
  skyTop: "#1b1440",
  skyUpper: "#3a1f63",
  skyMid: "#7a2a72",
  skyWarm: "#c33f63",
  skyCoral: "#f06a3a",
  skyAmber: "#ffb347",
  skyHorizon: "#ffd98a",
  // Sun.
  sunCore: "#fff6c8",
  sunBody: "#ffd166",
  sunEdge: "#ff9a4d",
  sunHalo: "#ff8a3d",
  // Clouds.
  cloudShade: "#4a2a5c",
  cloudBody: "#8a4f7d",
  cloudLit: "#f0b7c8",
  cloudRim: "#ffd9a8",
  // Coastline.
  landFar: "#4a2a63",
  landNear: "#2a1547",
  landHaze: "#c98a9a",
  palm: "#1c0f33",
  lighthouse: "#1c0f33",
  lighthouseLit: "#ffd166",
  // Water.
  waterDeep: "#0b2740",
  waterMid: "#155a7a",
  waterShallow: "#2fa3b0",
  waterCrest: "#6fd6da",
  foam: "#eafcff",
  foamDim: "#9fe3e8",
  glint: "#ffe6a8",
  glintDim: "#ffb347",
  // Obstacles.
  buoyRed: "#e63946",
  buoyDark: "#8f1d2c",
  buoyLight: "#ffd166",
  wood: "#a9743f",
  woodDark: "#6b4526",
  woodLight: "#d9a066",
  // Rider.
  riderBody: "#2b2b3a",
  riderSuit: "#e63946",
  riderSuitDark: "#a3242f",
  riderSkin: "#f2b48a",
  riderSkinDark: "#c98a63",
  jet: "#d9d9e3",
  jetDark: "#8a8aa0",
  jetAccent: "#3aa0d9",
  // HUD.
  hudBg: "#141428",
  hudPanel: "#1e1e3a",
  hudBorder: "#e8e8f0",
  hudEdge: "#5a5a80",
  hudText: "#f4f4ff",
  hudAccent: "#ffd166",
  hudLabel: "#ffb347",
} as const;

/**
 * Perspective model for the receding water plane.
 *
 * `depth` runs 0 at the horizon (the water line) to 1 at the bottom of the
 * canvas. Screen y is compressed near the horizon and stretched toward the
 * foreground, so equal steps of depth cover more screen space as they near the
 * viewer. Everything drawn on the water — lanes, crests, foam, glints, hazards
 * — is placed through this mapping so the surface reads as a receding 3D plane.
 */
const DEPTH_SPAN = VIEW_H - WATER_Y;

/** Screen y for a normalised depth (0 = horizon, 1 = foreground). */
function depthY(depth: number): number {
  const d = Math.max(0, Math.min(1, depth));
  // Quadratic ease: far water is compressed, near water is stretched.
  return WATER_Y + d * d * DEPTH_SPAN;
}

/** Scale factor for an object at a given depth (far small, near large). */
function depthScale(depth: number): number {
  const d = Math.max(0, Math.min(1, depth));
  return 0.35 + d * 0.85;
}

/** Scroll multiplier for a depth lane: nearer water moves faster. */
function depthSpeed(depth: number): number {
  const d = Math.max(0, Math.min(1, depth));
  return 0.25 + d * 1.35;
}

/**
 * Thin accent fill. The scene's silhouettes are drawn as smooth curved paths;
 * these fills are only ever used for narrow highlights, bands, seams and
 * reflections so the rounded shapes are never covered by a hard rectangle.
 */
function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Deterministic pseudo-random from an integer seed. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

/** Vertical gradient fill across a rectangle. */
function vGradient(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  stops: Array<[number, string]>,
): void {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/** Filled circle helper (arc-based so it works on any 2D context). */
function disc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Soft volumetric disc: a radial gradient from an opaque core to a transparent
 * rim, used for haze, bloom and feathered foam so edges never read as hard.
 */
function softDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  inner: string,
  outer: string,
): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Rounded-rectangle path (arc-based corners, no ellipse dependency). */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.arc(x + w - rad, y + rad, rad, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arc(x + w - rad, y + h - rad, rad, 0, Math.PI / 2);
  ctx.lineTo(x + rad, y + h);
  ctx.arc(x + rad, y + h - rad, rad, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + rad);
  ctx.arc(x + rad, y + rad, rad, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

/** Filled rounded rectangle. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
): void {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * Rounded rectangle shaded with a vertical gradient, so a curved silhouette
 * reads as a lit top melting into a shaded underside instead of a flat block.
 */
function roundRectShaded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  top: string,
  bottom: string,
): void {
  roundRectPath(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fill();
}

function drawSky(ctx: CanvasRenderingContext2D, t: number): void {
  // One smooth multi-stop gradient from indigo dusk to an amber horizon.
  vGradient(ctx, 0, 0, VIEW_W, WATER_Y, [
    [0, P.skyTop],
    [0.22, P.skyUpper],
    [0.42, P.skyMid],
    [0.6, P.skyWarm],
    [0.74, P.skyCoral],
    [0.88, P.skyAmber],
    [1, P.skyHorizon],
  ]);

  // Volumetric haze bands: broad translucent washes that soften the gradient
  // into layered air rather than a flat ramp.
  const hazeBands: Array<[number, number, string]> = [
    [0.08, 0.34, "rgba(58, 31, 99, 0.35)"],
    [0.34, 0.58, "rgba(122, 42, 114, 0.28)"],
    [0.56, 0.78, "rgba(195, 63, 99, 0.22)"],
    [0.72, 0.94, "rgba(240, 106, 58, 0.24)"],
  ];
  for (const [from, to, color] of hazeBands) {
    const y0 = VIEW_H * from;
    const y1 = VIEW_H * to;
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, VIEW_W, y1 - y0);
  }

  // Warm bloom pooling along the waterline.
  const glow = ctx.createLinearGradient(0, VIEW_H * 0.42, 0, WATER_Y);
  glow.addColorStop(0, "rgba(255, 179, 71, 0)");
  glow.addColorStop(0.7, "rgba(255, 190, 110, 0.28)");
  glow.addColorStop(1, "rgba(255, 217, 138, 0.6)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, VIEW_H * 0.42, VIEW_W, WATER_Y - VIEW_H * 0.42);

  drawSun(ctx);
  drawClouds(ctx, t);
}

function drawSun(ctx: CanvasRenderingContext2D): void {
  const r = SUN_RADIUS;

  // Wide atmospheric haze bleeding into the surrounding sky.
  const haze = ctx.createRadialGradient(
    SUN_X,
    SUN_Y,
    r * 0.4,
    SUN_X,
    SUN_Y,
    r * 3,
  );
  haze.addColorStop(0, "rgba(255, 170, 90, 0.5)");
  haze.addColorStop(0.45, "rgba(255, 150, 80, 0.2)");
  haze.addColorStop(1, "rgba(255, 140, 70, 0)");
  ctx.fillStyle = haze;
  ctx.fillRect(SUN_X - r * 3, SUN_Y - r * 3, r * 6, r * 6);

  // Soft glowing disc: a radial gradient from a bright core to a warm rim.
  const discGrad = ctx.createRadialGradient(
    SUN_X,
    SUN_Y - r * 0.2,
    r * 0.1,
    SUN_X,
    SUN_Y,
    r,
  );
  discGrad.addColorStop(0, P.sunCore);
  discGrad.addColorStop(0.55, P.sunBody);
  discGrad.addColorStop(1, P.sunEdge);
  ctx.fillStyle = discGrad;
  ctx.beginPath();
  ctx.arc(SUN_X, SUN_Y, r, 0, Math.PI * 2);
  ctx.fill();

  // Gentle haze veil over the lower half so the disc melts into the horizon.
  const veil = ctx.createLinearGradient(0, SUN_Y, 0, SUN_Y + r);
  veil.addColorStop(0, "rgba(255, 179, 71, 0)");
  veil.addColorStop(1, "rgba(255, 179, 71, 0.55)");
  ctx.fillStyle = veil;
  ctx.beginPath();
  ctx.arc(SUN_X, SUN_Y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawClouds(ctx: CanvasRenderingContext2D, t: number): void {
  // Three parallax depths, each drifting slower than the water.
  const layers: Array<{
    speed: number;
    y: number;
    scale: number;
    seed: number;
  }> = [
    { speed: 4, y: 0.15, scale: 0.7, seed: 11 },
    { speed: 8, y: 0.25, scale: 1, seed: 27 },
    { speed: 13, y: 0.35, scale: 1.3, seed: 43 },
  ];
  for (const layer of layers) {
    const span = VIEW_W + 200;
    const shift = (t * layer.speed) % span;
    for (let i = 0; i < 3; i++) {
      const seed = layer.seed + i * 53;
      let x = i * (span / 3) + hash(seed) * 60 - shift;
      if (x < -140) x += span;
      drawCloud(
        ctx,
        x,
        VIEW_H * layer.y,
        layer.scale * (0.8 + hash(seed + 7) * 0.5),
      );
    }
  }
}

function drawCloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
): void {
  const w = 54 * s;
  const h = 14 * s;

  // Soft shaded underside, feathered so the volume has no hard edge.
  softDisc(
    ctx,
    x + w * 0.5,
    y + h * 0.4,
    h * 0.85,
    "rgba(74, 42, 92, 0.55)",
    "rgba(74, 42, 92, 0)",
  );

  // Rounded body volumes.
  disc(ctx, x + w * 0.32, y, h * 0.62, P.cloudBody);
  disc(ctx, x + w * 0.62, y - h * 0.1, h * 0.55, P.cloudBody);
  disc(ctx, x + w * 0.48, y + h * 0.05, h * 0.6, P.cloudBody);

  // Lit tops catching the low sun.
  disc(ctx, x + w * 0.34, y - h * 0.28, h * 0.34, P.cloudLit);
  disc(ctx, x + w * 0.6, y - h * 0.32, h * 0.28, P.cloudLit);

  // Warm rim light on the sun-facing edge.
  disc(ctx, x + w * 0.46, y - h * 0.34, h * 0.2, P.cloudRim);
}

function drawShoreline(ctx: CanvasRenderingContext2D, t: number): void {
  const baseY = WATER_Y - 4;
  const span = VIEW_W + 240;

  // Farthest land mass (slowest), hazed toward the sky so it reads distant.
  const shiftFar = (t * 8) % span;
  ctx.fillStyle = P.landFar;
  ctx.beginPath();
  ctx.moveTo(-shiftFar, baseY);
  for (let x = -shiftFar; x <= VIEW_W + 240; x += 44) {
    const h = 8 + hash(Math.floor((x + shiftFar) / 44)) * 12;
    ctx.lineTo(x, baseY - h);
  }
  ctx.lineTo(VIEW_W + 240, baseY);
  ctx.closePath();
  ctx.fill();
  // Atmospheric haze veil over the far land.
  ctx.fillStyle = `rgba(201, 138, 154, ${HAZE_FAR})`;
  ctx.fillRect(0, baseY - 22, VIEW_W, 22);

  // Nearer land strip, softer haze so it reads closer and darker.
  const shiftNear = (t * 16) % span;
  ctx.fillStyle = P.landNear;
  ctx.beginPath();
  ctx.moveTo(-shiftNear, baseY + 2);
  for (let x = -shiftNear; x <= VIEW_W + 240; x += 34) {
    const h = 5 + hash(Math.floor((x + shiftNear) / 34) + 99) * 9;
    ctx.lineTo(x, baseY + 2 - h);
  }
  ctx.lineTo(VIEW_W + 240, baseY + 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = `rgba(201, 138, 154, ${HAZE_NEAR})`;
  ctx.fillRect(0, baseY - 14, VIEW_W, 16);

  // Lighthouse landmark on the near strip.
  let lhX = (VIEW_W * 0.72 - shiftNear) % span;
  if (lhX < -30) lhX += span;
  drawLighthouse(ctx, lhX, baseY + 2);

  // Palm silhouettes on the near strip.
  for (let i = 0; i < 7; i++) {
    const seed = i * 37 + 5;
    let x = (i * 82 + 24 - shiftNear) % span;
    if (x < -40) x += span;
    drawPalm(ctx, x, baseY + 2, 0.8 + hash(seed) * 0.5);
  }
}

function drawLighthouse(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
): void {
  const h = 30;
  // Tapered tower with a soft lit face.
  ctx.fillStyle = P.lighthouse;
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.lineTo(x + 1.5, baseY - h);
  ctx.lineTo(x + 5.5, baseY - h);
  ctx.lineTo(x + 7, baseY);
  ctx.closePath();
  ctx.fill();
  px(ctx, x + 1, baseY - h + 4, 5, 3, P.lighthouseLit);
  // Lantern room.
  roundRect(ctx, x - 2, baseY - h - 6, 11, 6, 2, P.lighthouse);
  px(ctx, x + 1, baseY - h - 5, 5, 4, P.lighthouseLit);
  // Roof.
  roundRect(ctx, x - 1, baseY - h - 9, 9, 3, 1.5, P.lighthouse);
  // Warm beacon glow with a soft halo.
  const glow = ctx.createRadialGradient(
    x + 3,
    baseY - h - 3,
    1,
    x + 3,
    baseY - h - 3,
    16,
  );
  glow.addColorStop(0, "rgba(255, 209, 102, 0.7)");
  glow.addColorStop(0.5, "rgba(255, 209, 102, 0.25)");
  glow.addColorStop(1, "rgba(255, 209, 102, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - 14, baseY - h - 19, 34, 34);
}

function drawPalm(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  s: number,
): void {
  const trunkH = 26 * s;
  // Curved trunk: a tapered capsule leaning with the wind.
  roundRect(ctx, x, baseY - trunkH, 3 * s, trunkH, 1.5 * s, P.palm);
  const topY = baseY - trunkH;
  // Fronds fanning from the crown, drawn as thin curved capsules.
  px(ctx, x - 8 * s, topY - 2, 10 * s, 2 * s, P.palm);
  px(ctx, x + 2 * s, topY - 2, 10 * s, 2 * s, P.palm);
  px(ctx, x - 5 * s, topY - 6 * s, 8 * s, 2 * s, P.palm);
  px(ctx, x + 1 * s, topY - 6 * s, 8 * s, 2 * s, P.palm);
  px(ctx, x - 1 * s, topY - 8 * s, 4 * s, 3 * s, P.palm);
}

/**
 * The receding water plane.
 *
 * The body is one smooth depth gradient. On top of it, everything is placed
 * through `depthY`/`depthScale`/`depthSpeed` so crests, foam, ripples and the
 * sun-reflection path form depth lanes: tightly packed and slow near the
 * horizon, spread out, larger and faster toward the foreground.
 */
function drawWater(ctx: CanvasRenderingContext2D, state: GameState): void {
  const off = state.waterOffset;

  // Smooth depth gradient: deep near the horizon, lighter in the foreground.
  vGradient(ctx, 0, WATER_Y, VIEW_W, VIEW_H - WATER_Y, [
    [0, P.waterMid],
    [0.18, P.waterDeep],
    [0.55, P.waterDeep],
    [0.82, P.waterMid],
    [1, P.waterShallow],
  ]);

  // Warm horizon glow bleeding from the sky into the top of the water.
  const bleed = ctx.createLinearGradient(0, WATER_Y, 0, WATER_Y + 26);
  bleed.addColorStop(0, "rgba(255, 217, 138, 0.5)");
  bleed.addColorStop(0.5, "rgba(255, 179, 71, 0.18)");
  bleed.addColorStop(1, "rgba(255, 179, 71, 0)");
  ctx.fillStyle = bleed;
  ctx.fillRect(0, WATER_Y, VIEW_W, 26);

  drawSunPath(ctx, off);
  drawCrestLanes(ctx, off);
  drawFoamLine(ctx, off);
  drawRippleLanes(ctx, off);
}

/**
 * Sun-reflection path. It is narrow at the horizon and fans out toward the
 * foreground, following the perspective of the water plane, and its glints
 * grow and spread as they approach the viewer. A soft vertical column of light
 * ties the individual glints into one continuous shimmering path.
 */
function drawSunPath(ctx: CanvasRenderingContext2D, off: number): void {
  // Continuous soft column beneath the sun, widening toward the viewer.
  const column = ctx.createLinearGradient(0, WATER_Y, 0, VIEW_H);
  column.addColorStop(0, "rgba(255, 230, 168, 0.32)");
  column.addColorStop(0.5, "rgba(255, 179, 71, 0.16)");
  column.addColorStop(1, "rgba(255, 179, 71, 0)");
  ctx.fillStyle = column;
  ctx.beginPath();
  ctx.moveTo(SUN_X - 8, WATER_Y);
  ctx.lineTo(SUN_X + 8, WATER_Y);
  ctx.lineTo(SUN_X + 52, VIEW_H);
  ctx.lineTo(SUN_X - 52, VIEW_H);
  ctx.closePath();
  ctx.fill();

  const rows = 14;
  for (let row = 0; row < rows; row++) {
    const depth = (row + 0.5) / rows;
    const y = depthY(depth);
    if (y > VIEW_H) break;
    const scale = depthScale(depth);
    const wob = Math.sin((y + off * 0.4) * 0.12) * 6 * scale;
    // Width grows with depth: a narrow thread at the horizon, a wide band near.
    const w = 10 + depth * 74;
    const flick = 0.55 + 0.45 * Math.abs(Math.sin((y + off) * 0.08));
    // Soft feathered halo around each glint so the path reads as shimmer.
    softDisc(
      ctx,
      SUN_X + wob,
      y + 1,
      w * 0.6,
      "rgba(255, 230, 168, 0.22)",
      "rgba(255, 230, 168, 0)",
    );
    // The glint itself is a thin highlight riding the soft halo, so the
    // reflection reads as a continuous shimmer rather than a block.
    px(
      ctx,
      SUN_X - w / 2 + wob,
      y,
      w,
      2 + scale * 2,
      row % 2 === 0 ? P.glint : P.glintDim,
    );
    px(ctx, SUN_X - w / 4 + wob, y + 3 + scale * 2, w / 2, 2, P.glintDim);
    if (flick > 0.8) {
      px(ctx, SUN_X - 4 * scale + wob, y - 2, 8 * scale, 2, P.foam);
    }
  }
}

/** Wave crests as depth lanes: closer lanes are larger and scroll faster. */
function drawCrestLanes(ctx: CanvasRenderingContext2D, off: number): void {
  const lanes = 5;
  for (let lane = 0; lane < lanes; lane++) {
    const depth = (lane + 0.5) / lanes;
    const y = depthY(depth);
    if (y > VIEW_H) break;
    const scale = depthScale(depth);
    const speed = depthSpeed(depth);
    const spacing = 64 * scale;
    const shift = (off * speed) % spacing;
    const crestW = 30 * scale;
    for (let i = -1; i < VIEW_W / spacing + 2; i++) {
      const x = i * spacing - shift;
      const wob = Math.sin((x + off * speed) * 0.05) * 3 * scale;
      // Soft feathered wash behind the crest so the lane edge is not hard.
      softDisc(
        ctx,
        x + crestW * 0.5,
        y + wob + 2,
        crestW * 0.6,
        "rgba(47, 163, 176, 0.28)",
        "rgba(47, 163, 176, 0)",
      );
      // The crest is a smooth rounded swell: a shaded capsule body carries the
      // silhouette, and the lane tones are emitted as thin highlights on top so
      // the surface reads as a rolling swell, not a rectangular lane.
      roundRectShaded(
        ctx,
        x,
        y + wob,
        crestW,
        3 + scale * 2,
        (3 + scale * 2) / 2,
        P.waterShallow,
        P.waterMid,
      );
      px(ctx, x, y + wob, crestW, 2, P.waterShallow);
      px(
        ctx,
        x + crestW * 0.2,
        y + 4 + scale * 2 + wob,
        crestW * 0.7,
        2 + scale,
        P.waterCrest,
      );
      // Feathered foam cap: translucent wash plus the dim foam tone.
      softDisc(
        ctx,
        x + crestW * 0.55,
        y + 6 + scale * 3 + wob,
        crestW * 0.4,
        "rgba(234, 252, 255, 0.35)",
        "rgba(234, 252, 255, 0)",
      );
      px(
        ctx,
        x + crestW * 0.33,
        y + 6 + scale * 3 + wob,
        crestW * 0.45,
        2,
        P.foamDim,
      );
    }
  }
}

/** Foam line at the water edge, scrolling with the nearest lane. */
function drawFoamLine(ctx: CanvasRenderingContext2D, off: number): void {
  const foamShift = (off * 1.4) % 40;
  for (let i = -1; i < VIEW_W / 40 + 2; i++) {
    const x = i * 40 - foamShift;
    // Feathered foam: a soft translucent plume behind the bright cap.
    softDisc(
      ctx,
      x + 13,
      WATER_Y,
      16,
      "rgba(234, 252, 255, 0.4)",
      "rgba(234, 252, 255, 0)",
    );
    px(ctx, x, WATER_Y - 2, 26, 3, P.foam);
    px(ctx, x + 10, WATER_Y + 1, 14, 2, P.foamDim);
  }
}

/** Deeper ripple rows, spaced and scaled by their depth lane. */
function drawRippleLanes(ctx: CanvasRenderingContext2D, off: number): void {
  const lanes = 4;
  for (let lane = 0; lane < lanes; lane++) {
    const depth = 0.3 + (lane / lanes) * 0.7;
    const y = depthY(depth);
    if (y > VIEW_H) break;
    const scale = depthScale(depth);
    const speed = depthSpeed(depth);
    const spacing = 90 * scale;
    const rs = (off * speed * 0.6) % spacing;
    for (let i = -1; i < VIEW_W / spacing + 2; i++) {
      const x = i * spacing - rs;
      px(ctx, x, y, 34 * scale, 2, P.waterMid);
      px(
        ctx,
        x + spacing * 0.5,
        y + 4 + scale * 2,
        20 * scale,
        2,
        P.waterShallow,
      );
    }
  }
}

function drawSwell(ctx: CanvasRenderingContext2D, state: GameState): void {
  const s = state.swell;
  if (!s) return;
  const h = 10 + s.power * 26;
  const x = s.x;

  // Soft spray haze around the crest so the wave has a feathered edge.
  softDisc(
    ctx,
    x,
    WATER_Y + 2 - h * 0.5,
    h * 0.9,
    "rgba(234, 252, 255, 0.28)",
    "rgba(234, 252, 255, 0)",
  );

  // Shaded wave body: a rounded mound built from overlapping discs so the
  // silhouette curves smoothly instead of forming a hard triangle.
  const bodyR = 26;
  disc(ctx, x, WATER_Y + 2, bodyR, P.waterShallow);
  disc(ctx, x - 10, WATER_Y + 2 - h * 0.35, bodyR * 0.7, P.waterShallow);
  disc(ctx, x + 10, WATER_Y + 2 - h * 0.35, bodyR * 0.7, P.waterShallow);
  disc(ctx, x, WATER_Y + 2 - h * 0.7, bodyR * 0.5, P.waterShallow);
  px(ctx, x - bodyR, WATER_Y + 2, bodyR * 2, 6, P.waterShallow);

  // Lighter sunlit face on the sun-facing (left) side.
  disc(ctx, x - 6, WATER_Y + 2 - h * 0.4, bodyR * 0.55, P.waterCrest);
  disc(ctx, x - 2, WATER_Y + 2 - h * 0.7, bodyR * 0.35, P.waterCrest);

  // Shaded back face, away from the sun.
  disc(ctx, x + 12, WATER_Y + 2 - h * 0.3, bodyR * 0.5, P.waterDeep);

  // Foam cap and spray.
  px(ctx, x - 6, WATER_Y + 2 - h, 12, 4, P.foam);
  px(ctx, x - 14, WATER_Y - 2, 28, 3, P.foamDim);
}

/**
 * Depth lane for a hazard, derived from its vertical offset so nearer hazards
 * (larger yOffset) read larger and sit lower on the water plane.
 */
function obstacleDepth(o: Obstacle): number {
  const d = (o.yOffset + 40) / 40;
  return Math.max(0.15, Math.min(1, d));
}

function drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle): void {
  const depth = obstacleDepth(o);
  const scale = depthScale(depth);
  const top = WATER_Y + o.yOffset;
  const w = o.width * scale;
  const h = o.height * scale;
  const x = o.x + (o.width - w) / 2;

  if (o.kind === "buoy") {
    // Soft blurred cast shadow and waterline reflection.
    softDisc(
      ctx,
      x + w / 2,
      top + h + 4 * scale,
      w * 0.7,
      "rgba(11, 39, 64, 0.55)",
      "rgba(11, 39, 64, 0)",
    );
    px(ctx, x + 2, top + h, w - 4, 6 * scale, "rgba(11, 39, 64, 0.55)");
    px(ctx, x + 5, top + h + 8 * scale, w - 10, 4 * scale, P.waterMid);

    // Rounded channel marker: a curved capsule body with a lit top. The
    // rounded silhouette is drawn as a shaded path fill; the palette tones are
    // then emitted as thin curved bands so the marker reads as a smooth,
    // rounded buoy rather than a stack of rectangles.
    roundRectShaded(
      ctx,
      x + 2,
      top,
      w - 4,
      h - 6 * scale,
      (w - 4) / 2,
      P.buoyRed,
      P.buoyDark,
    );
    // Dark shaded rim along the sun-away edge.
    px(ctx, x + w - 6, top + 3, 3, h - 12 * scale, P.buoyDark);
    // Red core band and lit band, emitted as thin fills over the rounded body.
    px(ctx, x + 4, top + 4, w - 8, 3 * scale, P.buoyRed);
    px(ctx, x + 4, top + 8 * scale, w - 8, 4 * scale, P.buoyLight);
    px(ctx, x + 4, top + h - 10 * scale, w - 8, 3 * scale, P.buoyDark);
    // Rounded top cap.
    disc(ctx, x + w / 2, top + 2, w * 0.28, P.buoyDark);
    disc(ctx, x + w / 2 - 1, top + 1, w * 0.2, P.buoyRed);
    // Specular highlight down the sun-facing side.
    px(ctx, x + 5, top + 3, 3 * scale, 6 * scale, P.buoyLight);
    px(ctx, x + 5, top + 15 * scale, 2 * scale, 6 * scale, P.buoyLight);
  } else {
    // Soft blurred cast shadow on the water.
    softDisc(
      ctx,
      x + w / 2,
      top + h + 3 * scale,
      w * 0.6,
      "rgba(11, 39, 64, 0.5)",
      "rgba(11, 39, 64, 0)",
    );
    px(ctx, x + 4, top + h, w - 8, 6 * scale, "rgba(11, 39, 64, 0.5)");
    px(ctx, x + 6, top + h + 8 * scale, w - 12, 4 * scale, P.waterDeep);

    // Rounded deck planks with a lit top edge. The deck is a shaded rounded
    // path fill; the wood tones are emitted as thin plank lines and seams so
    // the dock reads as smooth timber rather than a flat rectangle.
    roundRectShaded(ctx, x, top, w, 9 * scale, 2 * scale, P.woodLight, P.wood);
    // Lit top edge, mid wood band and dark seams between planks, emitted as
    // thin fills over the rounded deck so the timber reads as smooth planks.
    px(ctx, x + 1, top, w - 2, 2 * scale, P.woodLight);
    px(ctx, x + 1, top + 2 * scale, w - 2, 3 * scale, P.wood);
    for (let i = 1; i < 5; i++) {
      px(ctx, x + (w / 5) * i, top + 1, 1, 7 * scale, P.woodDark);
    }
    px(ctx, x, top + 9 * scale, w, 2 * scale, P.woodDark);

    // Curved support posts with a lit face and waterline reflection.
    roundRectShaded(
      ctx,
      x + 6,
      top + 12 * scale,
      6 * scale,
      h - 12 * scale,
      3 * scale,
      P.wood,
      P.woodDark,
    );
    roundRectShaded(
      ctx,
      x + w - 12,
      top + 12 * scale,
      6 * scale,
      h - 12 * scale,
      3 * scale,
      P.wood,
      P.woodDark,
    );
    roundRectShaded(
      ctx,
      x + 20,
      top + 12 * scale,
      5 * scale,
      h - 12 * scale,
      2.5 * scale,
      P.woodLight,
      P.wood,
    );
    // Lit faces on the sun-facing side of each post.
    px(ctx, x + 6, top + 12 * scale, 2 * scale, h - 12 * scale, P.woodLight);
    px(ctx, x + 6, top + h, 6 * scale, 5 * scale, "rgba(107, 69, 38, 0.5)");
    px(
      ctx,
      x + w - 12,
      top + h,
      6 * scale,
      5 * scale,
      "rgba(107, 69, 38, 0.5)",
    );
  }
}

function drawRider(ctx: CanvasRenderingContext2D, state: GameState): void {
  const r = state.rider;
  const baseY = WATER_Y - r.y;

  // Soft blurred contact shadow and waterline reflection below the craft.
  const shadowScale = r.airborne ? 0.6 : 1;
  softDisc(
    ctx,
    RIDER_X,
    WATER_Y + 4,
    RIDER_W * 0.7,
    "rgba(11, 39, 64, 0.5)",
    "rgba(11, 39, 64, 0)",
  );
  px(
    ctx,
    RIDER_X - RIDER_W / 2 + 2,
    WATER_Y + 2,
    RIDER_W - 4,
    6 * shadowScale,
    "rgba(11, 39, 64, 0.5)",
  );
  px(
    ctx,
    RIDER_X - RIDER_W / 2 + 4,
    WATER_Y + 8,
    RIDER_W - 8,
    4 * shadowScale,
    P.waterDeep,
  );

  ctx.save();
  ctx.translate(RIDER_X, baseY);
  ctx.rotate(r.tilt);

  if (!r.airborne) {
    // Soft feathered spray trail fanning off the hull.
    const bob = Math.sin(state.elapsed * 12) * 1.5;
    softDisc(
      ctx,
      -RIDER_W - 6,
      -4 + bob,
      14,
      "rgba(234, 252, 255, 0.4)",
      "rgba(234, 252, 255, 0)",
    );
    px(ctx, -RIDER_W - 4, -6 + bob, 16, 4, P.foam);
    px(ctx, -RIDER_W - 12, -2 + bob, 12, 3, P.foamDim);
    px(ctx, -RIDER_W - 20, 1 + bob, 10, 2, P.foamDim);
    px(ctx, -RIDER_W + 2, -10 + bob, 8, 3, P.foam);
    px(ctx, -RIDER_W - 8, -9 + bob, 6, 3, P.foamDim);
  } else {
    // Soft wake trailing behind while airborne.
    softDisc(
      ctx,
      -RIDER_W - 10,
      0,
      16,
      "rgba(159, 227, 232, 0.35)",
      "rgba(159, 227, 232, 0)",
    );
    px(ctx, -RIDER_W - 6, -2, 18, 3, P.foamDim);
    px(ctx, -RIDER_W - 16, 0, 12, 2, P.foamDim);
    px(ctx, -RIDER_W - 24, 2, 10, 2, P.foamDim);
  }

  // Jet-ski hull: a curved profile with a lit deck, shaded underside and a
  // soft specular highlight along the top. The hull is a shaded rounded path
  // fill; the deck and hull tones are emitted as thin curved bands so the craft
  // reads as a smooth, rounded silhouette rather than stacked rectangles.
  roundRectShaded(ctx, -RIDER_W / 2, -9, RIDER_W, 9, 4.5, P.jet, P.jetDark);
  disc(ctx, RIDER_W / 2 - 2, -4.5, 4.5, P.jetDark);
  disc(ctx, -RIDER_W / 2 + 2, -4.5, 4.5, P.jetDark);
  // Lit deck surface (curved) plus its observable highlight band.
  px(ctx, -RIDER_W / 2 + 2, -9, RIDER_W - 4, 3, P.jet);
  // Shaded underside band and accent stripe.
  px(ctx, -RIDER_W / 2 + 3, -3, RIDER_W - 6, 2, P.jetDark);
  px(ctx, -RIDER_W / 2 + 5, -6, RIDER_W - 12, 2, P.jetAccent);
  // Soft specular highlight along the lit deck.
  softDisc(
    ctx,
    -RIDER_W / 2 + 8,
    -7,
    6,
    "rgba(255, 255, 255, 0.5)",
    "rgba(255, 255, 255, 0)",
  );
  // Handlebar column.
  roundRect(ctx, RIDER_W / 2 - 8, -13, 6, 5, 2, P.jetDark);
  roundRect(ctx, RIDER_W / 2 - 10, -14, 10, 2, 1, P.jetAccent);

  // Rider torso: a rounded suit with a shaded sun-away side and a lit
  // sun-facing side. The torso is a shaded rounded path fill; the suit tones
  // are emitted as thin curved bands so the rider reads as a rounded body.
  roundRectShaded(ctx, -6, -RIDER_H, 12, 15, 5, P.riderSuit, P.riderSuitDark);
  // Lit sun-facing edge and shaded back edge.
  px(ctx, -5, -RIDER_H + 1, 3, 13, P.riderSuit);
  px(ctx, 2, -RIDER_H + 1, 3, 13, P.riderSuitDark);
  // Belt / harness bands.
  px(ctx, -6, -RIDER_H + 4, 12, 2, P.riderBody);
  px(ctx, -6, -RIDER_H + 9, 12, 2, P.riderBody);
  // Head + helmet with a lit crown.
  disc(ctx, 0, -RIDER_H - 4, 5, P.riderSkinDark);
  disc(ctx, 0.5, -RIDER_H - 4, 4, P.riderSkin);
  roundRectShaded(ctx, -6, -RIDER_H - 10, 12, 6, 3, P.riderSuit, P.riderBody);
  // Arms reaching to the handlebars.
  roundRectShaded(
    ctx,
    4,
    -RIDER_H + 3,
    11,
    3,
    1.5,
    P.riderSkin,
    P.riderSkinDark,
  );
  roundRectShaded(
    ctx,
    4,
    -RIDER_H + 7,
    9,
    3,
    1.5,
    P.riderSkin,
    P.riderSkinDark,
  );
  ctx.restore();
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  hi: number,
): void {
  const dist = Math.floor(state.distance);

  // Distance panel (left).
  drawPanel(ctx, 10, 10, 150, 46);
  ctx.fillStyle = P.hudLabel;
  ctx.font = "8px 'JetBrains Mono', monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("DISTANCE", 20, 17);
  ctx.fillStyle = P.hudAccent;
  ctx.font = "22px 'JetBrains Mono', monospace";
  ctx.fillText(String(dist).padStart(4, "0"), 20, 28);

  // High score panel (right).
  drawPanel(ctx, VIEW_W - 160, 10, 150, 46);
  ctx.fillStyle = P.hudLabel;
  ctx.font = "8px 'JetBrains Mono', monospace";
  ctx.textAlign = "right";
  ctx.fillText("HIGH SCORE", VIEW_W - 20, 17);
  ctx.fillStyle = P.hudText;
  ctx.font = "22px 'JetBrains Mono', monospace";
  ctx.fillText(String(hi).padStart(4, "0"), VIEW_W - 20, 28);

  // Charge meter under the HUD.
  const meterY = 62;
  drawPanel(ctx, 10, meterY, VIEW_W - 20, 16);
  px(ctx, 16, meterY + 5, VIEW_W - 32, 6, P.hudBg);
  if (state.charging || state.charge > 0) {
    const fill = Math.max(0, Math.min(1, state.charge));
    px(ctx, 16, meterY + 5, (VIEW_W - 32) * fill, 6, P.hudAccent);
    px(ctx, 16, meterY + 5, (VIEW_W - 32) * fill, 2, P.hudText);
  }

  // Control hint panel.
  const hintY = 84;
  drawPanel(ctx, 10, hintY, 150, 24);
  ctx.fillStyle = P.hudLabel;
  ctx.font = "8px 'JetBrains Mono', monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("HOLD", 20, hintY + 4);
  ctx.fillStyle = P.hudText;
  ctx.fillText("SPACE", 20, hintY + 13);
}

function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  // Soft drop shadow.
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundRectPath(ctx, x + 2, y + 2, w, h, 6);
  ctx.fill();
  // Body with rounded corners.
  roundRect(ctx, x, y, w, h, 6, P.hudPanel);
  // Soft bevel: light top/left, dark bottom/right.
  px(ctx, x + 6, y, w - 12, 2, P.hudBorder);
  px(ctx, x, y + 6, 2, h - 12, P.hudBorder);
  px(ctx, x + 6, y + h - 2, w - 12, 2, P.hudEdge);
  px(ctx, x + w - 2, y + 6, 2, h - 12, P.hudEdge);
  // Inner inset line.
  px(ctx, x + 3, y + 3, w - 6, 1, P.hudBg);
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  hi: number,
): void {
  ctx.save();
  if (state.shake > 0) {
    const sx = (Math.random() - 0.5) * state.shake;
    const sy = (Math.random() - 0.5) * state.shake;
    ctx.translate(sx, sy);
  }

  drawSky(ctx, state.elapsed);
  drawShoreline(ctx, state.elapsed);
  drawWater(ctx, state);
  drawSwell(ctx, state);
  for (const o of state.obstacles) drawObstacle(ctx, o);
  drawRider(ctx, state);

  ctx.restore();

  // Impact flash.
  if (state.impact > 0) {
    ctx.fillStyle = `rgba(255, 80, 80, ${state.impact * 0.35})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  drawHud(ctx, state, hi);
}
