# Project Guidance

## User Preferences

- Retro sunset over the Punta Rassa coastline setting
- Self-contained single-page game
- Smooth, realistic 2D rendering rather than chunky pixel banding
- Smooth, realistic rendering rather than chunky pixel banding
- 2.5D perspective look with depth, layered parallax and volumetric shading

## Accepted Requirements

- Automated jet-ski rider fixed on the left over scrolling water with gravity
- Spacebar creates a traveling swell that launches the rider, with hold-for-height
- Red channel buoys and wooden docks as scrolling hazards with Wipeout game over and restart
- Distance score in a retro arcade font with score-scaled speed and spawn rate
- Parallax coastal background with slower distant clouds
- Improve the visual presentation of the existing Wave Maker game
- Make the game look more realistic as a 2.5D game with depth, perspective and volumetric shading
- Keep the existing gameplay, controls, scoring, hazards, backend and single-page structure unchanged

## Verified Commands

- **typecheck**: `pnpm typecheck`
- **fix**: `pnpm fix`
- **build**: `pnpm build`

## Learnings

- Wave Maker game: engine.ts update() drives all state; render.ts reads it each frame; GameCanvas.tsx bridges input refs and React phase overlays.
- Canvas game: keep per-frame state in a ref and only sync React state on phase change to avoid re-render churn.
- crisp-canvas plus object-contain letterboxes a fixed 480x270 canvas without distorting pixel art on portrait mobile.
- Backend persisted sessionHighScore has no OQL entity (Expose entities = []); the frontend reads it via getSessionHighScore, so flows work but OQL is empty.
- Fold new stable fields into the single pending migration's NewActor; inline the field type since migrations cannot import project modules.
- Wave Maker visual upgrade: render.ts draws the whole scene from GameState each frame; React overlays are phase-keyed branches, so visual changes live in render.ts plus GameCanvas.tsx overlays.
- Sun reflection path on water: stacked horizontal glint rows with sin wobble keyed off waterOffset read as shimmering water without extra state.
- Overlay entrance animations (animate-overlay-in) have no prefers-reduced-motion guard; add motion-reduce:animate-none when polish is in scope.
- Wave Maker visual restyle: render.ts now draws a smooth multi-stop sunset gradient sky (createLinearGradient) and a soft-glow sun with a radial bloom and haze veil, replacing the old banded sky and scanline sun.
- The render characterization stub context implements arc but not ellipse; draw soft cloud volumes with arc-based discs so render() stays testable.
- Smooth sky and water gradients use createLinearGradient while animated crests, foam and glints stay fillRect so motion tests still observe changing fills.
- The tester owns src/frontend/src/__tests__/game-render.test.ts; its banded-sky assertion was intentionally updated to match the smooth-gradient rendering.
- Wave Maker 2.5D upgrade: render.ts maps depth 0..1 through a quadratic depthY plus depthScale/depthSpeed so water lanes compress, shrink and slow toward the horizon.
- Wave Maker 2.5D upgrade: keep the water body a single full-width fillRect at y=WATER_Y and glints under 120px wide so the tester's render contract still holds.
- Wave Maker 2.5D upgrade: layered parallax scrolls sky/clouds slowest, then far coastline, near coastline, and water lanes fastest, with stronger haze on distant layers.
- Wave Maker visual upgrade lives entirely in render.ts (gradients, roundRectShaded, softDisc) plus GameCanvas.tsx overlays; engine.ts and backend are untouched.
- The render stub records only fillRect ops, so required palette tones must be emitted as thin px() highlights while roundRectShaded/disc path fills carry the smooth silhouette.
- Wave Maker smoothness fix: draw shaded rounded path fills as the primary silhouette and keep fillRect emissions to 2-4px accent bands so actors stop reading as stacked rectangles.
- The render stub contexts implement arc/moveTo/lineTo/closePath but not quadraticCurveTo or ellipse; build all curved silhouettes from arc discs and rounded-rect paths.
- Wave Maker 2.5D render: drawWater draws one smooth vGradient body then places crests/foam/glints through depthY/depthScale/depthSpeed lanes.
- Sun path reads continuous because a widening gradient column polygon sits under the glint rows, not just discrete fills.
- Persisted sessionHighScore still has no OQL entity (Expose entities = []); flows work via getSessionHighScore but OQL is empty.
- The tester owns src/frontend/src/__tests__/game-smooth-restyle.test.ts, GameCanvas.smooth-scaling.test.tsx and smooth-canvas-css.test.ts; leave them alone when editing render.ts or GameCanvas.tsx.
