// Renders the show to a looping MP4 (or single-frame PNGs) by stepping the
// timeline frame-by-frame in a headless browser and piping frames to ffmpeg.
//
//   npm run render                         -> renders/showcase.mp4 (1080p60)
//   npm run render -- --fps 30 --crf 22    -> faster, smaller draft
//   npm run render -- --shot 4.5,12.4      -> PNGs of those *timeline* times
//   npm run render -- --from 0 --to 5      -> only that video-time range
//
// Uses the installed Edge/Chrome (no browser download) and ffmpeg on PATH.

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const fps = Number(opt("fps", 60));
const crf = String(opt("crf", 16));
const out = resolve(root, opt("out", "renders/showcase.mp4"));
const shots = opt("shot", null)?.split(",").map(Number);
const PORT = 5198;

async function launchBrowser() {
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel, args: ["--force-color-profile=srgb"] });
    } catch {
      /* try next */
    }
  }
  throw new Error("No Edge or Chrome found. Install one, or run `npx playwright install chromium`.");
}

const server = await createServer({ root, logLevel: "error", server: { port: PORT, strictPort: true } });
await server.listen();
const browser = await launchBrowser();

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("[page error]", e.message));
  await page.goto(`http://localhost:${PORT}/?render`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);

  if (shots) {
    const dir = resolve(root, "renders/shots");
    mkdirSync(dir, { recursive: true });
    for (const t of shots) {
      // --shot takes timeline time; __setTime takes video time, which equals it before the first cue hold.
      await page.evaluate((tl) => window.__setTimeline(tl), t);
      const file = resolve(dir, `t-${t.toFixed(2)}.png`);
      await page.screenshot({ path: file });
      console.log(file);
    }
  } else {
    const duration = await page.evaluate(() => window.__videoDuration);
    const from = Number(opt("from", 0));
    const to = Number(opt("to", duration));
    const startFrame = Math.round(from * fps);
    const endFrame = Math.round(to * fps); // exclusive: last frame of a full render is the one before the loop point
    mkdirSync(dirname(out), { recursive: true });

    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-y", "-loglevel", "error",
        "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
        "-c:v", "libx264", "-preset", "slow", "-crf", crf,
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        out,
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    const done = new Promise((res, rej) => {
      ffmpeg.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited with ${code}`))));
    });

    const started = Date.now();
    for (let f = startFrame; f < endFrame; f++) {
      await page.evaluate((v) => window.__setTime(v), f / fps);
      const png = await page.screenshot({ type: "png" });
      if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
      if (f % fps === 0) {
        const pct = (((f - startFrame) / (endFrame - startFrame)) * 100).toFixed(0);
        process.stdout.write(`\r  frame ${f}/${endFrame}  (${pct}%)  ${((Date.now() - started) / 1000).toFixed(0)}s`);
      }
    }
    ffmpeg.stdin.end();
    await done;
    console.log(`\nWrote ${out}  (${(endFrame - startFrame) / fps}s @ ${fps}fps)`);
  }
} finally {
  await browser.close();
  await server.close();
}
