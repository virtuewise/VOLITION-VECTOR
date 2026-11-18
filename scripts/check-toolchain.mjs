import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const nvmrc = readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim();
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const engineRange = /^>=(\d+) <(\d+)$/.exec(packageJson.engines?.node ?? "");

assert.match(nvmrc, /^\d+$/, ".nvmrc must contain one Node major version.");
assert.ok(
  engineRange,
  `package.json engines.node must use ">=N <N+1"; received "${packageJson.engines?.node}".`,
);

const pinnedMajor = Number(nvmrc);
const runtimeMajor = Number(process.versions.node.split(".")[0]);

assert.equal(
  Number(engineRange[1]),
  pinnedMajor,
  ".nvmrc must match the minimum Node major in package.json engines.node.",
);
assert.equal(
  Number(engineRange[2]),
  pinnedMajor + 1,
  "package.json engines.node must cap the pinned major at the next major.",
);
assert.equal(
  runtimeMajor,
  pinnedMajor,
  `CI/local runtime must use Node ${pinnedMajor} from .nvmrc.`,
);

console.log(
  `Node toolchain contract verified: Node ${runtimeMajor} satisfies .nvmrc and package.json engines.node.`,
);
