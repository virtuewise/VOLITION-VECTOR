import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const nvmrc = readFileSync(new URL(".nvmrc", root), "utf8").trim();
const packageJson = JSON.parse(
  readFileSync(new URL("package.json", root), "utf8"),
);
const engineRange = /^>=(\d+) <(\d+)$/.exec(
  packageJson.engines?.node ?? "",
);

assert.match(nvmrc, /^\d+$/, ".nvmrc must contain one Node major.");
assert.ok(engineRange, "engines.node must use the >=N <N+1 form.");

const pinnedMajor = Number(nvmrc);
const runtimeMajor = Number(process.versions.node.split(".")[0]);

assert.equal(
  Number(engineRange[1]),
  pinnedMajor,
  "Node engine minimum must match .nvmrc.",
);
assert.equal(
  Number(engineRange[2]),
  pinnedMajor + 1,
  "Node engine maximum must be the next major.",
);
assert.equal(
  runtimeMajor,
  pinnedMajor,
  "Current Node runtime must match .nvmrc.",
);

console.log(
  `Node ${runtimeMajor} matches .nvmrc and package.json engines.node.`,
);
