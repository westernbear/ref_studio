import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const path = process.argv[2];
if (path === undefined)
  throw new Error("usage: pnpm media:verify <fixture-output>");
const contract = JSON.parse(
  await readFile(
    resolve(
      import.meta.dirname,
      "../../verification/contract/media-contract-v2.json",
    ),
    "utf8",
  ),
);
const silence = contract.silenceNormalizeArgvTemplate.join(" ");
const sampleRate = Number(silence.match(/anullsrc=r=(\d+)/)?.[1]);
const durationSeconds = Number(silence.match(/atrim=start=0:end=(\d+)/)?.[1]);
const channels = /cl=stereo/.test(silence) ? 2 : 1;
const samplesPerChannel = sampleRate * durationSeconds;
const frameCount = contract.capacityProfiles.find(
  (profile) => profile.fps === 30,
)?.frames;
if (
  !Number.isFinite(sampleRate) ||
  !Number.isFinite(durationSeconds) ||
  !Number.isFinite(frameCount) ||
  !Number.isFinite(samplesPerChannel)
)
  throw new Error("MEDIA_CONTRACT_INVALID");
const value = JSON.parse(await readFile(path, "utf8"));
if (
  value.frameCount !== frameCount ||
  value.audio?.samplesPerChannel !== samplesPerChannel ||
  value.audio?.channels !== channels
)
  throw new Error("MEDIA_CONTRACT_INVALID");
process.stdout.write(
  JSON.stringify({
    status: "PASS",
    frameCount,
    samplesPerChannel,
    channels,
  }) + "\n",
);
