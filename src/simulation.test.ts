import { describe, it, expect, vi, afterEach } from "vitest";
import * as S from "./simulation";
import * as C from "./constants";
import type { FacetState, Screen } from "./game";

const letters = "RACJBSM";
export const rows = () =>
  Array.from({ length: C.GRID_ROWS }, (_, r) =>
    Array.from(
      { length: C.GRID_COLS },
      (_, c) => letters[(r * 2 + c) % C.GEM_KIND_COUNT] + "0",
    ).join(" "),
  );
export const posed = () =>
  S.debug.loadBoard({ ...S.initial(), screen: "playing" }, rows());
const put = (s: FacetState, c: number, r: number, t: string) =>
  S.debug.setGem(s, c, r, t);
const withRun = (n = 3, row = 0) => {
  let s = posed();
  for (let c = 0; c < n; c++) s = put(s, c, row, "R0");
  return s;
};
const step = (s: FacetState) =>
  S.resolve({ ...s, phase: "resolving", chainStep: 1 });
afterEach(() => vi.restoreAllMocks());

describe("board and notation", () => {
  it("builds the entire resting title state", () => {
    const s = S.initial();
    expect(S.snapshot(s)).toMatchObject({
      screen: "title",
      board: { cols: 0, rows: 0, cells: [] },
      phase: "idle",
      simTime: 0,
      levelTarget: C.LEVEL_TARGET_STEP,
      selection: null,
      offer: null,
      refusal: null,
      legalSwap: false,
    });
    expect(s.refillKinds).toHaveLength(C.GRID_COLS);
  });
  it("reads every kind, strain and treatment", () => {
    for (const k of letters)
      for (let strain = 0; strain <= C.MAX_STRAIN; strain++)
        for (const cut of ["", "b", "s"])
          expect(S.token(k + strain + cut, 0, 0)).toMatchObject({
            strain,
            cut: cut === "b" ? "brilliant" : cut === "s" ? "star" : "plain",
            fell: 0,
          });
    expect(S.token("X3", 1, 2)).toMatchObject({
      kind: null,
      cut: "prism",
      strain: 3,
    });
  });
  it.each(["R", "R4", "X0b", "Z0", "R0q", "R0 R1", "r0"])(
    "rejects malformed token %s",
    (t) => expect(() => S.token(t, 0, 0)).toThrow(),
  );
  it("rejects malformed board shapes and off-board poses", () => {
    expect(() => S.debug.loadBoard(S.initial(), [])).toThrow();
    expect(() => S.debug.loadBoard(S.initial(), Array(8).fill("R0"))).toThrow();
    expect(() => S.debug.setGem(posed(), 8, 0, "R0")).toThrow();
    expect(() => S.debug.setGem(S.initial(), 0, 0, "R0")).toThrow();
    expect(() => S.debug.setSelection(posed(), -1, 0)).toThrow();
  });
  it("derives cell positions, legal swaps and dimensions directly from a posed board", () => {
    const snap = S.snapshot(posed());
    expect(snap.board.cells[0]).toMatchObject({
      x: S.cellX(0),
      y: S.cellY(0),
      fell: 0,
    });
    expect(snap.board.cells[snap.board.cells.length - 1]).toMatchObject({
      x: S.cellX(7),
      y: S.cellY(7),
    });
    expect(snap.legalSwap).toBe(false);
    expect(S.snapshot(put(posed(), 3, 3, "X0")).legalSwap).toBe(true);
  });
  it("deals run-free playable opening boards with a journey for every gem", () => {
    for (let n = 0; n < 20; n++) {
      const b = S.deal();
      expect(b.cells).toHaveLength(64);
      expect(S.runs(b)).toEqual([]);
      expect(S.legalSwap(b)).toBe(true);
      for (const g of b.cells) {
        expect(g.fell).toBeGreaterThanOrEqual(g.row + 1);
        expect(g.cut).toBe("plain");
        expect(g.strain).toBe(0);
      }
    }
  });
  it("finds maximal horizontal and vertical runs but never includes prisms", () => {
    let s = withRun(5);
    for (let r = 1; r < 4; r++) s = put(s, 0, r, "R0");
    expect(S.runs(s.board).map((r) => r.length)).toEqual([5, 4]);
    s = put(s, 2, 0, "X0");
    expect(S.runs(s.board).filter((r) => r.includes(2))).toEqual([]);
  });
});
describe("swap transaction and timing", () => {
  it("refuses diagonal, distant, unproductive and busy swaps without changing gems", () => {
    for (const [a, b] of [
      [
        { col: 0, row: 0 },
        { col: 1, row: 1 },
      ],
      [
        { col: 0, row: 0 },
        { col: 2, row: 0 },
      ],
      [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
      ],
    ]) {
      const s = posed(),
        n = S.requestSwap(s, a.col, a.row, b.col, b.row);
      expect(n.board).toBe(s.board);
      expect(n.refusal).toEqual({ a, b, timer: 0 });
    }
    const s = { ...withRun(), phase: "resolving" as const };
    expect(S.requestSwap(s, 0, 0, 1, 0).board).toBe(s.board);
  });
  it("exchanges first and resolves only at the end of the swap", () => {
    const s = withRun();
    let n = S.requestSwap(s, 0, 7, 1, 7);
    expect(n.board.cells[56].kind).toBe(s.board.cells[57].kind);
    expect(n.phase).toBe("swapping");
    expect(n.score).toBe(0);
    n = S.advance(n, C.SWAP_SECONDS - 0.001);
    expect(n.score).toBe(0);
    n = S.advance(n, 0.001);
    expect(n.phase).toBe("resolving");
    expect(n.chainStep).toBe(1);
    expect(n.lastCleared).toBe(3);
    expect(n.score).toBe(3 * C.BASE_SCORE);
    expect(n.swapTimer).toBe(0);
  });
  it("ages refusals only during play", () => {
    let s = S.requestSwap(posed(), 0, 0, 1, 0);
    s = S.advance(s, 0.1);
    expect(s.refusal?.timer).toBeCloseTo(0.1);
    const p = S.advance({ ...s, screen: "paused" }, 5);
    expect(p.refusal).toEqual(s.refusal);
    expect(S.advance(s, C.REFUSAL_SECONDS).refusal).toBeNull();
  });
  it("keeps the input state immutable", () => {
    const s = withRun();
    const before = JSON.stringify(s);
    S.advance(S.requestSwap(s, 0, 7, 1, 7), 1);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("carries dt overflow through all transitions independently of frame partition", () => {
    const s = S.requestSwap(withRun(), 0, 7, 1, 7);
    const simulate = (pieces: number[]) => {
      vi.spyOn(Math, "random").mockReturnValue(0.62);
      let n = s;
      for (const dt of pieces) n = S.advance(n, dt);
      return n;
    };
    const a = simulate([2]);
    vi.restoreAllMocks();
    const b = simulate(Array(200).fill(0.01));
    expect(a.board).toEqual(b.board);
    expect(a.phase).toBe(b.phase);
    expect(a.score).toBe(b.score);
    expect(a.stepTimer).toBeCloseTo(b.stepTimer);
  });
  it("freezes all board timers on non-playing screens while simTime still advances", () => {
    for (const screen of [
      "title",
      "howto",
      "paused",
      "levelclear",
      "gameover",
    ] as Screen[]) {
      const s = { ...S.requestSwap(withRun(), 0, 7, 1, 7), screen };
      const n = S.advance(s, 10);
      expect(n.board).toBe(s.board);
      expect(n.swapTimer).toBe(0);
      expect(n.simTime).toBe(10);
    }
  });
});
describe("strain, cuts, expansion and scoring", () => {
  it("adds strain once per neighboring survivor, and doubles flawed stones", () => {
    let s = withRun(3, 3);
    s = put(s, 0, 2, "A2");
    s = put(s, 0, 3, "R3");
    const n = step(s);
    expect(n.lastPoints).toBe(2 * C.BASE_SCORE + C.FLAWED_SCORE);
    expect(
      n.board.cells.some((g) => g.kind === "amber" && g.strain === 3),
    ).toBe(true);
    expect(n.score).toBe(n.levelScore);
    expect(n.moveScore).toBe(n.score);
  });
  it("follows a flawed corridor in shortest breadth-first waves", () => {
    let s = withRun();
    s = put(s, 2, 1, "J3");
    s = put(s, 2, 2, "B3");
    s = put(s, 2, 3, "M3");
    const n = step(s);
    expect(n.lastCleared).toBe(6);
    expect(n.lastWaves).toBe(3);
    expect(n.animation?.cleared.find((c) => c.index === 26)?.wave).toBe(3);
    expect(n.lastPoints).toBe(3 * C.BASE_SCORE + 3 * C.FLAWED_SCORE);
  });
  it("expands brilliants diagonally and stars across the whole cross", () => {
    const b = step(put(withRun(3, 3), 1, 3, "R0b"));
    expect(b.lastCleared).toBe(9);
    const star = step(put(withRun(3, 3), 1, 3, "R0s"));
    expect(star.lastCleared).toBe(2 * C.GRID_ROWS - 1);
    expect(star.lastWaves).toBe(1);
  });
  it("creates a brilliant for four, and a kindless prism for five", () => {
    const b = step(withRun(4));
    expect(b.animation?.created[0]).toMatchObject({
      col: 1,
      row: 0,
      kind: "ruby",
      cut: "brilliant",
      strain: 0,
    });
    const p = step(withRun(5));
    expect(p.animation?.created[0]).toMatchObject({
      col: 2,
      cut: "prism",
      kind: null,
    });
  });
  it("creates a star at the intersection and honors cut precedence", () => {
    let s = withRun(3, 3);
    for (let r = 2; r <= 4; r++) s = put(s, 1, r, "R0");
    const n = step(s);
    expect(n.animation?.created).toContainEqual(
      expect.objectContaining({ col: 1, row: 3, cut: "star" }),
    );
    s = put(s, 3, 3, "R0");
    s = put(s, 4, 3, "R0");
    const p = step(s);
    expect(p.animation?.created.some((g) => g.cut === "prism")).toBe(true);
  });
  it("places a created cut at the lower-index swapped cell on its run", () => {
    let s = withRun(4);
    s = {
      ...s,
      animation: {
        before: s.board,
        swap: [
          { col: 2, row: 0 },
          { col: 3, row: 0 },
        ],
        cleared: [],
        created: [],
        openedAt: 0,
      },
    };
    expect(step(s).animation?.created[0].col).toBe(2);
  });
  it("prism against a kind clears the prism plus every gem of that kind and makes no cuts", () => {
    let s = put(posed(), 0, 0, "X0");
    const count = s.board.cells.filter(
      (g) => g.kind === s.board.cells[1].kind,
    ).length;
    const n = S.advance(S.requestSwap(s, 0, 0, 1, 0), C.SWAP_SECONDS);
    expect(n.lastCleared).toBe(count + 1);
    expect(n.animation?.created).toEqual([]);
    s = put(s, 1, 0, "X0");
    const all = S.advance(S.requestSwap(s, 0, 0, 1, 0), C.SWAP_SECONDS);
    expect(all.lastCleared).toBe(64);
  });
  it("caps the multiplier without capping the recorded chain depth", () => {
    const n = S.resolve({ ...withRun(), phase: "resolving", chainStep: 12 });
    expect(n.lastPoints).toBe(3 * C.BASE_SCORE * C.MAX_MULTIPLIER);
    expect(n.bestChain).toBe(12);
  });
  it("retains survivor kind, strain and cut through gravity, and records row distance", () => {
    let s = withRun(3, 7);
    s = put(s, 0, 4, "J1b");
    const n = step(s);
    const jade = n.board.cells.find(
      (g) => g.col === 0 && g.cut === "brilliant",
    );
    expect(jade).toMatchObject({ row: 5, strain: 1, kind: "jade", fell: 1 });
    expect(n.board.cells[0].fell).toBeGreaterThanOrEqual(1);
  });
  it("uses refill poses by destination row, without consuming or changing them", () => {
    let s = withRun();
    s = S.debug.setRefillKinds(s, 0, "M");
    const n = step(s);
    expect(n.board.cells[0].kind).toBe("amethyst");
    expect(n.refillKinds).toEqual(s.refillKinds);
    expect(S.debug.clearRefillKinds(n).refillKinds.every((k) => k === "")).toBe(
      true,
    );
    expect(() => S.debug.setRefillKinds(s, 0, "X")).toThrow();
  });
  it("derives the complete wave/fall/hold duration", () => {
    const n = step(put(withRun(), 2, 1, "B3"));
    expect(S.stepHold(n)).toBeCloseTo(
      n.lastWaves * C.WAVE_SECONDS +
        S.lastFall(n) * C.FALL_SECONDS_PER_ROW +
        C.STEP_SECONDS,
    );
  });
  it("emits flaw only on reaching max strain, not for every already-flawed stone", () => {
    let s = put(withRun(), 0, 1, "J2");
    const emit = vi.fn();
    S.advance(S.requestSwap(s, 0, 7, 1, 7), C.SWAP_SECONDS, emit);
    expect(emit.mock.calls.map((a) => a[0])).toContain(C.CUES.flaw);
    s = put(withRun(), 6, 6, "J3");
    emit.mockClear();
    S.advance(S.requestSwap(s, 0, 7, 1, 7), C.SWAP_SECONDS, emit);
    expect(emit.mock.calls.map((a) => a[0])).not.toContain(C.CUES.flaw);
  });
});
describe("menus, debug poses and pointer paths", () => {
  it("poses one field at a time and reconcile is idempotent and inert", () => {
    const s = posed();
    let n = S.debug.setLevel(s, 4);
    n = S.debug.setScore(n, 100);
    n = S.debug.setLevelScore(n, 30);
    n = S.debug.setBestMove(n, 70);
    n = S.debug.setBestChain(n, 3);
    n = S.debug.setMoveScore(n, 60);
    expect(n.board).toBe(s.board);
    expect(S.snapshot(n)).toMatchObject({
      levelTarget: 8000,
      score: 100,
      levelScore: 30,
      bestMove: 70,
      bestChain: 3,
      moveScore: 60,
    });
    expect(S.debug.reconcile(n)).toEqual(n);
    expect(S.debug.reconcile(S.debug.reconcile(n))).toEqual(n);
    expect(() => S.debug.setLevel(s, 0)).toThrow();
    expect(() => S.debug.setMenuIndex(s, -1)).toThrow();
  });
  it("reset restores all declared fields and retains only mute and loaded media", () => {
    const s = { ...posed(), score: 100, muted: true, simTime: 99 };
    expect(S.debug.reset(s)).toEqual({ ...S.initial(true), assets: undefined });
  });
  it("navigates and wraps menus, returning from instructions to the right item", () => {
    let s = S.action(S.initial(), "up");
    expect(s.menuIndex).toBe(1);
    s = S.action(s, "confirm");
    expect(s.screen).toBe("howto");
    s = S.action(s, "back");
    expect(s.menuIndex).toBe(1);
    s = S.action(s, "down");
    s = S.action(s, "confirm");
    expect(s.screen).toBe("playing");
    expect(s.board.cells).toHaveLength(64);
    s = S.action(s, "pause");
    expect(s.screen).toBe("paused");
    expect(S.action(s, "pause").screen).toBe("playing");
  });
  it("quit abandons the board but retains round figures", () => {
    const s = {
      ...posed(),
      screen: "paused" as const,
      menuIndex: 1,
      score: 123,
    };
    const n = S.action(s, "confirm");
    expect(n.screen).toBe("title");
    expect(n.board.cells).toEqual([]);
    expect(n.score).toBe(123);
    expect(n.phase).toBe("idle");
  });
  it("continues with a new level, fresh per-level stats, and carried round score", () => {
    const s = {
      ...posed(),
      screen: "levelclear" as const,
      score: 4000,
      level: 2,
      levelScore: 4000,
      bestMove: 100,
      bestChain: 4,
    };
    const n = S.action(s, "confirm");
    expect(n).toMatchObject({
      screen: "playing",
      level: 3,
      score: 4000,
      levelScore: 0,
      bestMove: 0,
      bestChain: 0,
    });
    expect(S.runs(n.board)).toEqual([]);
  });
  it("gives level completion priority over no moves and only evaluates at chain end", () => {
    const s = {
      ...posed(),
      phase: "resolving" as const,
      chainStep: 1,
      stepTimer: 0,
      levelScore: C.LEVEL_TARGET_STEP,
      moveScore: 300,
    };
    const n = S.advance(s, S.stepHold(s));
    expect(n).toMatchObject({
      screen: "levelclear",
      bestMove: 300,
      chainStep: 0,
    });
    const over = S.advance({ ...s, levelScore: 0 }, S.stepHold(s));
    expect(over.screen).toBe("gameover");
    expect(S.action(over, "back").board).toBe(over.board);
    expect(S.action(over, "confirm").score).toBe(0);
  });
  it("reports drawn non-overlapping touch targets on every screen", () => {
    for (const screen of [
      "title",
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as Screen[]) {
      const ts = S.targets({ ...posed(), screen });
      for (const t of ts) {
        expect(t.w).toBeGreaterThanOrEqual(C.TARGET_MIN_W);
        expect(t.h).toBeGreaterThanOrEqual(C.TARGET_MIN_H);
        expect(t.x + t.w).toBeLessThanOrEqual(C.STAGE_W);
        expect(t.y + t.h).toBeLessThanOrEqual(C.STAGE_H);
      }
      expect(ts.length).toBe(
        screen === "howto" || screen === "playing" ? 1 : 2,
      );
    }
  });
  it("arms a menu target only until a release in the same rectangle", () => {
    let s = S.debug.pointerMove(S.initial(), 600, 520, "touch");
    expect(s.menuIndex).toBe(1);
    s = S.debug.pointerDown(s, 600, 520, "touch");
    expect(s.armedTarget).toBe("menu-1");
    s = S.debug.pointerMove(s, 0, 0, "touch");
    s = S.debug.pointerUp(s, "touch");
    expect(s.screen).toBe("title");
    s = S.debug.pointerDown(s, 600, 520);
    s = S.debug.pointerUp(s);
    expect(s.screen).toBe("howto");
    const t = S.targets(s)[0];
    s = S.debug.pointerDown(s, t.x + 50, t.y + 30);
    s = S.debug.pointerUp(s);
    expect(s.screen).toBe("title");
    expect(s.menuIndex).toBe(1);
  });
  it.each(["mouse", "pen", "touch"] as const)(
    "selects, offers, withdraws, and releases immediately with %s",
    (device) => {
      let s = withRun();
      s = S.debug.pointerDown(s, S.cellX(0), S.cellY(7), device);
      expect(s.selection).toEqual({ col: 0, row: 7 });
      s = S.debug.pointerMove(s, S.cellX(1), S.cellY(7), device);
      expect(s.offer).toEqual({ col: 1, row: 7 });
      s = S.debug.pointerMove(s, S.cellX(0), S.cellY(7), device);
      expect(s.offer).toBeNull();
      s = S.debug.pointerMove(s, S.cellX(1), S.cellY(7), device);
      s = S.debug.pointerUp(s, device);
      expect(s.phase).toBe("swapping");
      expect(s.selection).toBeNull();
      expect(s.offer).toBeNull();
      expect(s.pointer.device).toBe(device);
      expect(s.simTime).toBe(0);
    },
  );
  it("supports tapping two cells, reselection, misses and exact hit ties", () => {
    let s = S.debug.pointerDown(posed(), S.cellX(0), S.cellY(0));
    s = S.debug.pointerUp(s);
    s = S.debug.pointerDown(s, S.cellX(1), S.cellY(0));
    expect(s.offer).toEqual({ col: 1, row: 0 });
    s = S.debug.pointerUp(s);
    expect(s.refusal).not.toBeNull();
    s = S.debug.pointerDown(s, S.cellX(4), S.cellY(4));
    s = S.debug.pointerDown(s, S.cellX(6), S.cellY(6));
    expect(s.selection).toEqual({ col: 6, row: 6 });
    s = S.debug.pointerDown(s, 0, 0);
    expect(s.selection).toBeNull();
    s = S.debug.pointerDown(s, S.cellX(0) + C.GEM_HIT_R, S.cellY(0));
    expect(s.selection).toEqual({ col: 0, row: 0 });
  });
  it("keeps independent offers and selections when explicitly posed", () => {
    let s = S.debug.setOffer(posed(), 1, 1);
    s = S.debug.setSelection(s, 0, 1);
    s = S.debug.clearSelection(s);
    expect(s.offer).toEqual({ col: 1, row: 1 });
    expect(S.debug.clearOffer(s).offer).toBeNull();
    expect(S.debug.clearBoard(s).selection).toBeNull();
    expect(S.debug.clearChain({ ...s, phase: "swapping" }).phase).toBe("idle");
  });
});
