import { VIEW_H, VIEW_W } from "@/game/constants";
import {
  createInitialState,
  finalDistance,
  resetRun,
  update,
} from "@/game/engine";
import { render } from "@/game/render";
import type { GamePhase, GameState, InputState } from "@/game/types";
import { useSessionHighScore, useSubmitRun } from "@/hooks/useQueries";
import { useCallback, useEffect, useRef, useState } from "react";

interface GameCanvasProps {
  onPhaseChange?: (phase: GamePhase) => void;
}

export function GameCanvas({ onPhaseChange }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>(createInitialState());
  const inputRef = useRef<InputState>({
    waveHeld: false,
    wavePressed: false,
    waveReleased: false,
  });
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);
  const highScoreRef = useRef<number>(0);

  const [phase, setPhase] = useState<GamePhase>("start");
  const [displayDistance, setDisplayDistance] = useState(0);
  const [displayHigh, setDisplayHigh] = useState(0);

  const { data: highScore } = useSessionHighScore();
  const submitRun = useSubmitRun();
  const submitRef = useRef(submitRun.mutate);
  submitRef.current = submitRun.mutate;

  useEffect(() => {
    if (typeof highScore === "bigint") {
      highScoreRef.current = Number(highScore);
      setDisplayHigh(Number(highScore));
    }
  }, [highScore]);

  const changePhase = useCallback(
    (next: GamePhase) => {
      setPhase(next);
      onPhaseChange?.(next);
    },
    [onPhaseChange],
  );

  const startRun = useCallback(() => {
    resetRun(stateRef.current);
    setDisplayDistance(0);
    changePhase("running");
  }, [changePhase]);

  // Game loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Smooth scaling: the scene is shaded with gradients and soft volumes, so
    // the canvas is upscaled with interpolation rather than nearest-neighbour.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastRef.current) / 1000 || 0);
      lastRef.current = now;

      const state = stateRef.current;
      const prevPhase = state.phase;
      update(state, inputRef.current, dt);
      inputRef.current.wavePressed = false;
      inputRef.current.waveReleased = false;

      if (state.phase !== prevPhase) {
        if (state.phase === "gameover") {
          const dist = finalDistance(state);
          setDisplayDistance(dist);
          changePhase("gameover");
          submitRef.current(BigInt(dist));
        }
      }

      render(ctx, state, highScoreRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [changePhase]);

  // Keyboard input.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      e.preventDefault();
      const state = stateRef.current;
      if (state.phase === "start") {
        startRun();
        return;
      }
      if (state.phase === "gameover") {
        startRun();
        return;
      }
      if (!inputRef.current.waveHeld) {
        inputRef.current.wavePressed = true;
      }
      inputRef.current.waveHeld = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      e.preventDefault();
      if (inputRef.current.waveHeld) {
        inputRef.current.waveReleased = true;
      }
      inputRef.current.waveHeld = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [startRun]);

  // Touch / pointer input.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const state = stateRef.current;
      if (state.phase === "start" || state.phase === "gameover") {
        startRun();
        return;
      }
      if (!inputRef.current.waveHeld) {
        inputRef.current.wavePressed = true;
      }
      inputRef.current.waveHeld = true;
    },
    [startRun],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (inputRef.current.waveHeld) {
      inputRef.current.waveReleased = true;
    }
    inputRef.current.waveHeld = false;
  }, []);

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-background">
      <canvas
        ref={canvasRef}
        width={VIEW_W}
        height={VIEW_H}
        data-ocid="game.canvas_target"
        className="smooth-canvas h-full w-full touch-none select-none object-contain"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

      {phase === "start" && (
        <div
          data-ocid="game.start_state"
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/75 px-6 text-center"
        >
          <div className="soft-panel animate-overlay-in motion-reduce:animate-none flex flex-col items-center gap-3 bg-card/95 px-8 py-7">
            <p className="pixel-text text-[10px] text-accent sm:text-xs">
              Punta Rassa Sunset Run
            </p>
            <h1 className="pixel-text font-display text-4xl font-bold text-accent drop-shadow-[3px_3px_0_rgba(0,0,0,0.6)] sm:text-6xl">
              Wave Maker
            </h1>
            <button
              type="button"
              data-ocid="game.start_button"
              onClick={startRun}
              className="soft-panel pixel-text mt-2 bg-primary px-7 py-3 text-sm font-bold text-primary-foreground transition-smooth hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Start Run
            </button>
            <p className="pixel-text mt-1 text-[10px] text-muted-foreground sm:text-xs">
              Hold Space / Tap to build a wave
            </p>
          </div>
        </div>
      )}

      {phase === "gameover" && (
        <div
          data-ocid="game.gameover_state"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 px-6 text-center"
        >
          <div className="soft-panel animate-overlay-in motion-reduce:animate-none flex flex-col items-center gap-3 bg-card/95 px-8 py-6">
            <h2 className="pixel-text font-display text-3xl font-bold text-destructive drop-shadow-[3px_3px_0_rgba(0,0,0,0.6)] sm:text-5xl">
              Wipeout!
            </h2>
            <div className="flex items-stretch gap-4">
              <div className="flex flex-col items-center">
                <p className="pixel-text text-[10px] text-muted-foreground">
                  Distance
                </p>
                <p
                  data-ocid="game.final_score"
                  className="pixel-text text-3xl font-bold text-accent"
                >
                  {String(displayDistance).padStart(4, "0")}
                </p>
              </div>
              <div className="w-px bg-border" />
              <div className="flex flex-col items-center">
                <p className="pixel-text text-[10px] text-muted-foreground">
                  Session High
                </p>
                <p
                  data-ocid="game.high_score"
                  className="pixel-text text-3xl font-bold text-foreground"
                >
                  {String(displayHigh).padStart(4, "0")}
                </p>
              </div>
            </div>
            <button
              type="button"
              data-ocid="game.restart_button"
              onClick={startRun}
              className="soft-panel pixel-text mt-1 bg-primary px-7 py-3 text-sm font-bold text-primary-foreground transition-smooth hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Ride Again
            </button>
          </div>
        </div>
      )}

      {phase === "running" && (
        <div
          data-ocid="game.running_state"
          className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2"
        >
          <p className="pixel-text text-[10px] text-foreground/70">
            Hold Space / Tap
          </p>
        </div>
      )}
    </div>
  );
}
