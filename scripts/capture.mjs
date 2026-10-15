/* global console, document */
// Capture against `npm run dev -- --host 0.0.0.0` using only the engine's surface.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  mkdirSync("showcase", { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto("http://localhost:5173");
  await page.waitForTimeout(800);
  // A separate harness-held engine, never a global installed by the game.
  const handle = await page.evaluateHandle(async () => {
    const { createEngine, ConstantClock } =
      await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
    const { game, BACKGROUND } = await import("/src/game.ts");
    document.querySelector("canvas").style.display = "none";
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100vw;height:100vh;display:block";
    document.body.append(canvas);
    const engine = createEngine({
      canvas,
      width: 1280,
      height: 720,
      game,
      background: BACKGROUND,
      clock: new ConstantClock(1000 / 60),
    });
    await engine.initialize();
    await engine.advance(30);
    return engine;
  });
  await page.screenshot({ path: "showcase/title.png" });
  await handle.evaluate(async (e) => {
    const rows = Array.from({ length: 8 }, (_, r) =>
      Array.from({ length: 8 }, (_, c) => "RACJBSM"[(r * 2 + c) % 7] + "0"),
    );
    const put = (c, r, t) => {
      rows[r][c] = t;
    };
    put(1, 4, "R0");
    put(2, 4, "R0b");
    put(3, 4, "A0");
    put(3, 3, "R0");
    put(1, 5, "J3");
    put(2, 5, "B3");
    put(3, 5, "M3");
    put(3, 6, "J3");
    put(4, 5, "C3");
    put(5, 5, "S3s");
    put(6, 1, "X0");
    put(6, 7, "A1b");
    put(0, 2, "B1");
    put(1, 2, "J2");
    put(5, 3, "M2");
    e.apply((s) =>
      e.debug.loadBoard(
        s,
        rows.map((r) => r.join(" ")),
      ),
    );
    e.apply((s) => e.debug.setScreen(s, "playing"));
    e.apply((s) => e.debug.setScore(s, 840));
    e.apply((s) => e.debug.setLevelScore(s, 840));
    await e.advance(1);
  });
  await page.screenshot({ path: "showcase/board.png" });
  const data = await handle.evaluate(async (e) => {
    // Arrange a single follow-on match in the first refill; later refills are random.
    for (const col of [1, 2, 3])
      e.apply((s) => e.debug.setRefillKinds(s, col, "J"));
    e.startRecording();
    await e.advance(24);
    e.apply((s) => e.debug.pointerDown(s, 604, 360, "mouse"));
    e.apply((s) => e.debug.pointerMove(s, 604, 432, "mouse"));
    await e.advance(14);
    e.apply((s) => e.debug.pointerUp(s));
    await e.advance(12);
    e.apply((s) => e.debug.clearRefillKinds(s));
    await e.advance(168);
    return JSON.stringify(e.stopRecording());
  });
  writeFileSync("showcase/chain.json.gz", gzipSync(data));
  const snap = await handle.evaluate((e) => e.debug.snapshot(e.state));
  console.log({
    score: snap.score,
    bestChain: snap.bestChain,
    bestMove: snap.bestMove,
    screen: snap.screen,
    frames: JSON.parse(data).frames.length,
    images: JSON.parse(data).images.length,
  });
  await handle.evaluate((e) => e.destroy());
} finally {
  await browser.close();
}
