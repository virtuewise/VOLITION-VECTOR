import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

function unquote(value) {
  return value.replace(/^['"]|['"]$/g, "");
}

function readSectionEntries(lockfile, sectionName) {
  const lines = lockfile.split("\n");
  const sectionIndex = lines.lastIndexOf(sectionName + ":");
  if (sectionIndex === -1) {
    throw new Error("pnpm-lock.yaml is missing the " + sectionName + " section.");
  }

  const entries = [];
  let current = null;

  for (let index = sectionIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length > 0 && !/^\s/.test(line)) break;

    const entryHeader = /^  (\S.*):$/.exec(line);
    if (entryHeader) {
      if (current) entries.push(current);
      current = { key: unquote(entryHeader[1]), lines: [] };
      continue;
    }

    if (current) current.lines.push(line);
  }

  if (current) entries.push(current);
  return entries;
}

function snapshotDependency(entry, packageName) {
  let nestedSection = null;
  for (const line of entry.lines) {
    const sectionHeader = /^    ([A-Za-z][A-Za-z0-9_-]*):$/.exec(line);
    if (sectionHeader) {
      nestedSection = sectionHeader[1];
      continue;
    }

    if (nestedSection !== "dependencies") continue;
    const dependency = new RegExp(
      "^      " + packageName + ":\\s*([^\\s#]+)\\s*$",
    ).exec(line);
    if (dependency) return dependency[1];
  }
  return null;
}

/**
 * pnpm's audit.ignore is advisory-wide, not dependency-path scoped.
 * Keep the GHSA-g3hv-75wg-m249 exception safe by asserting the exact lockfile
 * consumer and version that currently require it.
 */
export function assertScopedMinimatchException(lockfile) {
  const packages = readSectionEntries(lockfile, "packages");
  const snapshots = readSectionEntries(lockfile, "snapshots");

  const globPackages = packages.filter((entry) =>
    entry.key.startsWith("glob@"),
  );
  if (globPackages.length > 0) {
    throw new Error(
      "The temporary Expo minimatch exception must not introduce a glob package; found: " +
        globPackages.map((entry) => entry.key).join(", "),
    );
  }

  const minimatchVersions = packages
    .filter((entry) => entry.key.startsWith("minimatch@"))
    .map((entry) => entry.key.slice("minimatch@".length))
    .sort();

  const expectedVersions = ["10.2.6", "11.0.8", "3.1.5"].sort();
  if (
    minimatchVersions.length !== expectedVersions.length ||
    minimatchVersions.some(
      (version, index) => version !== expectedVersions[index],
    )
  ) {
    throw new Error(
      "Unexpected minimatch lockfile versions. Expected only " +
        expectedVersions.join(", ") +
        "; found " +
        minimatchVersions.join(", "),
    );
  }

  const vulnerableConsumers = snapshots
    .map((entry) => ({
      key: entry.key,
      version: snapshotDependency(entry, "minimatch"),
    }))
    .filter((entry) => entry.version === "10.2.6");

  if (
    vulnerableConsumers.length !== 1 ||
    !vulnerableConsumers[0].key.startsWith(
      "@expo/fingerprint@0.21.10(",
    )
  ) {
    throw new Error(
      "minimatch@10.2.6 is allowed only as the single " +
        "@expo/fingerprint@0.21.10 dependency; found: " +
        vulnerableConsumers
          .map((entry) => entry.key + " -> minimatch@" + entry.version)
          .join(", "),
    );
  }

  return {
    allowedPath: vulnerableConsumers[0].key + " -> minimatch@10.2.6",
    minimatchVersions,
  };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    const lockfile = readFileSync(
      new URL("../pnpm-lock.yaml", import.meta.url),
      "utf8",
    );
    const result = assertScopedMinimatchException(lockfile);
    console.log("Minimatch exception guard passed: " + result.allowedPath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
