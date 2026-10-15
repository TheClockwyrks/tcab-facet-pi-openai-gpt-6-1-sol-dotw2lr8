import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import { initial, debug, advance, pointerEvent, action } from "./simulation";
import { loadAssets, render } from "./presentation";
import * as C from "./constants";

export type GemKind =
  "ruby" | "amber" | "citrine" | "jade" | "beryl" | "sapphire" | "amethyst";

export type Cut = "plain" | "brilliant" | "star" | "prism";

export type Screen =
  "title" | "howto" | "playing" | "paused" | "levelclear" | "gameover";

export type Phase = "idle" | "swapping" | "resolving";

export type PointerDevice = "mouse" | "pen" | "touch";

export interface CellRef {
  readonly col: number;
  readonly row: number;
}

export interface GemState {
  readonly col: number;
  readonly row: number;
  readonly kind: GemKind | null;
  readonly cut: Cut;
  readonly strain: number;
  readonly fell: number;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly GemState[];
}

export interface RefusalState {
  readonly a: CellRef;
  readonly b: CellRef;
  readonly timer: number;
}

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface FacetState {
  readonly screen: Screen;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly phase: Phase;
  readonly chainStep: number;
  readonly swapTimer: number;
  readonly stepTimer: number;

  readonly score: number;
  readonly level: number;
  readonly levelScore: number;
  readonly lastCleared: number;
  readonly lastPoints: number;
  readonly lastWaves: number;

  readonly moveScore: number;
  readonly bestMove: number;
  readonly bestChain: number;

  readonly selection: CellRef | null;
  readonly offer: CellRef | null;
  readonly refusal: RefusalState | null;
  readonly armedTarget: string | null;

  readonly pointer: PointerState;
  readonly simTime: number;
  readonly muted: boolean;
  readonly refillKinds: readonly string[];
  /** Loaded media are immutable resources, not simulation data. */
  readonly assets?: Assets;
  /** Derived presentation history for the active transition. */
  readonly animation?: Animation;
}

export interface Assets {
  readonly images: Readonly<Record<string, ImageBitmap>>;
  readonly systems: Readonly<Record<string, DeepReadonly<ParticleSystem>>>;
}
export interface Animation {
  readonly swap: readonly [CellRef, CellRef] | null;
  readonly before: BoardState;
  readonly cleared: readonly {
    readonly index: number;
    readonly wave: number;
  }[];
  readonly created: readonly GemState[];
  readonly openedAt: number;
}
export type FacetDebugApi = typeof debug;
export const BACKGROUND = "#08151e";

export const game: Game<FacetState, FacetDebugApi> = {
  async initialize(api) {
    for (const name of C.ACTIONS)
      api.input.register(name, { keys: [...C.BINDINGS[name]] });
    const assets = await loadAssets(api);
    for (const key of [
      "screen",
      "phase",
      "score",
      "level",
      "levelScore",
      "chainStep",
      "lastCleared",
      "lastPoints",
      "lastWaves",
      "bestMove",
      "bestChain",
    ] as const)
      api.diagnostics.register(key, (s) => s[key]);
    api.diagnostics.register(
      "board",
      (s) => `${s.board.cols} × ${s.board.rows}`,
    );
    api.diagnostics.register("target", (s) => C.LEVEL_TARGET_STEP * s.level);
    api.diagnostics.register("multiplier", (s) =>
      Math.min(s.chainStep, C.MAX_MULTIPLIER),
    );
    api.diagnostics.register("lastFall", (s) => debug.snapshot(s).lastFall);
    api.diagnostics.register("legalSwap", (s) => debug.snapshot(s).legalSwap);
    api.diagnostics.register("selection", (s) => JSON.stringify(s.selection));
    api.diagnostics.register("offer", (s) => JSON.stringify(s.offer));
    api.diagnostics.register(
      "pointer",
      (s) =>
        `${s.pointer.x.toFixed(0)}, ${s.pointer.y.toFixed(0)} ${s.pointer.device}`,
    );
    return [{ ...initial(), assets }, debug];
  },
  update(state, api, dt) {
    let s: FacetState = state;
    const played = new Set<string>();
    const play = (cue: string) => {
      if (!played.has(cue)) {
        api.audio.play(cue);
        played.add(cue);
      }
    };
    const observe = (before: FacetState, after: FacetState) => {
      if (
        after.selection &&
        JSON.stringify(before.selection) !== JSON.stringify(after.selection)
      )
        play(C.CUES.select);
      if (after.phase === "swapping" && before.phase !== "swapping")
        play(C.CUES.swap);
      if (
        after.refusal &&
        after.refusal !== before.refusal &&
        after.refusal.timer === 0
      )
        play(C.CUES.refuse);
    };
    for (const sample of api.input.pointerSamples())
      if (sample.primary) {
        const before = s;
        s = pointerEvent(s, sample.type, sample.x, sample.y, sample.device);
        observe(before, s);
      }
    for (const name of C.ACTIONS)
      if (api.input.pressed(name)) {
        if (name === "mute") api.audio.setMuted(!api.audio.muted());
        else s = action(s, name);
      }
    if (s.phase === "swapping" && s.swapTimer === 0) play(C.CUES.swap);
    if (s.refusal?.timer === 0) play(C.CUES.refuse);
    s = advance(s, dt, (cue, rung) => {
      play(cue);
      if (rung !== undefined) play(`chain-${rung}`);
    });
    const title = s.screen === "title" || s.screen === "howto";
    api.audio.stop(title ? "play-bed" : "title-theme");
    api.audio.loop(title ? "title-theme" : "play-bed");
    const { x, y, down, device } = api.input.pointer();
    return {
      ...s,
      assets: state.assets,
      pointer: { x, y, down, device },
      muted: api.audio.muted(),
    };
  },
  render,
};
