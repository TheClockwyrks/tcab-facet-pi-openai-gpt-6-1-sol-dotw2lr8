/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  ConstantClock,
  createEngine,
  type Engine,
} from "@clockwyrks/simple-2d";
import { game, BACKGROUND, type FacetState, type FacetDebugApi } from "./game";
const rows = () =>
  Array.from({ length: C.GRID_ROWS }, (_, r) =>
    Array.from(
      { length: C.GRID_COLS },
      (_, c) => "RACJBSM"[(r * 2 + c) % C.GEM_KIND_COUNT] + "0",
    ).join(" "),
  );
import * as C from "./constants";

/** Real shipped images and JSON, with a minimal host audio decoder in Node. */
class TestAudioContext {
  currentTime = 0;
  async resume() {}
  async decodeAudioData(data: ArrayBuffer) {
    const view = new DataView(data);
    expect(String.fromCharCode(...new Uint8Array(data, 0, 4))).toBe("RIFF");
    return {
      duration: (data.byteLength - 44) / view.getUint32(28, true),
      sampleRate: view.getUint32(24, true),
    };
  }
}
let engine: Engine<FacetState, FacetDebugApi>;
let events: EventTarget;
let cues: string[];
async function host(ms = 1000 / 60) {
  events = new EventTarget();
  cues = [];
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(ms),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  engine.events.on("cue:played", (e) => cues.push(e.cue));
  await engine.initialize();
  return engine;
}
function key(code: string) {
  for (const type of ["keydown", "keyup"]) {
    const e = new Event(type);
    Object.assign(e, { code, repeat: false });
    events.dispatchEvent(e);
  }
}
function pointer(type: string, x: number, y: number, primary = true) {
  const e = new Event(type);
  Object.assign(e, {
    clientX: x,
    clientY: y,
    pointerId: primary ? 1 : 2,
    pointerType: "mouse",
    isPrimary: primary,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
  });
  events.dispatchEvent(e);
}
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    async (url: string) => new Response(await readFile("public/" + url)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal("AudioContext", TestAudioContext);
});
afterEach(() => {
  engine?.destroy();
  vi.unstubAllGlobals();
});

describe("engine integration", () => {
  it("initializes every produced media file and registers readable diagnostics", async () => {
    const e = await host();
    expect(e.debug.version).toBe(C.FACET_DEBUG_VERSION);
    expect(Object.keys(e.state.assets!.images)).toHaveLength(96);
    expect(Object.keys(e.state.assets!.systems)).toHaveLength(4);
    await e.advance(1);
    expect(e.diagnostics().every((d) => d.error === undefined)).toBe(true);
    expect(e.diagnostics().find((d) => d.name === "screen")?.value).toBe(
      "title",
    );
  });
  it("plays an accepted move through its clock, cues and live rendering", async () => {
    const e = await host(C.SWAP_SECONDS * 1000);
    let fixture = rows();
    fixture = fixture.map((r, i) => (i === 0 ? "R0 R0 R0 J0 B0 S0 M0 R0" : r));
    e.apply((s) => e.debug.loadBoard(s, fixture));
    e.apply((s) => e.debug.setScreen(s, "playing"));
    e.apply((s) => e.debug.requestSwap(s, 0, 7, 1, 7));
    await e.advance(1);
    expect(e.state.lastCleared).toBe(3);
    expect(cues).toContain(C.CUES.swap);
    expect(cues).toContain(C.CUES.clear);
    expect(cues).toContain("chain-1");
    expect(e.state.score).toBe(30);
    await e.advance(8);
    expect(e.state.simTime).toBeCloseTo(9 * C.SWAP_SECONDS);
  });
  it("answers keyboard menus, mute and pause without advancing the board", async () => {
    const e = await host();
    key("ArrowDown");
    await e.advance(1);
    key("Enter");
    await e.advance(1);
    expect(e.state.screen).toBe("howto");
    key("Escape");
    await e.advance(1);
    expect(e.state.menuIndex).toBe(1);
    key("ArrowDown");
    await e.advance(1);
    key("Space");
    await e.advance(1);
    expect(e.state.screen).toBe("playing");
    key("KeyM");
    await e.advance(1);
    expect(e.state.muted).toBe(true);
    key("KeyP");
    await e.advance(1);
    const board = e.state.board;
    await e.advance(3);
    expect(e.state.screen).toBe("paused");
    expect(e.state.board).toBe(board);
    key("Escape");
    await e.advance(1);
    expect(e.state.screen).toBe("playing");
  });
  it("consumes every primary pointer position in arrival order and ignores a second pointer", async () => {
    const e = await host();
    e.apply((s) => e.debug.loadBoard(s, rows()));
    e.apply((s) => e.debug.setScreen(s, "playing"));
    pointer("pointerdown", 388, 144);
    pointer("pointermove", 460, 144);
    pointer("pointermove", 388, 144);
    pointer("pointerdown", 700, 400, false);
    pointer("pointerup", 388, 144);
    await e.advance(1);
    expect(e.state.selection).toEqual({ col: 0, row: 0 });
    expect(e.state.offer).toBeNull();
    expect(e.state.phase).toBe("idle");
    expect(e.state.pointer.device).toBe("mouse");
    expect(cues).toContain(C.CUES.select);
  });
  it("captures real draw operations and renders all six screens", async () => {
    const e = await host();
    key("Enter");
    await e.advance(1);
    e.startRecording();
    for (const screen of [
      "playing",
      "paused",
      "levelclear",
      "gameover",
      "howto",
      "title",
    ] as const) {
      e.apply((s) => e.debug.setScreen(s, screen));
      await e.advance(1);
    }
    const rec = e.stopRecording();
    expect(rec.frames).toHaveLength(6);
    expect(rec.ops.length).toBeGreaterThan(100);
    // Node's Canvas Image has no browser bitmap identity; its draw calls still record.
    expect(
      rec.ops.some((op) => op.op === "call" && op.method === "drawImage"),
    ).toBe(true);
  });
  it("layers a ladder tone, cut cue, flaw cue and landing without duplicate events per frame", async () => {
    const e = await host(180);
    e.apply((s) => e.debug.loadBoard(s, rows()));
    e.apply((s) => e.debug.setScreen(s, "playing"));
    for (let col = 0; col < 4; col++)
      e.apply((s) => e.debug.setGem(s, col, 5, "R0"));
    e.apply((s) => e.debug.setGem(s, 0, 4, "J2"));
    e.apply((s) => e.debug.requestSwap(s, 0, 7, 1, 7));
    await e.advance(1);
    expect(cues).toContain(C.CUES.cut);
    expect(cues).toContain(C.CUES.flaw);
    expect(cues.filter((c) => c === C.CUES.clear)).toHaveLength(1);
    e.apply((s) => e.debug.clearChain(s));
    e.apply((s) => e.debug.setGem(s, 0, 0, "X0"));
    e.apply((s) => e.debug.setGem(s, 1, 0, "X0"));
    e.apply((s) => e.debug.requestSwap(s, 0, 0, 1, 0));
    await e.advance(1);
    await e.advance(3);
    expect(cues).toContain(C.CUES.land);
  });
});
