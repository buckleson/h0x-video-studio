// R4-4: PageDraw is code-split like the other editor pages.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = readFileSync(path.join(__dirname, "MainApp.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("MainApp lazy pages", () => {
  it("loads PageDraw through React.lazy", () => {
    expect(SRC).toMatch(/const PageDraw = lazy\(\(\) => import\("\.\/PageDraw\/PageDraw"\)\)/);
  });

  it("has no eager static import of PageDraw", () => {
    expect(SRC).not.toMatch(/^import[^;]*from\s+["']\.\/PageDraw\/PageDraw["']/m);
    expect(SRC).not.toMatch(/^import\s+PageDraw\b/m);
  });

  it("still renders PageDraw inside a Suspense boundary", () => {
    expect(SRC).toMatch(/<Suspense\b/);
    expect(SRC).toMatch(/<PageDraw\s*\/>/);
  });

  it("keeps the eager usePageSceneStore import", () => {
    expect(SRC).toMatch(/import \{ usePageSceneStore \} from "@storyteller\/ui-pagescene";/);
  });
});
