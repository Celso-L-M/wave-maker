import { renderWithActor } from "@/__tests__/test-utils";
import type { backendInterface } from "@/backend";
import { GameCanvas } from "@/components/game/GameCanvas";
import { VIEW_H, VIEW_W } from "@/game/constants";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

/**
 * Characterization baseline for the Wave Maker visual restyle.
 *
 * The scene rendering (sky, sun, clouds, shoreline, water, rider, obstacles,
 * HUD) is intentionally being restyled, so these tests deliberately assert
 * nothing about pixels or colors. They pin the behavior that must survive the
 * restyle: the canvas sizing contract, keyboard controls, scoring submission,
 * and the backend consumer contract.
 */

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
    // The restyled scene paints gradient sky/water; the stub only needs the
    // factory shape, since the game never reads pixels back.
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

describe("canvas sizing contract", () => {
  it("keeps the fixed logical resolution so the scene is not distorted", () => {
    renderWithActor(<GameCanvas />, makeActor());
    const canvas = screen.getByTestId("game.canvas_target");
    expect(canvas).toHaveAttribute("width", String(VIEW_W));
    expect(canvas).toHaveAttribute("height", String(VIEW_H));
  });

  it("fills the viewport while preserving aspect ratio", () => {
    renderWithActor(<GameCanvas />, makeActor());
    const canvas = screen.getByTestId("game.canvas_target");
    // Full-bleed sizing plus object-contain is what letterboxes the fixed
    // 480x270 canvas without stretching the pixel art.
    expect(canvas.className).toContain("h-full");
    expect(canvas.className).toContain("w-full");
    expect(canvas.className).toContain("object-contain");
  });
});

describe("keyboard controls", () => {
  it("starts the run when Space is pressed on the start screen", async () => {
    const user = userEvent.setup();
    renderWithActor(<GameCanvas />, makeActor());
    expect(screen.getByTestId("game.start_state")).toBeInTheDocument();

    await user.keyboard(" ");

    expect(screen.queryByTestId("game.start_state")).not.toBeInTheDocument();
    expect(screen.getByTestId("game.running_state")).toBeInTheDocument();
  });

  it("restarts the run when Space is pressed on the game-over screen", async () => {
    const user = userEvent.setup();
    renderWithActor(<GameCanvas />, makeActor());

    await user.click(screen.getByTestId("game.start_button"));
    await waitFor(
      () => {
        expect(screen.getByTestId("game.gameover_state")).toBeInTheDocument();
      },
      { timeout: 15000 },
    );

    await user.keyboard(" ");

    expect(screen.queryByTestId("game.gameover_state")).not.toBeInTheDocument();
    expect(screen.getByTestId("game.running_state")).toBeInTheDocument();
  }, 20000);
});

describe("scoring and backend contract", () => {
  it("submits the final integer distance to the backend on game over", async () => {
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

    expect(submitRun).toHaveBeenCalledTimes(1);
    const [distance] = submitRun.mock.calls[0];
    expect(typeof distance).toBe("bigint");
    expect(distance).toBeGreaterThanOrEqual(0n);
  }, 20000);

  it("shows the backend session high score on the game-over overlay", async () => {
    const user = userEvent.setup();
    renderWithActor(
      <GameCanvas />,
      makeActor({ getSessionHighScore: vi.fn(async () => 42n) }),
    );

    await user.click(screen.getByTestId("game.start_button"));
    await waitFor(
      () => {
        expect(screen.getByTestId("game.gameover_state")).toBeInTheDocument();
      },
      { timeout: 15000 },
    );

    expect(screen.getByTestId("game.high_score")).toHaveTextContent("0042");
  }, 20000);
});
