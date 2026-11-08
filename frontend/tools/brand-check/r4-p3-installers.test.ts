import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// R4-P3: one-line installers. Asset names follow tauri-action v2 naming for
// productName + version; GitHub turns spaces in uploaded names into dots.
const ROOT = path.resolve(__dirname, "../../..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
const conf = JSON.parse(read("crates/desktop/artcraft/tauri.conf.json"));
const stem = `${conf.productName}_${conf.version}`;
const assets = [
  `${stem}_universal.dmg`,
  `${stem}_amd64.AppImage`,
  `${stem}_amd64.deb`,
  `${stem}_x64-setup.exe`,
  `${stem}_x64_en-US.msi`,
].flatMap((n) => [n, n.replace(/ /g, ".")]);

const sh = read("install.sh");
const ps1 = read("install.ps1");

describe("install.sh", () => {
  const patterns = [...sh.matchAll(/download "([^"]+)"/g)].map((m) => m[1]);

  it("downloads the macOS dmg, Linux AppImage and deb", () => {
    expect(patterns.sort()).toEqual(["_amd64.AppImage", "_amd64.deb", "_universal.dmg"]);
  });

  it.each(["_amd64.AppImage", "_amd64.deb", "_universal.dmg"])("%s matches exactly one release asset per name form", (p) => {
    const re = new RegExp(`${p}$`);
    expect(assets.filter((a) => re.test(a))).toHaveLength(2);
  });

  it("is strict bash, uses the public releases API and installs the plugin", () => {
    expect(sh.startsWith("#!/usr/bin/env bash")).toBe(true);
    expect(sh).toMatch(/set -euo pipefail/);
    expect(sh).toContain("https://api.github.com/repos/$REPO/releases/latest");
    expect(sh).toMatch(/claude plugin marketplace add "\$REPO"/);
    expect(sh).toContain("claude plugin install h0x@h0x-video-studio");
    expect(sh).toContain("/h0x:start");
  });

  it("explains the quarantine step before running it", () => {
    const explain = sh.indexOf("not signed");
    const run = sh.search(/^\s*xattr -dr com\.apple\.quarantine "\$INSTALLED"/m);
    expect(explain).toBeGreaterThan(-1);
    expect(run).toBeGreaterThan(explain);
  });
});

describe("install.ps1", () => {
  it("matches the Windows NSIS asset", () => {
    const p = ps1.match(/-like '\*([^']+)'/)![1];
    expect(p).toBe("_x64-setup.exe");
    expect(assets.filter((a) => a.endsWith(p))).toHaveLength(2);
  });

  it("installs silently and adds the plugin", () => {
    expect(ps1).toMatch(/-ArgumentList '\/S' -Wait/);
    expect(ps1).toContain("claude plugin install h0x@h0x-video-studio");
    expect(ps1).toContain("/h0x:start");
  });
});

describe("installers never handle API keys", () => {
  it.each([["install.sh", sh], ["install.ps1", ps1]])("%s", (_, src) => {
    const code = src.split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join("\n");
    expect(code).not.toMatch(/api[_-]?key|token|secret|password|Authorization|read -s|Read-Host/i);
  });
});
