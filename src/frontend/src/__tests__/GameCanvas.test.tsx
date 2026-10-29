import { renderWithActor } from "@/__tests__/test-utils";
import type { backendInterface } from "@/backend";
import { GameCanvas } from "@/components/game/GameCanvas";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

/** Minimal 2D context stub: the game only draws, it never reads pixels back. */
function stubContext(): CanvasRenderingContext2D {
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
  return ctx;
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

describe("GameCanvas journeys", () => {
  it("renders the canvas and start overlay without a blank screen", async () => {
    renderWithActor(<GameCanvas />, makeActor());
    expect(screen.getByTestId("game.canvas_target")).toBeInTheDocument();
    expect(screen.getByTestId("game.start_state")).toBeInTheDocument();
    expect(screen.getByText("Wave Maker")).toBeInTheDocument();
  });

  it("starts the run when the Start button is pressed", async () => {
    const user = userEvent.setup();
    renderWithActor(<GameCanvas />, makeActor());
    await user.click(screen.getByTestId("game.start_button"));
    expect(screen.queryByTestId("game.start_state")).not.toBeInTheDocument();
    expect(screen.getByTestId("game.running_state")).toBeInTheDocument();
  });

  it("starts the run on a touch/pointer press", async () => {
    const user = userEvent.setup();
    renderWithActor(<GameCanvas />, makeActor());
    await user.pointer({
      keys: "[MouseLeft>]",
      target: screen.getByTestId("game.canvas_target"),
    });
    expect(screen.getByTestId("game.running_state")).toBeInTheDocument();
  });

  it("shows the Wipeout overlay with a working restart after a collision", async () => {
    const user = userEvent.setup();
    const submitRun = vi.fn(async (distance: bigint) => distance);
    renderWithActor(<GameCanvas />, makeActor({ submitRun }));

    await user.click(screen.getByTestId("game.start_button"));
    expect(screen.getByTestId("game.running_state")).toBeInTheDocument();

    // Drive the run until the rider collides with a spawned obstacle.
    await waitFor(
      () => {
        expect(screen.getByTestId("game.gameover_state")).toBeInTheDocument();
      },
      { timeout: 15000 },
    );

    expect(screen.getByText("Wipeout!")).toBeInTheDocument();
    expect(screen.getByTestId("game.final_score")).toBeInTheDocument();
    expect(submitRun).toHaveBeenCalled();

    await user.click(screen.getByTestId("game.restart_button"));
    expect(screen.queryByTestId("game.gameover_state")).not.toBeInTheDocument();
    expect(screen.getByTestId("game.running_state")).toBeInTheDocument();
  }, 20000);

  it("reads the session high score from the backend", async () => {
    const getSessionHighScore = vi.fn(async () => 42n);
    renderWithActor(<GameCanvas />, makeActor({ getSessionHighScore }));
    await waitFor(() => expect(getSessionHighScore).toHaveBeenCalled());
  });
});
