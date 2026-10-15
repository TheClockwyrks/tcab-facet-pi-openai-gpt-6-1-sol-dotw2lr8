/* global console */
// One-time authoring tool. Never invoked by the build. All outputs are committed.
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const root = "public/assets";
const temp = "/tmp/facet-production";
mkdirSync(temp, { recursive: true });
const run = (tool, args) =>
  execFileSync(tool, args.map(String), { stdio: "pipe" });
const json = (path, data) => writeFileSync(path, JSON.stringify(data));
const colors = [
  "#ee557b",
  "#f29a50",
  "#e4cd65",
  "#52c99a",
  "#59d1db",
  "#638bea",
  "#bb7cde",
];
const names = [
  "ruby",
  "amber",
  "citrine",
  "jade",
  "beryl",
  "sapphire",
  "amethyst",
  "prism",
];
const shapes = [
  [
    [20, 8],
    [42, 8],
    [55, 22],
    [55, 42],
    [42, 55],
    [20, 55],
    [8, 42],
    [8, 22],
  ],
  [
    [32, 5],
    [54, 23],
    [51, 45],
    [32, 58],
    [13, 45],
    [10, 23],
  ],
  [
    [32, 5],
    [57, 49],
    [46, 55],
    [18, 55],
    [7, 49],
  ],
  [
    [16, 9],
    [47, 9],
    [55, 18],
    [55, 46],
    [46, 55],
    [17, 55],
    [9, 47],
    [9, 17],
  ],
  [
    [19, 7],
    [45, 7],
    [58, 31],
    [45, 56],
    [19, 56],
    [6, 31],
  ],
  [
    [32, 4],
    [50, 23],
    [55, 39],
    [47, 52],
    [32, 58],
    [17, 52],
    [9, 39],
    [14, 23],
  ],
  [
    [32, 3],
    [54, 31],
    [32, 60],
    [10, 31],
  ],
  [
    [32, 3],
    [57, 26],
    [49, 49],
    [32, 59],
    [15, 49],
    [7, 26],
  ],
];
function shade(hex, f) {
  let ns = hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16));
  return (
    "#" +
    ns
      .map((v) =>
        Math.max(
          0,
          Math.min(255, Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1))),
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function canvas(w = 64, h = 64) {
  const pix = Array(w * h).fill(null);
  return { w, h, pix };
}
function polygon(c, ps, color) {
  const minX = Math.floor(Math.min(...ps.map((p) => p[0]))),
    maxX = Math.ceil(Math.max(...ps.map((p) => p[0])));
  const minY = Math.floor(Math.min(...ps.map((p) => p[1]))),
    maxY = Math.ceil(Math.max(...ps.map((p) => p[1])));
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      let inside = false;
      for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
        const a = ps[i],
          b = ps[j];
        if (
          a[1] > y + 0.5 !== b[1] > y + 0.5 &&
          x + 0.5 < ((b[0] - a[0]) * (y + 0.5 - a[1])) / (b[1] - a[1]) + a[0]
        )
          inside = !inside;
      }
      if (inside && x >= 0 && y >= 0 && x < c.w && y < c.h)
        c.pix[y * c.w + x] = color;
    }
}
function line(c, a, b, col, width = 1) {
  let [x, y] = a.map(Math.round),
    [xx, yy] = b.map(Math.round);
  const dx = Math.abs(xx - x),
    sx = x < xx ? 1 : -1,
    dy = -Math.abs(yy - y),
    sy = y < yy ? 1 : -1;
  let e = dx + dy;
  for (;;) {
    for (let k = 0; k < width; k++)
      if (x + k >= 0 && x + k < c.w && y >= 0 && y < c.h)
        c.pix[y * c.w + x + k] = col;
    if (x === xx && y === yy) break;
    const e2 = 2 * e;
    if (e2 >= dy) {
      e += dy;
      x += sx;
    }
    if (e2 <= dx) {
      e += dx;
      y += sy;
    }
  }
}
function gem(kind, strain = 0, turn = 0) {
  const c = canvas(),
    outer = shapes[kind].map(([x, y]) => [
      32 + (x - 32) * (kind === 7 ? 0.78 + 0.22 * Math.cos(turn) : 1),
      y,
    ]);
  let inner = outer.map(([x, y]) => [
    32 + (x - 32) * 0.55,
    30 + (y - 32) * 0.5,
  ]);
  const base = colors[kind] ?? "#d2e8ef";
  polygon(c, outer, shade(base, 0.3));
  const inset = outer.map(([x, y]) => [
    32 + (x - 32) * 0.91,
    32 + (y - 32) * 0.91,
  ]);
  for (let i = 0; i < outer.length; i++) {
    let j = (i + 1) % outer.length;
    let col = kind === 7 ? colors[(i + Math.floor(turn * 2)) % 7] : base;
    polygon(
      c,
      [inset[i], inset[j], inner[j], inner[i]],
      shade(col, [1.38, 1.05, 0.65, 0.45, 0.6, 0.85, 1.3, 1.5][i]),
    );
    line(c, inset[i], inner[i], shade(col, 0.65));
  }
  polygon(c, inner, shade(base, 1.1));
  polygon(
    c,
    [
      inner[0],
      inner[1],
      inner[Math.floor(inner.length / 2)],
      inner[inner.length - 1],
    ],
    shade(base, 1.35),
  );
  line(c, inset[0], inset[1], "#e9f7ed");
  line(c, [22, 17], [26, 17], "#ffffff");
  line(c, [24, 15], [24, 19], "#ffffff");
  const silhouette = [...c.pix];
  const cracks = [
    [
      [18, 13],
      [27, 24],
      [23, 32],
      [36, 41],
      [40, 52],
    ],
    [
      [48, 17],
      [36, 27],
      [23, 32],
      [12, 40],
    ],
    [
      [26, 24],
      [40, 23],
      [36, 41],
      [21, 48],
    ],
  ];
  for (let s = 0; s < strain; s++)
    for (let p = 1; p < cracks[s].length; p++) {
      line(
        c,
        cracks[s][p - 1],
        cracks[s][p],
        strain === 3 ? "#fff0be" : "#08151f",
        strain === 3 ? 2 : 1,
      );
      if (strain < 3)
        line(
          c,
          cracks[s][p - 1].map((v) => v + 1),
          cracks[s][p].map((v) => v + 1),
          "#a7e1d2",
        );
    }
  if (strain === 3) {
    line(c, [29, 6], [35, 6], "#fff8d1", 2);
    line(c, [29, 58], [35, 58], "#fff8d1", 2);
  }
  c.pix = c.pix.map((color, i) => (silhouette[i] ? color : null));
  return c;
}
function emit(c, path, sheet = false) {
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  const ops = [];
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w;) {
      const col = c.pix[y * c.w + x];
      let end = x + 1;
      while (end < c.w && c.pix[y * c.w + end] === col) end++;
      if (col)
        ops.push({
          op: "fill_rect",
          x,
          y,
          width: end - x,
          height: 1,
          color: col,
        });
      x = end;
    }
  }
  const p = temp + "/draw.json";
  json(p, ops);
  run(sheet ? "draw-sheet" : "draw", [
    "render",
    "--actions",
    p,
    "--out",
    path,
    "--width",
    c.w,
    "--height",
    c.h,
    "--no-layers",
  ]);
}
for (let k = 0; k < 8; k++) {
  for (let s = 0; s < 4; s++)
    emit(gem(k, s), `${root}/gems/${names[k]}-${s}.png`);
  if (k < 7) {
    const base = gem(k, 3);
    for (let f = 0; f < 7; f++) {
      const c = canvas();
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++) {
          const color = base.pix[y * 64 + x];
          if (!color) continue;
          const sector =
            Math.floor(((Math.atan2(y - 32, x - 32) + Math.PI) * 4) / Math.PI) %
            8;
          const angle = ((sector + 0.5) * Math.PI) / 4 - Math.PI;
          const dx = Math.round(Math.cos(angle) * f * 3),
            dy = Math.round(Math.sin(angle) * f * 3 + f * f * 0.25);
          const xx = x + dx,
            yy = y + dy;
          if (
            xx >= 0 &&
            xx < 64 &&
            yy >= 0 &&
            yy < 64 &&
            ((x + y + sector) % 7 !== 0 || f < 2)
          )
            c.pix[yy * 64 + xx] =
              color + (f > 3 ? ["ff", "df", "9f"][f - 4] : "");
        }
      emit(c, `${root}/gems/break/${names[k]}/${f}.png`, true);
    }
  }
}
for (let f = 0; f < 12; f++)
  emit(gem(7, 0, (f * Math.PI) / 6), `${root}/gems/prism-turn/${f}.png`, true);
for (const cut of ["brilliant", "star"]) {
  const c = canvas();
  if (cut === "brilliant") {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4,
        b = ((i + 1) * Math.PI) / 4;
      line(
        c,
        [32 + 27 * Math.cos(a), 32 + 27 * Math.sin(a)],
        [32 + 27 * Math.cos(b), 32 + 27 * Math.sin(b)],
        "#fff4c1",
        2,
      );
    }
    polygon(
      c,
      [
        [32, 18],
        [39, 32],
        [32, 46],
        [25, 32],
      ],
      "#fff2c9",
    );
    polygon(
      c,
      [
        [32, 23],
        [35, 32],
        [32, 40],
        [29, 32],
      ],
      "#87733f",
    );
  } else {
    polygon(
      c,
      [
        [32, 4],
        [36, 27],
        [59, 32],
        [36, 37],
        [32, 59],
        [27, 37],
        [5, 32],
        [27, 27],
      ],
      "#fff2bc",
    );
    polygon(
      c,
      [
        [32, 17],
        [35, 29],
        [47, 32],
        [35, 35],
        [32, 47],
        [29, 35],
        [17, 32],
        [29, 29],
      ],
      "#d9a758",
    );
  }
  emit(c, `${root}/gems/${cut}.png`);
}
const frame = canvas(608, 608);
polygon(
  frame,
  [
    [12, 0],
    [596, 0],
    [608, 12],
    [608, 596],
    [596, 608],
    [12, 608],
    [0, 596],
    [0, 12],
  ],
  "#192d36",
);
polygon(
  frame,
  [
    [14, 5],
    [594, 5],
    [603, 14],
    [603, 594],
    [594, 603],
    [14, 603],
    [5, 594],
    [5, 14],
  ],
  "#a99668",
);
polygon(
  frame,
  [
    [17, 7],
    [591, 7],
    [601, 17],
    [601, 591],
    [591, 601],
    [17, 601],
    [7, 591],
    [7, 17],
  ],
  "#36444b",
);
polygon(
  frame,
  [
    [18, 12],
    [590, 12],
    [596, 18],
    [596, 590],
    [590, 596],
    [18, 596],
    [12, 590],
    [12, 18],
  ],
  "#0b1b26",
);
for (let y = 0; y < 8; y++)
  for (let x = 0; x < 8; x++) {
    const xx = 16 + x * 72,
      yy = 16 + y * 72;
    polygon(
      frame,
      [
        [xx + 3, yy + 3],
        [xx + 69, yy + 3],
        [xx + 69, yy + 69],
        [xx + 3, yy + 69],
      ],
      (x + y) % 2 ? "#102330" : "#122632",
    );
    line(frame, [xx + 7, yy + 4], [xx + 65, yy + 4], "#1b3440");
  }
for (const [x, y] of [
  [7, 7],
  [600, 7],
  [7, 600],
  [600, 600],
]) {
  line(frame, [x - 3, y], [x + 3, y], "#e5ce95");
  line(frame, [x, y - 3], [x, y + 3], "#e5ce95");
}
emit(frame, `${root}/gems/frame.png`);
// Author and emit four live particle systems.
for (const [name, count, speed, size, color] of [
  ["clear", 14, 75, 1.8, "#87e4e5"],
  ["flawed", 30, 135, 2.8, "#ffe2a1"],
  ["cut", 25, 100, 2.1, "#fff5c4"],
  ["aura", 7, 9, 0.8, "#a5ece5"],
]) {
  const dir = `${root}/fx/${name}`;
  mkdirSync(dir, { recursive: true });
  const cfg = temp + `/${name}-fx.json`;
  json(cfg, {
    width: 160,
    height: 160,
    duration_ms: 1000,
    fps: 30,
    seed: 31,
    actions: temp + `/${name}-fx-ops.json`,
    preview: temp + `/${name}.gif`,
    system: dir + "/system.json",
  });
  const cmd = (args) => run("particle-2d", ["--config", cfg, ...args]);
  cmd(["init"]);
  cmd([
    "add-emitter",
    "--name",
    "shards",
    "--shape",
    name === "aura" ? "disc" : "point",
    "--radius",
    24,
    "--x",
    0,
    "--y",
    0,
    name === "aura" ? "--rate" : "--burst",
    count,
    "--lifetime",
    name === "aura" ? 1000 : 500,
    "--lifetime-spread",
    120,
    "--speed",
    speed,
    "--speed-spread",
    speed * 0.4,
    "--cone-angle",
    180,
  ]);
  cmd([
    "set-particle",
    "--emitter",
    "shards",
    "--size-from",
    size,
    "--size-to",
    0,
    "--opacity-from",
    0.9,
    "--opacity-to",
    0,
    "--color-gradient",
    `${color}@0,#ffffff@0.15,${color}@1`,
  ]);
  if (name === "aura") cmd(["set-timeline", "--loop", "true"]);
  cmd(["render", "--frame", 8, "--out", temp + `/${name}.png`]);
}
function config(name, tool, duration = 1000) {
  const cfg = temp + "/" + name + ".json";
  json(cfg, {
    sample_rate: 22050,
    channels: "stereo",
    max_duration_ms: duration,
    seed: 42,
    actions: temp + "/" + name + "-ops.json",
    preview: temp + "/" + name + ".png",
    wav: root + "/audio/" + name + ".wav",
    mid: root + "/audio/" + name + ".mid",
    sample_pack: "combat-core",
    instrument_bank: "gm-lite",
  });
  return (args) => run(tool, ["--config", cfg, ...args]);
}
for (const [name, freq, dur, wave] of [
  ["select", 950, 65, "triangle"],
  ["swap", 620, 130, "triangle"],
  ["refuse", 125, 150, "square"],
  ["land", 95, 160, "sine"],
  ["flaw", 2200, 80, "noise"],
  ["cut", 1250, 400, "sine"],
  ["levelup", 600, 650, "triangle"],
  ["gameover", 420, 850, "triangle"],
  ...Array.from({ length: 8 }, (_, i) => [
    "chain-" + (i + 1),
    440 * 2 ** (i / 8),
    330,
    "sine",
  ]),
]) {
  const cmd = config(name, "sfx-synth");
  cmd(["init"]);
  cmd([
    "add-voice",
    "--name",
    "body",
    "--wave",
    wave,
    "--freq",
    freq,
    "--dur",
    dur,
    "--gain",
    name === "land" ? -10 : -17,
  ]);
  cmd(["set-envelope", "--voice", "body", "--env", "pluck"]);
  if (name === "levelup" || name === "gameover" || name === "swap")
    cmd([
      "set-pitch",
      "--voice",
      "body",
      "--slide-to",
      name === "gameover" ? 100 : freq * 2,
      "--over",
      dur,
    ]);
  if (wave === "sine" && name !== "land") {
    cmd([
      "add-voice",
      "--name",
      "overtone",
      "--wave",
      "sine",
      "--freq",
      freq * 2.76,
      "--dur",
      dur * 0.6,
      "--gain",
      -25,
    ]);
    cmd(["set-envelope", "--voice", "overtone", "--env", "pluck"]);
  }
  cmd(["render"]);
}
const sample = config("shatter", "sfx-sample");
sample(["init"]);
console.log(sample(["list-samples"]).toString());
sample([
  "add-sample",
  "--name",
  "debris_glass",
  "--t",
  0,
  "--gain",
  -12,
  "--fade-out",
  150,
]);
sample(["add-sample", "--name", "snap_transient", "--t", 0, "--gain", -19]);
sample(["render"]);
for (const name of ["title", "play"]) {
  const cmd = config(name, "music", 24000);
  cmd(["init"]);
  cmd(["set-tempo", "--bpm", name === "title" ? 96 : 80]);
  cmd([
    "define-track",
    "--name",
    "hook",
    "--instrument",
    name === "title" ? "music_box" : "vibraphone",
  ]);
  cmd(["define-track", "--name", "pulse", "--instrument", "marimba"]);
  cmd(["set-track-fx", "--track", "hook", "--gain", -19, "--reverb", 0.3]);
  cmd(["set-track-fx", "--track", "pulse", "--gain", -23]);
  const melody =
    name === "title"
      ? [76, 79, 83, 81, 79, 74, 76, 71, 72, 76, 79, 78, 74, 71, 69, 74]
      : [71, 78, 76, 74, 67, 74, 72, 71, 69, 76, 74, 72, 66, 73, 71, 69];
  for (let i = 0; i < 32; i++) {
    cmd([
      "add-note",
      "--track",
      "hook",
      "--pitch",
      melody[i % 16],
      "--t",
      i,
      "--dur",
      0.65,
      "--velocity",
      i % 4 === 0 ? 90 : 63,
    ]);
    cmd([
      "add-note",
      "--track",
      "pulse",
      "--pitch",
      [52, 48, 45, 47][Math.floor(i / 8)] + [0, 7, 12, 7][i % 4],
      "--t",
      i,
      "--dur",
      0.7,
      "--velocity",
      65,
    ]);
  }
  cmd(["render"]);
}
console.log("Produced Facet art, animation, particles and sound.");
