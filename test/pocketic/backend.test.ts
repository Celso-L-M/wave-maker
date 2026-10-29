import { PocketIc } from "@dfinity/pic";
import type { Actor, CanisterFixture } from "@dfinity/pic";
import { afterAll, beforeAll, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

const PIC_URL = process.env.POCKET_IC_URL ?? "";
const BACKEND_WASM = process.env.BACKEND_WASM ?? "";

let pic: PocketIc | undefined;
let actor: Actor<_SERVICE>;
let canisterId: CanisterFixture<_SERVICE>["canisterId"];

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
  ({ actor, canisterId } = await pic.setupCanister<_SERVICE>({
    idlFactory,
    wasm: BACKEND_WASM,
  }));
});

afterAll(async () => {
  await pic?.tearDown();
});

it("answers an empty-state high score read instead of trapping", async () => {
  await expect(actor.getSessionHighScore()).resolves.toBe(0n);
});

it("records a run and returns the resulting session high score", async () => {
  await expect(actor.submitRun(120n)).resolves.toBe(120n);
  await expect(actor.getSessionHighScore()).resolves.toBe(120n);
});

it("only ever increases the session high score", async () => {
  await actor.submitRun(300n);
  await expect(actor.getSessionHighScore()).resolves.toBe(300n);
  // A lower run leaves the high score unchanged.
  await expect(actor.submitRun(50n)).resolves.toBe(300n);
  await expect(actor.getSessionHighScore()).resolves.toBe(300n);
});

it("keeps the high score across a canister upgrade", async () => {
  await actor.submitRun(777n);
  await pic!.upgradeCanister({
    canisterId,
    wasm: BACKEND_WASM,
    upgradeModeOptions: {
      skip_pre_upgrade: [],
      wasm_memory_persistence: [{ keep: null }],
    },
  });
  const upgraded = pic!.createActor<_SERVICE>(idlFactory, canisterId);
  await expect(upgraded.getSessionHighScore()).resolves.toBe(777n);
});
