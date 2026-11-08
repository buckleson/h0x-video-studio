// R4-M3: MainApp needs the pagescene store at start-up but must not load the
// pagescene barrel, which pulls three.js into the start chunk.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const read = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const SRC = read(path.join(__dirname, "MainApp.tsx"));
const FRONTEND = path.resolve(__dirname, "../../../../..");
const TSCONFIG = JSON.parse(read(path.join(FRONTEND, "tsconfig.base.json")));
const PATHS: Record<string, string[]> = TSCONFIG.compilerOptions.paths;

// Value imports only; `import type` is erased and never reaches a chunk.
const valueImportsFrom = (spec: RegExp) =>
  [...SRC.matchAll(/^import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["'];?/gm)]
    .map((m) => m[1])
    .filter((s) => spec.test(s));

describe("MainApp pagescene store import", () => {
  it("does not statically import the pagescene barrel", () => {
    expect(valueImportsFrom(/^@storyteller\/ui-pagescene$/)).toEqual([]);
  });

  it("imports usePageSceneStore from the three-free store entry", () => {
    expect(SRC).toMatch(
      /^import \{ usePageSceneStore \} from "@storyteller\/ui-pagescene\/store";/m,
    );
  });

  it("does not deep-import pagescene by relative path (module boundaries)", () => {
    expect(SRC).not.toMatch(/from\s+["'][./]+[^"']*libs\/components\/pagescene/);
    expect(SRC).not.toMatch(/from\s+["']@storyteller\/ui-pagescene\/src\//);
  });

  it("maps @storyteller/ui-pagescene/store to the store entry file", () => {
    const target = PATHS["@storyteller/ui-pagescene/store"];
    expect(target, "tsconfig.base.json paths entry").toEqual([
      "libs/components/pagescene/src/store.ts",
    ]);
    expect(existsSync(path.join(FRONTEND, target[0]))).toBe(true);
  });

  it("keeps the barrel alias pointing at index.ts", () => {
    expect(PATHS["@storyteller/ui-pagescene"]).toEqual([
      "libs/components/pagescene/src/index.ts",
    ]);
  });

  it("still loads PageScene through React.lazy", () => {
    expect(SRC).toMatch(/const PageScene = lazy\(\(\) =>\s*import\("\.\/PageScene"\)/);
    expect(SRC).not.toMatch(/^import[^;]*\bPageScene\b[^;]*from/m);
  });
});
