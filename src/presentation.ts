import type { InitApi, RenderApi } from "@clockwyrks/simple-2d";
import {
  ParticleSimulator,
  type ParticleSystem,
} from "@clockwyrks/particle-runtime";
import type { Assets, FacetState, GemState } from "./game";
import { cellX, cellY, menuItems, targets } from "./simulation";
import * as C from "./constants";

export async function loadAssets(api: InitApi<FacetState>): Promise<Assets> {
  const fontBlob = await api.assets.load("fonts/serif.ttf");
  if (typeof FontFace !== "undefined") {
    const face = await new FontFace(
      "Facet Serif",
      await fontBlob.arrayBuffer(),
    ).load();
    document.fonts.add(face);
  }
  const paths = [
    "frame",
    "brilliant",
    "star",
    ...C.GEM_KINDS.flatMap((k) =>
      Array.from({ length: 4 }, (_, s) => `${k}-${s}`),
    ),
    ...Array.from({ length: 4 }, (_, s) => `prism-${s}`),
    ...C.GEM_KINDS.flatMap((k) =>
      Array.from({ length: 7 }, (_, f) => `break/${k}/${f}`),
    ),
    ...Array.from({ length: 12 }, (_, f) => `prism-turn/${f}`),
  ];
  const images = Object.fromEntries(
    await Promise.all(
      paths.map(async (p) => [p, await api.assets.loadImage(`gems/${p}.png`)]),
    ),
  );
  const systems = Object.fromEntries(
    await Promise.all(
      ["clear", "flawed", "cut", "aura"].map(async (p) => [
        p,
        JSON.parse(
          await (await api.assets.load(`fx/${p}/system.json`)).text(),
        ) as ParticleSystem,
      ]),
    ),
  );
  await Promise.all([
    ...Object.values(C.CUES)
      .filter((c) => c !== C.CUES.clear)
      .map((c) => api.audio.load(c, `audio/${c}.wav`)),
    api.audio.load(C.CUES.clear, "audio/shatter.wav"),
    ...Array.from({ length: C.MAX_MULTIPLIER }, (_, i) =>
      api.audio.load(`chain-${i + 1}`, `audio/chain-${i + 1}.wav`),
    ),
    api.audio.load("title-theme", "audio/title.wav"),
    api.audio.load("play-bed", "audio/play.wav"),
  ]);
  return { images, systems };
}
const ink = "#e6e9df",
  gold = "#d4ba7e",
  dim = "#78919d",
  teal = "#80d8cc";
function text(
  ctx: CanvasRenderingContext2D,
  t: string,
  x: number,
  y: number,
  size = 16,
  color = ink,
  font = "sans-serif",
  align: CanvasTextAlign = "left",
) {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${font === "Georgia" ? '"Facet Serif", serif' : font}`;
  ctx.textAlign = align;
  ctx.fillText(t, x, y);
}
function rule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  color = "#29404a",
) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
}
function tracked(
  ctx: CanvasRenderingContext2D,
  t: string,
  x: number,
  y: number,
  size: number,
  spacing: number,
  color: string,
) {
  ctx.font = `${size}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  for (const ch of t) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + spacing;
  }
}
function field(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(C.STAGE_CX, 340, 80, C.STAGE_CX, 340, 740);
  g.addColorStop(0, "#142c38");
  g.addColorStop(0.65, "#0b1c27");
  g.addColorStop(1, "#08151e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.strokeStyle = "#26404b";
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.22;
  for (let i = -8; i < 25; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 100, 0);
    ctx.lineTo(i * 100 + 720, 720);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  rule(ctx, 48, 26, 1184, "#34464b");
  rule(ctx, 48, 694, 1184, "#34464b");
  text(ctx, "F /", 49, 57, 22, gold, "Georgia");
  tracked(ctx, "FACET   /   THE LAPIDARY SERIES", 91, 54, 11, 2, dim);
  text(ctx, "A STUDY IN PRESSURE", 1230, 54, 11, dim, "monospace", "right");
}
function sprite(
  ctx: CanvasRenderingContext2D,
  s: FacetState,
  key: string,
  x: number,
  y: number,
  scale = 1,
) {
  const image = s.assets?.images[key];
  if (image)
    ctx.drawImage(
      image,
      x - 32 * scale,
      y - 32 * scale,
      64 * scale,
      64 * scale,
    );
}
function stone(
  ctx: CanvasRenderingContext2D,
  s: FacetState,
  g: GemState,
  x: number,
  y: number,
  animated = true,
) {
  ctx.save();
  ctx.shadowColor = g.strain === C.MAX_STRAIN ? "#e9bd7180" : "#000000";
  ctx.shadowBlur = g.strain === C.MAX_STRAIN ? 10 : 8;
  ctx.shadowOffsetY = 3;
  if (g.cut === "prism" && animated) {
    sprite(ctx, s, `prism-turn/${Math.floor(s.simTime * 9) % 12}`, x, y);
    if (g.strain > 0) {
      ctx.globalAlpha = 0.7;
      sprite(ctx, s, `prism-${g.strain}`, x, y);
      ctx.globalAlpha = 1;
    }
  } else sprite(ctx, s, `${g.kind ?? "prism"}-${g.strain}`, x, y);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (g.cut === "brilliant" || g.cut === "star") sprite(ctx, s, g.cut, x, y);
  ctx.restore();
  if (g.cut !== "plain" && animated)
    particles(
      ctx,
      s,
      "aura",
      x,
      y,
      (s.simTime % 2) + 0.1,
      g.col + g.row * C.GRID_COLS,
    );
}
/** Replay live systems from state time. No renderer-owned clock or simulation state. */
function particles(
  ctx: CanvasRenderingContext2D,
  s: FacetState,
  name: string,
  x: number,
  y: number,
  age: number,
  seed: number,
) {
  if (age < 0 || age > 2 || !s.assets) return;
  const sys = s.assets.systems[name] as ParticleSystem;
  const sim = new ParticleSimulator(sys, {
    seed: seed + Math.floor((s.animation?.openedAt ?? 0) * 1000),
  });
  let t = age * 1000;
  while (t > 0) {
    const dt = Math.min(t, 1000 / 30);
    sim.step(dt);
    t -= dt;
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of sim.capture()) {
    const [r, g, b] = p.color.map((c) => Math.round(c * 255));
    ctx.fillStyle = `rgba(${r},${g},${b},${p.opacity})`;
    const px = x + p.position[0],
      py = y - p.position[1],
      radius = Math.max(0.5, p.size * 1.6);
    ctx.beginPath();
    ctx.moveTo(px, py - radius * 1.7);
    ctx.lineTo(px + radius, py);
    ctx.lineTo(px, py + radius * 1.7);
    ctx.lineTo(px - radius, py);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
function board(ctx: CanvasRenderingContext2D, s: FacetState) {
  if (!s.board.cells.length) return;
  const frame = s.assets?.images.frame;
  if (frame) {
    ctx.save();
    ctx.shadowColor = "#0008";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(frame, 336, 92);
    ctx.restore();
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(350, 106, 580, 580);
  ctx.clip();
  const anim = s.animation;
  const shatter = s.lastWaves * C.WAVE_SECONDS;
  const time = s.stepTimer;
  const resolving = s.phase === "resolving" && anim?.cleared.length;
  if (resolving && time < shatter + 0.28) {
    for (const g of anim.before.cells) {
      const hit = anim.cleared.find(
        (c) => c.index === g.row * C.GRID_COLS + g.col,
      );
      if (!hit && time < shatter) stone(ctx, s, g, cellX(g.col), cellY(g.row));
      if (hit) {
        const age = time - hit.wave * C.WAVE_SECONDS;
        if (age < 0) stone(ctx, s, g, cellX(g.col), cellY(g.row));
        else if (age < 0.28 && g.kind)
          sprite(
            ctx,
            s,
            `break/${g.kind}/${Math.min(6, Math.floor(age / 0.04))}`,
            cellX(g.col),
            cellY(g.row),
          );
      }
    }
  }
  for (const g of s.board.cells) {
    let x = cellX(g.col),
      y = cellY(g.row);
    if (s.offer && s.selection) {
      if (g.col === s.selection.col && g.row === s.selection.row) {
        x = cellX(s.offer.col);
        y = cellY(s.offer.row);
      } else if (g.col === s.offer.col && g.row === s.offer.row) {
        x = cellX(s.selection.col);
        y = cellY(s.selection.row);
      }
    }
    if (s.phase === "swapping" && anim?.swap) {
      const pair = anim.swap;
      const pos = pair.findIndex((p) => p.col === g.col && p.row === g.row);
      if (pos >= 0) {
        const from = pair[1 - pos],
          t = s.swapTimer / C.SWAP_SECONDS,
          e = t * t * (3 - 2 * t);
        x = cellX(from.col) + (x - cellX(from.col)) * e;
        y = cellY(from.row) + (y - cellY(from.row)) * e;
      }
    }
    if (resolving) {
      if (time < shatter) continue;
      const fallTime = Math.max(0, time - shatter),
        duration = g.fell * C.FALL_SECONDS_PER_ROW;
      const t = duration ? Math.min(1, fallTime / duration) : 1;
      y -= g.fell * C.CELL_PITCH * (1 - t * t);
    } else if (s.phase === "idle" && anim && !anim.before.cells.length) {
      const age = s.simTime - anim.openedAt,
        duration = g.fell * C.FALL_SECONDS_PER_ROW;
      const t = duration ? Math.min(1, Math.max(0, age / duration)) : 1;
      y -= g.fell * C.CELL_PITCH * (1 - t * t);
    }
    stone(ctx, s, g, x, y, s.screen === "playing");
  }
  ctx.restore();
  if (resolving) {
    for (const hit of anim.cleared) {
      const g = anim.before.cells[hit.index],
        age = time - hit.wave * C.WAVE_SECONDS;
      particles(
        ctx,
        s,
        g.strain === C.MAX_STRAIN ? "flawed" : "clear",
        cellX(g.col),
        cellY(g.row),
        age,
        hit.index,
      );
    }
    for (const g of anim.created)
      particles(
        ctx,
        s,
        "cut",
        cellX(g.col),
        cellY(g.row),
        time - shatter,
        100 + g.col + g.row * C.GRID_COLS,
      );
  }
  for (const [p, color] of [
    [s.selection, teal],
    [s.refusal?.a, "#fa857f"],
    [s.refusal?.b, "#fa857f"],
  ] as const)
    if (p) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      const x = cellX(p.col),
        y = cellY(p.row);
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        ctx.beginPath();
        ctx.moveTo(x + dx * 23, y + dy * 33);
        ctx.lineTo(x + dx * 33, y + dy * 33);
        ctx.lineTo(x + dx * 33, y + dy * 23);
        ctx.stroke();
      }
    }
}
function button(
  ctx: CanvasRenderingContext2D,
  t: { x: number; y: number; w: number; h: number },
  label: string,
  selected = false,
) {
  ctx.fillStyle = selected ? "#d9c38b" : "#102631";
  ctx.fillRect(t.x, t.y, t.w, t.h);
  ctx.strokeStyle = selected ? "#f0dfb0" : "#3b555f";
  ctx.lineWidth = 1;
  ctx.strokeRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
  text(
    ctx,
    label,
    t.x + t.w / 2,
    t.y + 44,
    16,
    selected ? "#12242a" : ink,
    "sans-serif",
    "center",
  );
  if (selected) {
    text(ctx, "›", t.x + 25, t.y + 45, 25, "#243a40");
    text(
      ctx,
      "‹",
      t.x + t.w - 25,
      t.y + 45,
      25,
      "#243a40",
      "sans-serif",
      "right",
    );
  }
}
function hud(ctx: CanvasRenderingContext2D, s: FacetState) {
  tracked(ctx, C.HUD_SCORE_LABEL, 64, 142, 12, 3, dim);
  text(ctx, s.score.toLocaleString(), 60, 201, 48, ink, "Georgia");
  rule(ctx, 64, 225, 224);
  tracked(
    ctx,
    `${C.HUD_LEVEL_LABEL}  ${String(s.level).padStart(2, "0")}`,
    64,
    261,
    12,
    3,
    gold,
  );
  text(
    ctx,
    `${s.levelScore.toLocaleString()} / ${(s.level * C.LEVEL_TARGET_STEP).toLocaleString()}`,
    64,
    292,
    18,
    ink,
    "monospace",
  );
  ctx.fillStyle = "#203641";
  ctx.fillRect(64, 311, 224, 5);
  ctx.fillStyle = teal;
  ctx.fillRect(
    64,
    311,
    224 * Math.min(1, s.levelScore / (s.level * C.LEVEL_TARGET_STEP)),
    5,
  );
  text(ctx, "CUT DEEPER. CHAIN FURTHER.", 64, 344, 10, dim, "monospace");
  if (s.phase === "resolving") {
    text(ctx, C.HUD_CHAIN_LABEL, 64, 413, 12, gold);
    text(
      ctx,
      `×${Math.min(s.chainStep, C.MAX_MULTIPLIER)}`,
      62,
      479,
      64,
      gold,
      "Georgia",
    );
    text(
      ctx,
      `+${s.lastPoints}  /  ${s.lastCleared} STONES`,
      64,
      510,
      13,
      ink,
      "monospace",
    );
  } else {
    tracked(ctx, "THE PRESSURE PRINCIPLE", 64, 421, 10, 2, dim);
    for (let i = 0; i < 4; i++) {
      sprite(ctx, s, `ruby-${i}`, 87 + i * 52, 463, 0.68);
    }
    text(ctx, "Clean → cracked → flawed", 64, 517, 14, ink);
    text(ctx, "Flawed stones join a nearby", 64, 544, 13, dim);
    text(ctx, "clear. Twice the reward.", 64, 564, 13, dim);
  }
  text(
    ctx,
    "DRAG A STONE TO ITS NEIGHBOR",
    C.STAGE_CX,
    77,
    11,
    dim,
    "monospace",
    "center",
  );
  tracked(ctx, "EXCEPTIONAL CUTS", 990, 166, 11, 2, gold);
  const cuts = [
    ["brilliant", "FOUR IN A LINE", "Takes the surrounding ring."],
    ["star", "CROSSING LINES", "Takes a whole row + column."],
    ["prism", "FIVE IN A LINE", "Swap to clear one kind."],
  ];
  cuts.forEach(([cut, title, desc], i) => {
    const y = 220 + i * 116;
    stone(
      ctx,
      s,
      {
        col: 0,
        row: i,
        kind: cut === "prism" ? null : "beryl",
        cut: cut as GemState["cut"],
        strain: 0,
        fell: 0,
      },
      1021,
      y,
    );
    text(ctx, title, 1065, y - 5, 10, ink, "monospace");
    text(ctx, cut.toUpperCase(), 1065, y + 16, 12, gold);
    text(ctx, desc, 990, y + 52, 13, dim);
  });
  rule(ctx, 990, 577, 224);
  text(ctx, "THREE MATCH. THE REST REACT.", 990, 606, 10, dim, "monospace");
  text(
    ctx,
    s.muted ? "M  /  SOUND OFF" : "M  /  SOUND ON",
    990,
    651,
    11,
    gold,
    "monospace",
  );
  text(
    ctx,
    "01 — PRESSURE / FRACTURE / RELEASE",
    64,
    659,
    10,
    dim,
    "monospace",
  );
}
function title(ctx: CanvasRenderingContext2D, s: FacetState) {
  text(
    ctx,
    "THE ART OF THE CHAIN",
    C.STAGE_CX,
    142,
    12,
    gold,
    "monospace",
    "center",
  );
  const pos = [
    [-220, -2],
    [-150, -8],
    [-78, 0],
    [0, -12],
    [78, 0],
    [150, -8],
    [220, -2],
  ];
  pos.forEach(([x, y], i) => {
    const g: GemState = {
      col: i,
      row: 0,
      kind: C.GEM_KINDS[i],
      strain: 0,
      cut: "plain",
      fell: 0,
    };
    stone(
      ctx,
      s,
      g,
      C.STAGE_CX + x,
      205 + y + Math.sin(s.simTime * 1.3 + i) * 3,
    );
  });
  ctx.save();
  ctx.shadowColor = "#7ed5cf33";
  ctx.shadowBlur = 35;
  text(ctx, C.TITLE_TEXT, C.STAGE_CX, 338, 112, ink, "Georgia", "center");
  ctx.restore();
  tracked(ctx, C.TAGLINE_TEXT, 453, 374, 12, 3, gold);
  text(
    ctx,
    "Seven stones. A little pressure. An extraordinary chain.",
    C.STAGE_CX,
    629,
    16,
    dim,
    "Georgia",
    "center",
  );
  text(
    ctx,
    "DRAG TO SWAP   /   ARROWS + ENTER TO CHOOSE   /   M TO MUTE",
    C.STAGE_CX,
    662,
    11,
    dim,
    "monospace",
    "center",
  );
  // Engraved corner motifs are chrome, not substitute gem art.
  ctx.strokeStyle = "#34505a";
  for (const x of [211, 1069]) {
    ctx.beginPath();
    ctx.moveTo(x, 233);
    ctx.lineTo(x + 45, 360);
    ctx.lineTo(x, 487);
    ctx.lineTo(x - 45, 360);
    ctx.closePath();
    ctx.stroke();
    rule(ctx, x - 65, 360, 130);
  }
}
const help = [
  [
    "01  /  MAKE A LINE",
    "Take hold of any of seven kinds of stone. Drag it onto a neighbor",
    "and let go — or tap a stone, then its neighbor. Bring it back to",
    "its start to cancel. Three of one kind in a line shatter. A swap",
    "that clears nothing is refused; nothing on the board changes.",
  ],
  [
    "02  /  SPEND THE STRAIN",
    "Stones beside a clear take strain. After three hits they are flawed:",
    "they join any clear touching them, and score double. Use a worn",
    "corner to start a reaction. Falling stones can match again; every",
    "step of the chain raises its multiplier, up to ×8.",
  ],
  [
    "03  /  EARN A BETTER CUT",
    "Four in a line leave a brilliant: it clears the surrounding ring.",
    "Crossing lines leave a star: it takes its whole row and column.",
    "Five or more leave a prism: swap it with a stone to take every",
    "stone of that kind. Two prisms clear the entire board.",
  ],
  [
    "04  /  FIND YOUR NEXT MOVE",
    "Reach the level target to continue to a fresh board. Your round",
    "ends when no productive swap is left. Play with mouse, pen or",
    "finger. Menus: ↑ ↓ and Enter / Space. Pause: P / Escape.",
    "Mute: M. Back: Escape. Every screen also answers your pointer.",
  ],
];
function howto(ctx: CanvasRenderingContext2D, s: FacetState) {
  text(ctx, "A LITTLE PRESSURE", 64, 132, 42, ink, "Georgia");
  text(ctx, "A field guide to finding the flaw.", 65, 165, 17, dim, "Georgia");
  help.forEach((section, i) => {
    const x = i % 2 === 0 ? 68 : 680,
      y = 230 + Math.floor(i / 2) * 195;
    tracked(ctx, section[0], x, y, 12, 2, gold);
    section
      .slice(1)
      .forEach((t, j) => text(ctx, t, x, y + 33 + j * 25, 16, ink));
  });
  text(ctx, "STRAIN", 68, 653, 11, dim, "monospace");
  for (let i = 0; i < 4; i++)
    sprite(ctx, s, `jade-${i}`, 177 + i * 76, 649, 0.75);
}
export function render(s: FacetState, { ctx }: RenderApi): void {
  ctx.imageSmoothingEnabled = false;
  field(ctx);
  if (s.screen === "title") title(ctx, s);
  else if (s.screen === "howto") howto(ctx, s);
  else {
    board(ctx, s);
    hud(ctx, s);
    if (s.screen !== "playing") {
      ctx.fillStyle = "#06111de6";
      ctx.fillRect(0, 82, C.STAGE_W, 600);
      text(
        ctx,
        s.screen === "paused"
          ? C.PAUSED_TITLE_TEXT
          : s.screen === "levelclear"
            ? C.LEVELCLEAR_TITLE_TEXT
            : C.GAMEOVER_TITLE_TEXT,
        C.STAGE_CX,
        253,
        54,
        ink,
        "Georgia",
        "center",
      );
      tracked(
        ctx,
        "FACET   /   " +
          (s.screen === "paused" ? "TAKE YOUR TIME" : "ROUND NOTES"),
        495,
        178,
        11,
        2,
        gold,
      );
      if (s.screen === "levelclear") {
        text(
          ctx,
          `${C.HUD_LEVEL_LABEL} ${s.level} COMPLETE`,
          C.STAGE_CX,
          294,
          14,
          gold,
          "monospace",
          "center",
        );
        text(
          ctx,
          `${C.BEST_CHAIN_LABEL}  ${s.bestChain}     /     ${C.BEST_MOVE_LABEL}  ${s.bestMove}`,
          C.STAGE_CX,
          341,
          17,
          ink,
          "monospace",
          "center",
        );
      } else if (s.screen === "gameover") {
        text(
          ctx,
          `${C.HUD_SCORE_LABEL}  ${s.score.toLocaleString()}     /     ${C.HUD_LEVEL_LABEL}  ${s.level}`,
          C.STAGE_CX,
          326,
          21,
          gold,
          "monospace",
          "center",
        );
      } else
        text(
          ctx,
          "The stones will wait.",
          C.STAGE_CX,
          326,
          21,
          dim,
          "Georgia",
          "center",
        );
    }
  }
  for (const t of targets(s)) {
    const label =
      t.id === "pause"
        ? C.PAUSE_LABEL
        : t.id === "back"
          ? C.BACK_LABEL
          : menuItems(s.screen)[Number(t.id.slice(5))];
    button(ctx, t, label, t.id === `menu-${s.menuIndex}`);
  }
  text(ctx, "FACET", 49, 714, 9, dim, "monospace");
  text(ctx, "A GEM-MATCHING STUDY", 1230, 714, 9, dim, "monospace", "right");
}
