import type {
  FacetState,
  GemState,
  GemKind,
  BoardState,
  CellRef,
  Screen,
  PointerDevice,
} from "./game";
import * as C from "./constants";

export const cellX = (col: number) =>
  C.BOARD_CX - ((C.GRID_COLS - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const cellY = (row: number) =>
  C.BOARD_CY - ((C.GRID_ROWS - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
const empty = (): BoardState => ({ cols: 0, rows: 0, cells: [] });
export function initial(muted = false): FacetState {
  return {
    screen: "title",
    menuIndex: 0,
    board: empty(),
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    score: 0,
    level: 1,
    levelScore: 0,
    lastCleared: 0,
    lastPoints: 0,
    lastWaves: 0,
    moveScore: 0,
    bestMove: 0,
    bestChain: 0,
    selection: null,
    offer: null,
    refusal: null,
    armedTarget: null,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    simTime: 0,
    muted,
    refillKinds: Array(C.GRID_COLS).fill(""),
  };
}
const idx = (p: CellRef) => p.row * C.GRID_COLS + p.col;
const ref = (i: number): CellRef => ({
  col: i % C.GRID_COLS,
  row: Math.floor(i / C.GRID_COLS),
});
export const adjacent = (a: CellRef, b: CellRef) =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
function valid(n: number, min = 0, max = Infinity) {
  if (!Number.isInteger(n) || n < min || n > max)
    throw new RangeError(`Invalid value: ${n}`);
}
function cell(col: number, row: number) {
  valid(col, 0, C.GRID_COLS - 1);
  valid(row, 0, C.GRID_ROWS - 1);
  return { col, row };
}
const letters = "RACJBSM";
export function token(t: string, col: number, row: number): GemState {
  if (!/^(?:[RACJBSM][0-3][bs]?|X[0-3])$/.test(t))
    throw new Error(`Invalid gem: ${t}`);
  return {
    col,
    row,
    kind: t[0] === "X" ? null : C.GEM_KINDS[letters.indexOf(t[0])],
    strain: Number(t[1]),
    cut:
      t[0] === "X"
        ? "prism"
        : t[2] === "b"
          ? "brilliant"
          : t[2] === "s"
            ? "star"
            : "plain",
    fell: 0,
  };
}
export function runs(board: BoardState): number[][] {
  const out: number[][] = [];
  for (const vertical of [false, true])
    for (let line = 0; line < (vertical ? board.cols : board.rows); line++) {
      let run: number[] = [];
      const flush = () => {
        if (run.length >= C.MATCH_MIN) out.push(run);
      };
      for (let k = 0; k < (vertical ? board.rows : board.cols); k++) {
        const i = vertical ? k * board.cols + line : line * board.cols + k;
        if (run.length && board.cells[i].kind !== board.cells[run[0]].kind) {
          flush();
          run = [];
        }
        if (board.cells[i].kind !== null) run.push(i);
        else {
          flush();
          run = [];
        }
      }
      flush();
    }
  return out;
}
function exchanged(board: BoardState, a: CellRef, b: CellRef): BoardState {
  const ai = idx(a),
    bi = idx(b);
  return {
    ...board,
    cells: board.cells.map((g, i) =>
      i === ai
        ? { ...board.cells[bi], ...a, fell: 0 }
        : i === bi
          ? { ...board.cells[ai], ...b, fell: 0 }
          : g,
    ),
  };
}
function productive(board: BoardState, a: CellRef, b: CellRef) {
  return (
    board.cells[idx(a)]?.cut === "prism" ||
    board.cells[idx(b)]?.cut === "prism" ||
    runs(exchanged(board, a, b)).length > 0
  );
}
export function legalSwap(board: BoardState): boolean {
  for (const g of board.cells)
    for (const p of [
      { col: g.col + 1, row: g.row },
      { col: g.col, row: g.row + 1 },
    ])
      if (p.col < board.cols && p.row < board.rows && productive(board, g, p))
        return true;
  return false;
}
const randomKind = (): GemKind =>
  C.GEM_KINDS[Math.floor(Math.random() * C.GEM_KIND_COUNT)];
export function deal(): BoardState {
  for (;;) {
    const cells: GemState[] = [];
    for (let row = 0; row < C.GRID_ROWS; row++)
      for (let col = 0; col < C.GRID_COLS; col++) {
        let kind: GemKind;
        do {
          kind = randomKind();
        } while (
          (col >= 2 &&
            cells[cells.length - 1].kind === kind &&
            cells[cells.length - 2].kind === kind) ||
          (row >= 2 &&
            cells[(row - 1) * C.GRID_COLS + col].kind === kind &&
            cells[(row - 2) * C.GRID_COLS + col].kind === kind)
        );
        cells.push({ col, row, kind, cut: "plain", strain: 0, fell: row + 1 });
      }
    const b = { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
    if (legalSwap(b)) return b;
  }
}
export function requestSwap(
  s: FacetState,
  colA: number,
  rowA: number,
  colB: number,
  rowB: number,
): FacetState {
  const a = cell(colA, rowA),
    b = cell(colB, rowB);
  if (!s.board.cells[idx(a)] || !s.board.cells[idx(b)])
    throw new Error("No gem at cell");
  if (s.phase !== "idle" || !adjacent(a, b) || !productive(s.board, a, b))
    return { ...s, refusal: { a, b, timer: 0 } };
  return {
    ...s,
    board: exchanged(s.board, a, b),
    phase: "swapping",
    swapTimer: 0,
    chainStep: 0,
    stepTimer: 0,
    moveScore: 0,
    animation: {
      swap: [a, b],
      before: s.board,
      cleared: [],
      created: [],
      openedAt: s.simTime,
    },
  };
}
function neighbors(i: number, diagonal = false): number[] {
  const p = ref(i),
    out: number[] = [];
  for (let y = -1; y <= 1; y++)
    for (let x = -1; x <= 1; x++) {
      if (
        (x || y) &&
        (diagonal || Math.abs(x) + Math.abs(y) === 1) &&
        p.col + x >= 0 &&
        p.col + x < C.GRID_COLS &&
        p.row + y >= 0 &&
        p.row + y < C.GRID_ROWS
      )
        out.push(idx({ col: p.col + x, row: p.row + y }));
    }
  return out;
}
export function resolve(s: FacetState): FacetState {
  const b = s.board;
  let rs = runs(b);
  let seed = rs.flat();
  const swap = s.animation?.swap;
  if (s.chainStep === 1 && swap) {
    const a = b.cells[idx(swap[0])],
      d = b.cells[idx(swap[1])];
    if (a.cut === "prism" || d.cut === "prism") {
      rs = [];
      const kind = a.cut === "prism" ? d.kind : a.kind;
      seed = b.cells.flatMap((g, i) =>
        kind === null ||
        g.kind === kind ||
        (g.cut === "prism" && (i === idx(swap[0]) || i === idx(swap[1])))
          ? [i]
          : [],
      );
    }
  }
  const waves = new Map<number, number>();
  const queue: number[] = [];
  for (const i of seed)
    if (!waves.has(i)) {
      waves.set(i, 0);
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q],
      g = b.cells[i],
      wave = waves.get(i)!;
    const additions = neighbors(i).filter(
      (j) => b.cells[j].strain === C.MAX_STRAIN,
    );
    if (g.cut === "brilliant") additions.push(...neighbors(i, true));
    if (g.cut === "star")
      for (let j = 0; j < b.cells.length; j++)
        if (b.cells[j].col === g.col || b.cells[j].row === g.row)
          additions.push(j);
    for (const j of additions)
      if (!waves.has(j)) {
        waves.set(j, wave + 1);
        queue.push(j);
      }
  }
  if (!waves.size) return s;
  const created = new Map<number, GemState>();
  const rank = { plain: 0, brilliant: 1, star: 2, prism: 3 };
  const create = (i: number, cut: GemState["cut"]) => {
    if (rank[created.get(i)?.cut ?? "plain"] < rank[cut])
      created.set(i, {
        ...b.cells[i],
        kind: cut === "prism" ? null : b.cells[i].kind,
        cut,
        strain: 0,
        fell: 0,
      });
  };
  for (const run of rs) {
    if (run.length >= 4) {
      const at =
        swap
          ?.map(idx)
          .filter((i) => run.includes(i))
          .sort((a, b) => run.indexOf(a) - run.indexOf(b))[0] ??
        run[Math.floor((run.length - 1) / 2)];
      create(at, run.length >= 5 ? "prism" : "brilliant");
    }
  }
  for (let a = 0; a < rs.length; a++)
    for (let d = a + 1; d < rs.length; d++)
      for (const i of rs[a]) if (rs[d].includes(i)) create(i, "star");
  const near = new Set(queue.flatMap((i) => neighbors(i)));
  const points = queue.reduce(
    (p, i) =>
      p +
      (b.cells[i].strain === C.MAX_STRAIN ? C.FLAWED_SCORE : C.BASE_SCORE) *
        Math.min(s.chainStep, C.MAX_MULTIPLIER),
    0,
  );
  const cells: GemState[] = [];
  for (let col = 0; col < b.cols; col++) {
    const survivors = b.cells
      .filter((g) => g.col === col)
      .flatMap((g) => {
        const i = idx(g);
        if (created.has(i)) return [created.get(i)!];
        if (waves.has(i)) return [];
        return [
          {
            ...g,
            strain: Math.min(C.MAX_STRAIN, g.strain + (near.has(i) ? 1 : 0)),
          },
        ];
      });
    const missing = b.rows - survivors.length;
    for (let row = 0; row < b.rows; row++) {
      if (row < missing) {
        const k = s.refillKinds[col][row];
        cells.push({
          col,
          row,
          kind: k ? C.GEM_KINDS[letters.indexOf(k)] : randomKind(),
          cut: "plain",
          strain: 0,
          fell: missing,
        });
      } else {
        const g = survivors[row - missing];
        cells.push({ ...g, row, fell: row - g.row });
      }
    }
  }
  cells.sort((a, b) => idx(a) - idx(b));
  return {
    ...s,
    board: { ...b, cells },
    lastCleared: queue.length,
    lastPoints: points,
    lastWaves: Math.max(...waves.values()),
    score: s.score + points,
    levelScore: s.levelScore + points,
    moveScore: s.moveScore + points,
    bestChain: Math.max(s.bestChain, s.chainStep),
    animation: {
      swap: swap ?? null,
      before: b,
      cleared: queue.map((i) => ({ index: i, wave: waves.get(i)! })),
      created: [...created.values()],
      openedAt: s.animation?.openedAt ?? s.simTime,
    },
  };
}
export const lastFall = (s: FacetState) =>
  Math.max(0, ...s.board.cells.map((g) => g.fell));
export const stepHold = (s: FacetState) =>
  s.lastWaves * C.WAVE_SECONDS +
  lastFall(s) * C.FALL_SECONDS_PER_ROW +
  C.STEP_SECONDS;
export function advance(
  state: FacetState,
  dt: number,
  emit: (cue: string, rung?: number) => void = () => {},
): FacetState {
  let s = { ...state, simTime: state.simTime + dt };
  const runStep = (next: FacetState) => {
    const result = resolve(next);
    if (result.score > next.score) {
      emit(C.CUES.clear, Math.min(next.chainStep, C.MAX_MULTIPLIER));
      if (result.animation?.created.length) emit(C.CUES.cut);
      const cleared = new Set(result.animation?.cleared.map((c) => c.index));
      if (
        next.board.cells.some(
          (g, i) =>
            g.strain === C.MAX_STRAIN - 1 &&
            !cleared.has(i) &&
            neighbors(i).some((j) => cleared.has(j)),
        )
      )
        emit(C.CUES.flaw);
    }
    return result;
  };
  if (s.screen !== "playing") return s;
  if (s.refusal)
    s = {
      ...s,
      refusal:
        s.refusal.timer + dt >= C.REFUSAL_SECONDS
          ? null
          : { ...s.refusal, timer: s.refusal.timer + dt },
    };
  let remaining = dt;
  while (remaining > 1e-10 && s.phase !== "idle") {
    if (s.phase === "swapping") {
      const used = Math.min(remaining, C.SWAP_SECONDS - s.swapTimer);
      remaining -= used;
      s = { ...s, swapTimer: s.swapTimer + used };
      if (s.swapTimer >= C.SWAP_SECONDS - 1e-10)
        s = runStep({
          ...s,
          swapTimer: 0,
          phase: "resolving",
          chainStep: 1,
          stepTimer: 0,
        });
    } else {
      const used = Math.min(remaining, Math.max(0, stepHold(s) - s.stepTimer));
      remaining -= used;
      const landAt =
        s.lastWaves * C.WAVE_SECONDS + lastFall(s) * C.FALL_SECONDS_PER_ROW;
      if (
        lastFall(s) > C.LAND_MIN_ROWS &&
        s.stepTimer < landAt &&
        s.stepTimer + used >= landAt - 1e-10
      )
        emit(C.CUES.land);
      s = { ...s, stepTimer: s.stepTimer + used };
      if (s.stepTimer >= stepHold(s) - 1e-10) {
        if (runs(s.board).length)
          s = runStep({ ...s, chainStep: s.chainStep + 1, stepTimer: 0 });
        else {
          s = {
            ...s,
            phase: "idle",
            chainStep: 0,
            stepTimer: 0,
            bestMove: Math.max(s.bestMove, s.moveScore),
          };
          if (s.levelScore >= C.LEVEL_TARGET_STEP * s.level) {
            s = show(s, "levelclear");
            emit(C.CUES.levelUp);
          } else if (!legalSwap(s.board)) {
            s = show(s, "gameover");
            emit(C.CUES.gameOver);
          }
        }
      }
    }
  }
  return s;
}
export const menuItems = (screen: Screen): readonly string[] =>
  screen === "title"
    ? C.TITLE_ITEMS
    : screen === "paused"
      ? C.PAUSED_ITEMS
      : screen === "levelclear"
        ? C.LEVELCLEAR_ITEMS
        : screen === "gameover"
          ? C.GAMEOVER_ITEMS
          : [];
export function targets(s: FacetState) {
  if (s.screen === "playing")
    return [{ id: "pause", x: 1044, y: 64, w: 144, h: C.TARGET_MIN_H }];
  if (s.screen === "howto")
    return [{ id: "back", x: 1080, y: 610, w: 144, h: C.TARGET_MIN_H }];
  return menuItems(s.screen).map((_, i) => ({
    id: `menu-${i}`,
    x: 480,
    y: 400 + i * 88,
    w: 320,
    h: C.TARGET_MIN_H,
  }));
}
const show = (s: FacetState, screen: Screen, menuIndex = 0): FacetState => ({
  ...s,
  screen,
  menuIndex,
  armedTarget: null,
});
const start = (s: FacetState): FacetState => ({
  ...initial(s.muted),
  assets: s.assets,
  simTime: s.simTime,
  pointer: s.pointer,
  screen: "playing",
  board: deal(),
  animation: {
    before: empty(),
    swap: null,
    cleared: [],
    created: [],
    openedAt: s.simTime,
  },
});
export function action(s: FacetState, a: string): FacetState {
  if ((a === "up" || a === "down") && menuItems(s.screen).length)
    return {
      ...s,
      menuIndex:
        (s.menuIndex + (a === "up" ? -1 : 1) + menuItems(s.screen).length) %
        menuItems(s.screen).length,
    };
  if (a === "pause") {
    if (s.screen === "playing") return show(s, "paused");
    if (s.screen === "paused") return show(s, "playing");
  }
  if (a === "back") {
    if (s.screen === "howto") return show(s, "title", 1);
    if (s.screen === "gameover") return show(s, "title");
  }
  if (a !== "confirm") return s;
  if (s.screen === "title")
    return s.menuIndex === 0 ? start(s) : show(s, "howto");
  if (s.screen === "paused" && s.menuIndex === 0) return show(s, "playing");
  if (s.screen === "gameover" && s.menuIndex === 0) return start(s);
  if (s.screen === "levelclear" && s.menuIndex === 0)
    return {
      ...show(s, "playing"),
      level: s.level + 1,
      levelScore: 0,
      bestMove: 0,
      bestChain: 0,
      board: deal(),
      animation: {
        before: empty(),
        swap: null,
        cleared: [],
        created: [],
        openedAt: s.simTime,
      },
    };
  if (["paused", "levelclear", "gameover"].includes(s.screen))
    return {
      ...show(s, "title"),
      board: empty(),
      phase: "idle",
      chainStep: 0,
      swapTimer: 0,
      stepTimer: 0,
      selection: null,
      offer: null,
      refusal: null,
      animation: undefined,
    };
  return s;
}
function hitCell(s: FacetState, x: number, y: number): CellRef | null {
  let found: CellRef | null = null,
    dist = C.GEM_HIT_R ** 2;
  for (const g of s.board.cells) {
    const d = (cellX(g.col) - x) ** 2 + (cellY(g.row) - y) ** 2;
    if (d <= dist && (!found || d < dist)) {
      found = { col: g.col, row: g.row };
      dist = d;
    }
  }
  return found;
}
export function pointerEvent(
  s: FacetState,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice = "mouse",
): FacetState {
  if (
    !["mouse", "touch", "pen"].includes(device) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  )
    throw new Error("Invalid pointer");
  let n: FacetState = {
    ...s,
    pointer: {
      x,
      y,
      down: type === "down" ? true : type === "up" ? false : s.pointer.down,
      device,
    },
  };
  const target = targets(s).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if (target?.id.startsWith("menu-"))
    n = { ...n, menuIndex: Number(target.id.slice(5)) };
  if (type === "down") n = { ...n, armedTarget: target?.id ?? null };
  if (type === "up") {
    const armed = n.armedTarget;
    n = { ...n, armedTarget: null };
    if (target && target.id === armed)
      return action(
        n,
        target.id === "pause"
          ? "pause"
          : target.id === "back"
            ? "back"
            : "confirm",
      );
  }
  if (s.screen !== "playing" || target || s.armedTarget) return n;
  const p = hitCell(s, x, y);
  if (type === "down") {
    if (!p) return { ...n, selection: null, offer: null };
    if (
      !s.selection ||
      (!adjacent(p, s.selection) && idx(p) !== idx(s.selection))
    )
      return { ...n, selection: p, offer: null };
    return { ...n, offer: idx(p) === idx(s.selection) ? null : p };
  }
  if (type === "move" && s.pointer.down && s.selection && p) {
    if (idx(p) === idx(s.selection)) return { ...n, offer: null };
    if (adjacent(p, s.selection)) return { ...n, offer: p };
  }
  if (type === "up" && s.selection && s.offer)
    return {
      ...requestSwap(
        n,
        s.selection.col,
        s.selection.row,
        s.offer.col,
        s.offer.row,
      ),
      selection: null,
      offer: null,
    };
  return n;
}
export function snapshot(s: FacetState) {
  return {
    version: C.FACET_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    score: s.score,
    level: s.level,
    levelScore: s.levelScore,
    levelTarget: C.LEVEL_TARGET_STEP * s.level,
    phase: s.phase,
    chainStep: s.chainStep,
    multiplier: Math.min(s.chainStep, C.MAX_MULTIPLIER),
    swapTimer: s.swapTimer,
    stepTimer: s.stepTimer,
    stepHold: stepHold(s),
    board: {
      ...s.board,
      cells: s.board.cells.map((g) => ({
        ...g,
        x: cellX(g.col),
        y: cellY(g.row),
      })),
    },
    selection: s.selection,
    offer: s.offer,
    refusal: s.refusal ? { a: s.refusal.a, b: s.refusal.b } : null,
    lastCleared: s.lastCleared,
    lastPoints: s.lastPoints,
    lastWaves: s.lastWaves,
    lastFall: lastFall(s),
    moveScore: s.moveScore,
    bestMove: s.bestMove,
    bestChain: s.bestChain,
    legalSwap: legalSwap(s.board),
    refillKinds: [...s.refillKinds],
    pointer: { ...s.pointer },
    armedTarget: s.armedTarget,
    targets: targets(s),
    muted: s.muted,
    simTime: s.simTime,
  };
}
const numberPose =
  (
    key:
      | "score"
      | "levelScore"
      | "bestMove"
      | "bestChain"
      | "moveScore"
      | "level"
      | "menuIndex",
    min = 0,
  ) =>
  (s: FacetState, n: number): FacetState => {
    if (["score", "levelScore", "bestMove", "moveScore"].includes(key)) {
      if (!Number.isFinite(n)) throw new RangeError(`Invalid points: ${n}`);
    } else valid(n, min);
    return { ...s, [key]: n };
  };
export const debug = {
  version: C.FACET_DEBUG_VERSION,
  reset: (s: FacetState) => ({ ...initial(s.muted), assets: s.assets }),
  reconcile: (s: FacetState) => ({ ...s }),
  snapshot,
  setScreen: (s: FacetState, screen: Screen): FacetState => {
    if (
      ![
        "title",
        "howto",
        "playing",
        "paused",
        "levelclear",
        "gameover",
      ].includes(screen)
    )
      throw new Error("Invalid screen");
    return { ...s, screen };
  },
  setMenuIndex: numberPose("menuIndex"),
  loadBoard: (s: FacetState, rows: readonly string[]): FacetState => {
    if (rows.length !== C.GRID_ROWS) throw new Error("Invalid rows");
    return {
      ...s,
      board: {
        cols: C.GRID_COLS,
        rows: C.GRID_ROWS,
        cells: rows.flatMap((r, row) => {
          const ts = r.trim().split(/\s+/);
          if (ts.length !== C.GRID_COLS) throw new Error("Invalid columns");
          return ts.map((t, col) => token(t, col, row));
        }),
      },
    };
  },
  dealBoard: (s: FacetState): FacetState => ({ ...s, board: deal() }),
  clearBoard: (s: FacetState): FacetState => ({ ...s, board: empty() }),
  setGem: (s: FacetState, col: number, row: number, t: string): FacetState => {
    const p = cell(col, row);
    if (!s.board.cells[idx(p)]) throw new Error("No board");
    const gem = token(t, col, row);
    return {
      ...s,
      board: {
        ...s.board,
        cells: s.board.cells.map((g, i) => (i === idx(p) ? gem : g)),
      },
    };
  },
  setRefillKinds: (s: FacetState, col: number, kinds: string): FacetState => {
    valid(col, 0, C.GRID_COLS - 1);
    if (!/^[RACJBSM]*$/.test(kinds)) throw new Error("Invalid refill");
    return {
      ...s,
      refillKinds: s.refillKinds.map((k, c) => (c === col ? kinds : k)),
    };
  },
  clearRefillKinds: (s: FacetState): FacetState => ({
    ...s,
    refillKinds: Array(C.GRID_COLS).fill(""),
  }),
  setScore: numberPose("score"),
  setLevel: numberPose("level", 1),
  setLevelScore: numberPose("levelScore"),
  setBestChain: numberPose("bestChain"),
  setBestMove: numberPose("bestMove"),
  setMoveScore: numberPose("moveScore"),
  setSelection: (s: FacetState, col: number, row: number): FacetState => ({
    ...s,
    selection: cell(col, row),
  }),
  clearSelection: (s: FacetState): FacetState => ({ ...s, selection: null }),
  setOffer: (s: FacetState, col: number, row: number): FacetState => ({
    ...s,
    offer: cell(col, row),
  }),
  clearOffer: (s: FacetState): FacetState => ({ ...s, offer: null }),
  clearRefusal: (s: FacetState): FacetState => ({ ...s, refusal: null }),
  clearChain: (s: FacetState): FacetState => ({
    ...s,
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
  }),
  requestSwap,
  pointerDown: (
    s: FacetState,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ) => pointerEvent(s, "down", x, y, device),
  pointerMove: (
    s: FacetState,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ) => pointerEvent(s, "move", x, y, device),
  pointerUp: (s: FacetState, device: PointerDevice = "mouse") =>
    pointerEvent(s, "up", s.pointer.x, s.pointer.y, device),
};
