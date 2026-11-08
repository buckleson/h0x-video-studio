// R4-P3 edge cases: the one-line installers.
// install.sh runs for real, fed on stdin like `curl | bash`, against stub
// commands (curl, uname, hdiutil, xattr, sudo, node, claude) in a temp HOME:
// no network, no real install, no sleeps. install.ps1, README and CI are
// checked as text (PowerShell parsing itself runs in the CI installers job).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const SH = read('install.sh');
const PS1 = read('install.ps1');
const README = read('README.md');
const CI = read('.github/workflows/ci.yml');
const CONF = JSON.parse(read('crates/desktop/artcraft/tauri.conf.json'));
const MARKET = JSON.parse(read('.claude-plugin/marketplace.json'));
const REPO = 'buckleson/h0x-video-studio';
const STEM = `${CONF.productName}_${CONF.version}`.replace(/ /g, '.');
const DL = `https://github.com/${REPO}/releases/download/v${CONF.version}`;
const FOREIGN = /ArtCraft|getartcraft|storyteller|fakeyou|\bLTX\b|LTX-|Lightricks/i;
const code = (src: string) => src.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

// Real bash: Git Bash on Windows (node cannot find it once PATH is narrowed).
const BASH =
  process.platform === 'win32'
    ? ['C:/Program Files/Git/usr/bin/bash.exe', 'C:/Program Files/Git/bin/bash.exe'].find(existsSync)
    : '/bin/bash';
const toBash = (p: string) =>
  process.platform === 'win32' ? p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`) : p;

// Release JSON in GitHub's pretty format; updater .sig/.tar.gz files and an
// aarch64 dmg sit first so the suffix match has to pick the right asset.
function releaseJson(names: string[]): string {
  const assets = names.map((n) => `    {\n      "name": "${n}",\n      "browser_download_url": "${DL}/${n}"\n    }`);
  return `{\n  "tag_name": "v${CONF.version}",\n  "assets": [\n${assets.join(',\n')}\n  ]\n}\n`;
}
const ALL_ASSETS = [
  `${STEM}_amd64.AppImage.sig`,
  `${STEM}_amd64.AppImage.tar.gz`,
  `${STEM}_aarch64.dmg`,
  `H0x.Video.Studio_universal.app.tar.gz`,
  `${STEM}_universal.dmg`,
  `${STEM}_amd64.AppImage`,
  `${STEM}_amd64.deb`,
  `${STEM}_x64-setup.exe`,
  `${STEM}_x64-setup.exe.sig`,
];

const STUBS: Record<string, string> = {
  curl: `log curl "$@"
out=""; prev=""
for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
if [ -n "$out" ]; then printf 'fake' > "$out"; exit 0; fi
[ "\${FAKE_API_FAIL:-0}" = 1 ] && exit 22
cat "$FAKE_RELEASE"`,
  uname: `case "$1" in -s) echo "$FAKE_OS" ;; -m) echo "$FAKE_ARCH" ;; *) echo "$FAKE_OS" ;; esac`,
  hdiutil: `log hdiutil "$@"
if [ "$1" = attach ]; then
  mnt=""; prev=""
  for a in "$@"; do [ "$prev" = "-mountpoint" ] && mnt="$a"; prev="$a"; done
  [ "\${FAKE_EMPTY_DMG:-0}" = 1 ] || mkdir -p "$mnt/$FAKE_APP.app/Contents"
fi`,
  xattr: `log xattr "$@"; echo "[stub] xattr ran"`,
  sudo: `log sudo "$@"`,
  node: `case "$1" in -v) echo "v$FAKE_NODE.0.0" ;; *) echo "$FAKE_NODE" ;; esac`,
  claude: `log claude "$@"
[ "$*" = "plugin marketplace add ${REPO}" ] && [ "\${FAKE_MARKET_EXISTS:-0}" = 1 ] && exit 1
exit 0`,
};

const tmpRoots: string[] = [];
afterEach(() => {
  while (tmpRoots.length) rmSync(tmpRoots.pop()!, { recursive: true, force: true });
});

type Run = { status: number | null; out: string; err: string; log: string[]; home: string; tmp: string };

function runInstaller(opts: {
  os?: string;
  arch?: string;
  args?: string[];
  assets?: string[];
  omit?: string[];
  env?: Record<string, string>;
}): Run {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'h0x-r4p3-'));
  tmpRoots.push(dir);
  const bin = path.join(dir, 'bin');
  const home = path.join(dir, 'home');
  const tmp = path.join(dir, 'tmp');
  for (const d of [bin, home, tmp]) mkdirSync(d);
  const logFile = path.join(dir, 'calls.log');
  writeFileSync(logFile, '');
  for (const [name, body] of Object.entries(STUBS)) {
    if (opts.omit?.includes(name)) continue;
    const f = path.join(bin, name);
    writeFileSync(f, `#!/bin/bash\nlog() { printf '%s\\n' "$*" >> "$STUB_LOG"; }\n${body}\n`, { mode: 0o755 });
  }
  const release = path.join(dir, 'release.json');
  writeFileSync(release, releaseJson(opts.assets ?? ALL_ASSETS));
  const env: Record<string, string> = {
    PATH: `${toBash(bin)}:/usr/bin:/bin`,
    HOME: toBash(home),
    TMPDIR: toBash(tmp),
    STUB_LOG: toBash(logFile),
    FAKE_RELEASE: toBash(release),
    FAKE_OS: opts.os ?? 'Linux',
    FAKE_ARCH: opts.arch ?? 'x86_64',
    FAKE_NODE: '20',
    FAKE_APP: CONF.productName,
    ...(process.platform === 'win32' ? { SYSTEMROOT: process.env.SYSTEMROOT ?? 'C:\\Windows' } : {}),
    ...opts.env,
  };
  // `curl ... | bash -s -- args`: the script arrives on stdin, as in the README.
  const r = spawnSync(BASH!, ['-s', '--', ...(opts.args ?? [])], { input: SH, env, encoding: 'utf8', timeout: 15000 });
  const log = readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
  return { status: r.status, out: r.stdout ?? '', err: r.stderr ?? '', log, home, tmp };
}
const calls = (r: Run, cmd: string) => r.log.filter((l) => l.startsWith(`${cmd} `)).map((l) => l.slice(cmd.length + 1));
const downloads = (r: Run) => calls(r, 'curl').filter((l) => l.includes(' -o ')).map((l) => l.split(' ').pop());

const hasBash = !!BASH && existsSync(BASH);
// The stubbed PATH must not already contain a real claude (tested as missing).
const claudeOnSystemPath =
  hasBash && spawnSync(BASH!, ['-c', 'command -v claude'], { env: { PATH: '/usr/bin:/bin' } }).status === 0;

describe.skipIf(!hasBash)('install.sh run against stubs (curl | bash)', () => {
  it('rejects an unknown option before touching the network', () => {
    const r = runInstaller({ args: ['--bogus'] });
    expect(r.status).toBe(1);
    expect(r.err).toMatch(/Unknown option: --bogus/);
    expect(r.log).toEqual([]);
  });

  it('stops with a clear error when the releases API is unreachable (offline)', () => {
    const r = runInstaller({ env: { FAKE_API_FAIL: '1' } });
    expect(r.status).not.toBe(0);
    expect(r.err).toMatch(/Could not read the latest release/);
    expect(calls(r, 'claude')).toEqual([]);
    expect(existsSync(path.join(r.home, '.local/bin/h0x-video-studio'))).toBe(false);
  });

  it('calls the public releases API with no auth header or token', () => {
    const r = runInstaller({});
    const api = calls(r, 'curl').find((l) => l.includes('api.github.com'));
    expect(api).toBe(`-fsSL https://api.github.com/repos/${REPO}/releases/latest`);
  });

  it('Linux: installs the AppImage (not its .sig/.tar.gz) with a .desktop entry, then the plugin', () => {
    const r = runInstaller({});
    expect(r.status, r.err).toBe(0);
    expect(downloads(r)).toEqual([`${DL}/${STEM}_amd64.AppImage`]);
    const bin = path.join(r.home, '.local/bin/h0x-video-studio');
    expect(readFileSync(bin, 'utf8')).toBe('fake');
    const desktop = readFileSync(path.join(r.home, '.local/share/applications/h0x-video-studio.desktop'), 'utf8');
    expect(desktop).toMatch(/^\[Desktop Entry\]\n/);
    expect(desktop).toContain(`Name=${CONF.productName}\n`);
    expect(desktop).toMatch(/^Exec=\S+\/\.local\/bin\/h0x-video-studio$/m);
    expect(calls(r, 'sudo')).toEqual([]);
    expect(calls(r, 'claude')).toEqual([`plugin marketplace add ${REPO}`, 'plugin install h0x@h0x-video-studio']);
    expect(r.out).toContain('Found Node v20.0.0.');
    expect(r.out.trimEnd().split('\n').pop()).toBe(`Open ${CONF.productName}, then run 'claude' and type /h0x:start`);
    expect(r.out).toMatch(/Add \S+ to your PATH/);
  });

  it('Linux --deb: installs the .deb through sudo apt and skips the AppImage', () => {
    const r = runInstaller({ args: ['--deb'] });
    expect(r.status, r.err).toBe(0);
    expect(downloads(r)).toEqual([`${DL}/${STEM}_amd64.deb`]);
    const apt = calls(r, 'sudo');
    expect(apt).toHaveLength(1);
    expect(apt[0]).toMatch(/^apt install -y \S+\.deb$/);
    expect(existsSync(path.join(r.home, '.local/bin/h0x-video-studio'))).toBe(false);
  });

  it.each(['aarch64', 'armv7l'])('Linux %s: stops before downloading (only x86_64 is published)', (arch) => {
    const r = runInstaller({ arch });
    expect(r.status).not.toBe(0);
    expect(r.err).toMatch(new RegExp(`Only x86_64 Linux builds.*${arch}`));
    expect(downloads(r)).toEqual([]);
    expect(calls(r, 'claude')).toEqual([]);
  });

  it('stops when the release has no matching asset (e.g. a release without Linux builds)', () => {
    const r = runInstaller({ assets: ALL_ASSETS.filter((a) => !a.endsWith('.AppImage')) });
    expect(r.status).not.toBe(0);
    expect(r.err).toMatch(/No _amd64\.AppImage file in the latest release/);
    expect(calls(r, 'claude')).toEqual([]);
  });

  it('stops on an empty release (no assets yet)', () => {
    const r = runInstaller({ assets: [] });
    expect(r.status).not.toBe(0);
    expect(r.err).toMatch(/No _amd64\.AppImage file/);
  });

  it('points Windows and other systems to the right installer', () => {
    const r = runInstaller({ os: 'MINGW64_NT-10.0' });
    expect(r.status).not.toBe(0);
    expect(r.err).toMatch(/Unsupported system.*install\.ps1/);
    expect(downloads(r)).toEqual([]);
  });

  it('macOS: installs the universal dmg app, explains quarantine before clearing it on that app only', () => {
    if (process.platform === 'darwin') return; // never write to a real /Applications
    const r = runInstaller({ os: 'Darwin', arch: 'arm64' });
    expect(r.status, r.err).toBe(0);
    expect(downloads(r)).toEqual([`${DL}/${STEM}_universal.dmg`]);
    const app = path.join(r.home, 'Applications', `${CONF.productName}.app`);
    expect(existsSync(path.join(app, 'Contents'))).toBe(true);
    const hd = calls(r, 'hdiutil');
    expect(hd[0]).toMatch(/^attach -nobrowse -quiet -mountpoint /);
    expect(hd.some((l) => l.startsWith('detach'))).toBe(true);
    const x = calls(r, 'xattr');
    expect(x).toEqual([`-dr com.apple.quarantine ${toBash(r.home)}/Applications/${CONF.productName}.app`]);
    const explain = r.out.indexOf('not signed');
    expect(explain).toBeGreaterThan(-1);
    expect(r.out.indexOf('[stub] xattr ran')).toBeGreaterThan(explain);
    expect(calls(r, 'sudo')).toEqual([]);
    expect(calls(r, 'claude')).toContain('plugin install h0x@h0x-video-studio');
  });

  it('macOS: a dmg with no .app detaches the image and fails without running xattr', () => {
    if (process.platform === 'darwin') return;
    const r = runInstaller({ os: 'Darwin', env: { FAKE_EMPTY_DMG: '1' } });
    expect(r.status).not.toBe(0);
    expect(r.err).toMatch(/No app found in the disk image/);
    expect(calls(r, 'hdiutil').some((l) => l.startsWith('detach'))).toBe(true);
    expect(calls(r, 'xattr')).toEqual([]);
  });

  it('re-running is idempotent: an existing marketplace falls back to update and still installs', () => {
    const r = runInstaller({ env: { FAKE_MARKET_EXISTS: '1' } });
    expect(r.status, r.err).toBe(0);
    expect(calls(r, 'claude')).toEqual([
      `plugin marketplace add ${REPO}`,
      `plugin marketplace update ${MARKET.name}`,
      'plugin install h0x@h0x-video-studio',
    ]);
  });

  it.skipIf(claudeOnSystemPath)('without claude: installs the app and prints how to add the plugin', () => {
    const r = runInstaller({ omit: ['claude'] });
    expect(r.status, r.err).toBe(0);
    expect(r.out).toContain('Claude Code is not installed');
    expect(r.out).toContain(`claude plugin marketplace add ${REPO}`);
    expect(r.out).toContain('claude plugin install h0x@h0x-video-studio');
    expect(r.out).toContain('/h0x:start');
  });

  it.each(['16', '17'])('Node %s: prints the Node 18+ hint but still finishes', (v) => {
    const r = runInstaller({ env: { FAKE_NODE: v } });
    expect(r.status, r.err).toBe(0);
    expect(r.out).toMatch(/Node 18\+ not found\. Install it from https:\/\/nodejs\.org/);
  });

  it('Node 18 exactly counts as new enough', () => {
    const r = runInstaller({ env: { FAKE_NODE: '18' } });
    expect(r.out).toContain('Found Node v18.0.0.');
  });

  it('cleans up its temp folder on success and on failure', () => {
    const ok = runInstaller({});
    expect(readdirSync(ok.tmp)).toEqual([]);
    const bad = runInstaller({ assets: [] });
    expect(readdirSync(bad.tmp)).toEqual([]);
  });

  it('prints no foreign brand in its output', () => {
    const r = runInstaller({});
    expect(r.out + r.err).not.toMatch(FOREIGN);
  });
});

describe('install.sh and install.ps1 as text', () => {
  it.each([['install.sh', SH], ['install.ps1', PS1]])('%s installs the app named in tauri.conf.json', (_, src) => {
    expect(src).toMatch(new RegExp(`(APP_NAME|\\$AppName)\\s*=\\s*['"]${CONF.productName}['"]`, 'i'));
  });

  it.each([['install.sh', SH], ['install.ps1', PS1]])('%s uses the marketplace and plugin names it publishes', (_, src) => {
    const plugin = MARKET.plugins.find((p: { name: string }) => p.name === 'h0x');
    expect(plugin).toBeDefined();
    expect(src).toContain(`claude plugin install ${plugin.name}@${MARKET.name}`);
    expect(src).toContain(`marketplace update ${MARKET.name}`);
    expect(src).toMatch(new RegExp(`Repo\\s*=\\s*['"]${REPO}['"]`, 'i'));
  });

  it.each([['install.sh', SH], ['install.ps1', PS1]])('%s is plain ASCII (Windows PowerShell 5.1 misreads BOM-less UTF-8)', (_, src) => {
    expect(src).toMatch(/^[\x09\x0a\x20-\x7e]*$/);
  });

  it.each([['install.sh', SH], ['install.ps1', PS1]])('%s carries no foreign brand', (_, src) => {
    expect(src).not.toMatch(FOREIGN);
  });

  it.each([['install.sh', SH], ['install.ps1', PS1]])('%s hardcodes no drive letter or user folder', (_, src) => {
    expect(code(src)).not.toMatch(/\b[A-Z]:\\|\/Users\/|C:\/|\\Users\\/i);
  });

  it('install.sh never reads from the terminal or evaluates downloaded text', () => {
    // Under `curl | bash` a `read` would swallow the rest of the script.
    const bare = code(SH).replace(/"[^"\n]*"|'[^'\n]*'/g, '""');
    expect(bare).not.toMatch(/(^|[;&|\s])(read|eval|source)\s/m);
    expect(code(SH)).not.toMatch(/\|\s*(ba)?sh\b/);
  });

  it('install.sh only uses sudo for the opt-in .deb', () => {
    const sudo = code(SH).split('\n').filter((l) => /\bsudo\b/.test(l));
    expect(sudo).toEqual([expect.stringMatching(/sudo apt install -y "\$deb"/)]);
  });

  it('install.ps1 throws instead of `exit`, which would close the shell running `| iex`', () => {
    expect(code(PS1)).not.toMatch(/\bexit\b/i);
  });

  it('install.ps1 avoids PowerShell 7-only syntax (&&, ||, ??, ternary)', () => {
    const c = code(PS1).replace(/'[^']*'|"[^"]*"/g, "''");
    expect(c).not.toMatch(/&&|\|\||\?\?|\s\?\s/);
  });

  it('install.ps1 explains SmartScreen before running the setup program, and cleans it up', () => {
    const explain = PS1.indexOf('not signed');
    const run = PS1.indexOf('Start-Process');
    expect(explain).toBeGreaterThan(-1);
    expect(run).toBeGreaterThan(explain);
    expect(PS1).toMatch(/Join-Path \$env:TEMP/);
    expect(PS1.indexOf('Remove-Item $setup')).toBeGreaterThan(run);
  });

  it('install.ps1 never asks for input or credentials', () => {
    expect(code(PS1)).not.toMatch(/Read-Host|Get-Credential|-Credential|-Headers|SecureString/i);
  });

  it('install.ps1 fails if the plugin install fails', () => {
    expect(PS1).toMatch(/plugin install h0x@h0x-video-studio\n\s*if \(\$LASTEXITCODE -ne 0\) \{ throw/);
  });
});

describe('README "Install in one line"', () => {
  const section = README.split(/^## /m).find((s) => s.startsWith('Install in one line')) ?? '';

  it('shows both exact one-liners', () => {
    expect(section).toContain(`curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash`);
    expect(section).toContain(`irm https://raw.githubusercontent.com/${REPO}/main/install.ps1 | iex`);
  });

  it('every raw URL points at a script that exists at the repo root', () => {
    const urls = [...README.matchAll(/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/main\/(\S+?)(?=[\s)`|])/g)];
    expect(urls.length).toBeGreaterThanOrEqual(2);
    for (const [, repo, file] of urls) {
      expect(repo).toBe(REPO);
      expect(existsSync(path.join(ROOT, file)), file).toBe(true);
    }
  });

  it('says what the installers do: unsigned step, plugin, no keys, /h0x:start', () => {
    expect(section).toMatch(/not signed/);
    expect(section).toMatch(/quarantine/);
    expect(section).toMatch(/Run anyway/);
    expect(section).toMatch(/never asks for or stores API keys/);
    expect(section).toContain('claude plugin install h0x@h0x-video-studio');
    expect(section).toContain('/h0x:start');
    expect(section).toContain('--deb');
  });

  it('carries no foreign brand', () => {
    expect(section).not.toMatch(FOREIGN);
  });
});

describe('CI installers job', () => {
  const job = CI.split(/^  (?=\w[\w-]*:\s*$)/m).find((j) => j.startsWith('installers:')) ?? '';

  it('runs on ubuntu with a bash syntax check and a pwsh parse of install.ps1', () => {
    expect(job).toMatch(/runs-on: ubuntu-/);
    expect(job).toMatch(/run: bash -n install\.sh/);
    expect(job).toMatch(/shell: pwsh/);
    expect(job).toMatch(/Parser\]::ParseFile\("\$PWD\/install\.ps1"/);
    expect(job).toMatch(/if \(\$errors\).*exit 1/);
  });

  it('the frontend job still runs every vitest project (this test included)', () => {
    expect(CI).toMatch(/nx run-many -t test/);
  });
});
