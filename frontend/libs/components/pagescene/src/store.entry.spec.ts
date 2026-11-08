// R4-M3: `src/store.ts` is the three.js-free entry hosts import at start-up.
// These checks walk the static import graph from that entry (type-only
// imports are erased by the compiler and dynamic import() is code-split, so
// neither lands in the start chunk) and fail if any reachable module imports
// three or another 3D runtime.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const LIB_SRC = __dirname;
const FRONTEND = path.resolve(LIB_SRC, "../../../..");
const STORE_ENTRY = path.join(LIB_SRC, "store.ts");
const BARREL = path.join(LIB_SRC, "index.ts");

const FORBIDDEN = [
  /^three$/,
  /^three\//,
  /^@sparkjsdev\//,
  /^ammo/,
  /^@react-three\//,
  /^postprocessing$/,
];

const STORE_NAMES = [
  "usePageSceneStore",
  "useIsVisitingOthersScene",
  "getIsVisitingOthersScene",
];

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

// Workspace aliases from tsconfig.base.json, so `@storyteller/*` packages are
// followed too instead of being treated as opaque.
function loadAliases(): Map<string, string> {
  const raw = read(path.join(FRONTEND, "tsconfig.base.json"));
  const json = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ""));
  const aliases = new Map<string, string>();
  for (const [key, targets] of Object.entries(
    json.compilerOptions?.paths ?? {},
  )) {
    if (!key.includes("*")) {
      aliases.set(key, path.join(FRONTEND, (targets as string[])[0]));
    }
  }
  return aliases;
}

function resolveFile(base: string): string | null {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

// Value (runtime) specifiers only: skips `import type` / `export type` and
// whole-statement type re-exports; dynamic import() is not followed.
function staticValueSpecifiers(source: string): string[] {
  const noComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const specs: string[] = [];
  const re =
    /(?:^|\n|;)\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*["']([^"']+)["']|(?:^|\n|;)\s*import\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noComments))) {
    if (m[5]) {
      specs.push(m[5]);
      continue;
    }
    if (m[2]) continue; // import type / export type
    const clause = m[3].trim();
    // `import { type A, type B } from` is erased too.
    const braced = clause.match(/^\{([\s\S]*)\}$/);
    if (braced) {
      const names = braced[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (names.length > 0 && names.every((n) => n.startsWith("type "))) {
        continue;
      }
    }
    specs.push(m[4]);
  }
  return specs;
}

type Graph = { files: Set<string>; external: Map<string, string> };

function walk(entry: string): Graph {
  const aliases = loadAliases();
  const files = new Set<string>();
  const external = new Map<string, string>(); // specifier -> importer
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const spec of staticValueSpecifiers(read(file))) {
      let target: string | null = null;
      if (spec.startsWith(".")) {
        target = resolveFile(path.resolve(path.dirname(file), spec));
      } else if (aliases.has(spec)) {
        target = resolveFile(aliases.get(spec)!);
      } else {
        if (!external.has(spec)) external.set(spec, file);
        continue;
      }
      if (/\.(css|svg|png|json)$/.test(spec)) continue;
      if (target) queue.push(target);
    }
  }
  return { files, external };
}

const rel = (f: string) => path.relative(FRONTEND, f).replace(/\\/g, "/");

describe("staticValueSpecifiers (walker sanity)", () => {
  it("keeps value imports and side-effect imports", () => {
    expect(
      staticValueSpecifiers(
        `import * as THREE from "three";\nimport "./side";\nexport { a } from './a';`,
      ),
    ).toEqual(["three", "./side", "./a"]);
  });

  it("drops type-only imports and re-exports", () => {
    expect(
      staticValueSpecifiers(
        `import type { X } from "three";\nimport { type Y, type Z } from "three/addons/x.js";\nexport type { W } from "./w";`,
      ),
    ).toEqual([]);
  });

  it("keeps a mixed value+type clause", () => {
    expect(
      staticValueSpecifiers(`import { type A, B } from "three";`),
    ).toEqual(["three"]);
  });

  it("ignores commented-out imports and dynamic import()", () => {
    expect(
      staticValueSpecifiers(
        `// import * as T from "three";\n/* import "three"; */\nconst m = () => import("three");`,
      ),
    ).toEqual([]);
  });

  it("detects a forbidden import reached through a relative chain", () => {
    // The real barrel must reach three; otherwise the check below proves nothing.
    const { external } = walk(BARREL);
    expect([...external.keys()].some((s) => /^three(\/|$)/.test(s))).toBe(true);
  });
});

describe("pagescene store entry (three-free)", () => {
  it("exists and exports exactly the store API", async () => {
    expect(existsSync(STORE_ENTRY)).toBe(true);
    const mod = await import("./store");
    expect(Object.keys(mod).sort()).toEqual([...STORE_NAMES].sort());
    expect(typeof mod.usePageSceneStore).toBe("function");
    expect(typeof mod.usePageSceneStore.getState).toBe("function");
    expect(typeof mod.getIsVisitingOthersScene).toBe("function");
  });

  it("returns a working zustand store with no 3D stage mounted", async () => {
    const { usePageSceneStore, getIsVisitingOthersScene } = await import(
      "./store"
    );
    const state = usePageSceneStore.getState();
    expect(state).toBeTypeOf("object");
    expect(state.is3DPageMounted).toBeFalsy();
    expect(typeof getIsVisitingOthersScene()).toBe("boolean");
  });

  it("does not statically reach three.js or any other 3D runtime", () => {
    const { external, files } = walk(STORE_ENTRY);
    const offenders = [...external.entries()]
      .filter(([spec]) => FORBIDDEN.some((re) => re.test(spec)))
      .map(([spec, from]) => `${spec} <- ${rel(from)}`);
    expect(offenders, `walked ${files.size} files`).toEqual([]);
  });

  it("does not reach the engine, the barrel or React components", () => {
    const { files } = walk(STORE_ENTRY);
    const reached = [...files].map(rel);
    expect(reached).not.toContain(rel(BARREL));
    expect(reached.filter((f) => f.includes("/lib/engine/"))).toEqual([]);
  });

  it("only needs light outside packages", () => {
    const { external } = walk(STORE_ENTRY);
    const pkgs = [...external.keys()].map((s) =>
      s.startsWith("@") ? s.split("/").slice(0, 2).join("/") : s.split("/")[0],
    );
    for (const p of pkgs) {
      expect(["three", "@sparkjsdev/spark", "react-dom"]).not.toContain(p);
    }
  });
});

describe("pagescene barrel keeps one store instance", () => {
  const barrel = read(BARREL);

  it("re-exports the store names from ./store", () => {
    const block = barrel.match(/export\s*\{([^}]*)\}\s*from\s*["']\.\/store["']/);
    expect(block, "index.ts must re-export from ./store").not.toBeNull();
    for (const name of STORE_NAMES) {
      expect(block![1]).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it("does not also export the store names straight from PageSceneStore", () => {
    const direct = [
      ...barrel.matchAll(
        /export\s*\{([^}]*)\}\s*from\s*["']\.\/lib\/PageSceneStore["']/g,
      ),
    ]
      .map((m) => m[1])
      .join(",");
    for (const name of STORE_NAMES) {
      expect(direct).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
    expect(barrel).not.toMatch(/export\s*\*\s*from\s*["']\.\/lib\/PageSceneStore["']/);
  });

  it("store.ts points at the same module the engine uses", () => {
    expect(read(STORE_ENTRY)).toMatch(/from\s*["']\.\/lib\/PageSceneStore["']/);
    const editor = read(path.join(LIB_SRC, "lib/engine/editor.ts"));
    expect(editor).toMatch(/from\s*["']\.\.\/PageSceneStore["']/);
  });
});
