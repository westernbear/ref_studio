import { execFileSync } from "node:child_process";
import { lookup } from "node:dns/promises";

const expectedChrome =
  process.env.EXPECTED_CHROMIUM_VERSION ?? "151.0.7922.138";
const chrome = process.env.CHROME_PATH ?? "/opt/chrome/chrome";

function run(command, args = []) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function requireMatch(label, actual, expected) {
  if (!actual.includes(expected)) {
    throw new Error(
      `RUNTIME_VERSION_MISMATCH ${label} expected=${expected} actual=${JSON.stringify(actual)}`,
    );
  }
}

async function requireNetworkBlocked() {
  let dnsBlocked = false;
  let ipBlocked = false;
  try {
    await lookup("example.com");
  } catch {
    dnsBlocked = true;
  }
  try {
    await fetch("http://1.1.1.1", { signal: AbortSignal.timeout(1500) });
  } catch {
    ipBlocked = true;
  }
  if (!dnsBlocked || !ipBlocked) {
    throw new Error(
      `RUNTIME_NETWORK_NOT_ISOLATED dnsBlocked=${dnsBlocked} ipBlocked=${ipBlocked}`,
    );
  }
  return { dnsBlocked, ipBlocked };
}

const versions = {
  node: run("node", ["--version"]),
  python: run("python3.12", ["--version"]),
  pnpm: run("pnpm", ["--version"]),
  uv: run("uv", ["--version"]),
  ffmpeg: run("ffmpeg", ["-version"]),
  imagemagick: run("convert", ["--version"]),
  chrome: run(chrome, ["--version"]),
};

requireMatch("node", versions.node, "v24.");
requireMatch("python", versions.python, "Python 3.12.14");
requireMatch("pnpm", versions.pnpm, "11.20.0");
requireMatch("uv", versions.uv, "uv 0.11.8");
requireMatch("ffmpeg", versions.ffmpeg, "ffmpeg version 8.0.1");
requireMatch("ffmpeg-gpl", versions.ffmpeg, "--enable-gpl");
requireMatch("ffmpeg-x264", versions.ffmpeg, "--enable-libx264");
requireMatch("imagemagick", versions.imagemagick, "ImageMagick 6.9.12-98");
requireMatch("chrome", versions.chrome, expectedChrome);

const encoders = run("ffmpeg", ["-hide_banner", "-encoders"]);
requireMatch("ffmpeg-encoder", encoders, "libx264");

const probeHtml = `<canvas id="c"></canvas><script>const g=c.getContext('webgl2');document.body.textContent='RVS_WEBGL2='+Boolean(g)</script>`;
const chromeOutput = run(chrome, [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--dump-dom",
  `data:text/html,${encodeURIComponent(probeHtml)}`,
]);
requireMatch("chrome-webgl2", chromeOutput, "RVS_WEBGL2=true");

const network = await requireNetworkBlocked();
process.stdout.write(
  `${JSON.stringify({ status: "runtime-preflight-ok", versions, backends: { libx264: true, webgl2: true }, network })}\n`,
);
