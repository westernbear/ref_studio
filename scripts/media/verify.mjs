import { readFile } from "node:fs/promises";
const path = process.argv[2];
if (path === undefined)
  throw new Error("usage: pnpm media:verify <fixture-output>");
const value = JSON.parse(await readFile(path, "utf8"));
if (
  value.frameCount !== 120 ||
  value.audio?.samplesPerChannel !== 192000 ||
  value.audio?.channels !== 2
)
  throw new Error("MEDIA_CONTRACT_INVALID");
process.stdout.write(
  JSON.stringify({
    status: "PASS",
    frameCount: 120,
    samplesPerChannel: 192000,
    channels: 2,
  }) + "\n",
);
