import { readFileSync } from "node:fs";

const nvmrc = readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim();
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const engineRange = packageJson.engines?.node;
const rangeMatch =
  typeof engineRange === "string" ? /^>=\s*(\d+)\s+<\s*(\d+)$/.exec(engineRange) : null;

function fail(message) {
  console.error(`Node toolchain contract failed: ${message}`);
  process.exitCode = 1;
}

if (!/^\d+$/.test(nvmrc)) {
  fail(`.nvmrc must contain one major version, received "${nvmrc}".`);
} else if (!rangeMatch) {
  fail(`package.json engines.node must use the supported ">=N <N+1" form, received "${engineRange}".`);
} else {
  const pinnedMajor = Number(nvmrc);
  const minimumMajor = Number(rangeMatch[1]);
  const exclusiveMaximumMajor = Number(rangeMatch[2]);
  const runtimeMajor = Number(process.versions.node.split(".")[0]);

  if (minimumMajor !== pinnedMajor || exclusiveMaximumMajor !== pinnedMajor + 1) {
    fail(`.nvmrc (${pinnedMajor}) does not match package.json engines.node ("${engineRange}").`);
  }

  if (runtimeMajor !== pinnedMajor) {
    fail(`running Node ${runtimeMajor}; expected Node ${pinnedMajor} from .nvmrc.`);
  }

  if (process.exitCode !== 1) {
    console.log(
      `Node toolchain contract verified: Node ${runtimeMajor} satisfies .nvmrc and package.json engines.node.`,
    );
  }
}
