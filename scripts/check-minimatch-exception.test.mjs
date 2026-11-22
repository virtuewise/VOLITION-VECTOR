import { describe, expect, it } from "vitest";
import {
  assertScopedMinimatchException,
} from "./check-minimatch-exception.mjs";

const safeLockfile = `lockfileVersion: '9.0'

packages:
  minimatch@10.2.6:
    resolution: {}
  minimatch@11.0.8:
    resolution: {}
  minimatch@3.1.5:
    resolution: {}

snapshots:
  '@expo/fingerprint@0.21.10(supports-color@8.1.1)':
    dependencies:
      minimatch: 10.2.6
  eslint@10.14.0:
    dependencies:
      minimatch: 11.0.8
`;

describe("scoped Expo minimatch exception guard", () => {
  it(
    "accepts the single documented Expo fingerprint compatibility path",
    () => {
      expect(assertScopedMinimatchException(safeLockfile)).toMatchObject({
        allowedPath:
          "@expo/fingerprint@0.21.10(supports-color@8.1.1) -> minimatch@10.2.6",
      });
    },
  );

  it(
    "uses the final lockfile document when pnpm emits a bootstrap document first",
    () => {
      const lockfile = `lockfileVersion: '9.0'

packages:
  minimatch@11.0.4:
    resolution: {}
snapshots:
  bootstrap@1.0.0: {}

---

` + safeLockfile;
      expect(assertScopedMinimatchException(lockfile).allowedPath).toContain(
        "@expo/fingerprint@0.21.10",
      );
    },
  );

  it("rejects another consumer of the affected minimatch 10.x line", () => {
    const lockfile = safeLockfile.replace(
      "  eslint@10.14.0:",
      "  another-package@1.0.0:\n    dependencies:\n      minimatch: 10.2.6\n  eslint@10.14.0:",
    );
    expect(() =>
      assertScopedMinimatchException(lockfile),
    ).toThrow(/only as the single @expo\/fingerprint/i);
  });

  it(
    "rejects a minimatch version in the newer affected 11.0.3–11.0.7 range",
    () => {
      const lockfile = safeLockfile.replaceAll("11.0.8", "11.0.4");
      expect(() => assertScopedMinimatchException(lockfile)).toThrow(
        /Unexpected minimatch lockfile versions/i,
      );
    },
  );

  it("rejects reintroduction of the affected glob package", () => {
    const lockfile = safeLockfile.replace(
      "  minimatch@10.2.6:",
      "  glob@13.0.6:\n    resolution: {}\n  minimatch@10.2.6:",
    );
    expect(() => assertScopedMinimatchException(lockfile)).toThrow(
      /must not introduce a glob package/i,
    );
  });

  it("fails closed when the lockfile has no snapshots section", () => {
    expect(() =>
      assertScopedMinimatchException(
        safeLockfile.slice(0, safeLockfile.indexOf("snapshots:")),
      ),
    ).toThrow(/missing the snapshots section/i);
  });
});
