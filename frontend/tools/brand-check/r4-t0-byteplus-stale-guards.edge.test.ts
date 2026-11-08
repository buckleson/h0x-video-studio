// R4-T0 edge cases: the 3 refreshed BytePlus brand checks still bite.
// - The unwrap()/expect() guard strips only the trailing #[cfg(test)] module,
//   so it can't pass on an empty or truncated "production" slice.
// - The CDN fields (PR #11) hold the local asset URL from local_asset_url,
//   which only builds Tauri asset-protocol URLs, never a vendor CDN host.
// Static source checks only: the desktop crate is compiled in CI, not here.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

const APP_DIR = path.resolve(__dirname, '../../..');
const CORE_DIR = path.join(APP_DIR, 'crates/desktop/artcraft/src/core');
const VIDEO_RS = path.join(CORE_DIR, 'commands/generate/generate_video/byteplus.rs');
const IMAGE_RS = path.join(CORE_DIR, 'commands/generate/generate_image/providers/byteplus.rs');
const POLL_RS = path.join(CORE_DIR, 'threads/third_party_task_polling_thread/handlers/byteplus/poll_byteplus_tasks.rs');
const HELPER_RS = path.join(CORE_DIR, 'utils/local_asset_url.rs');
const CFG_TEST = '#[cfg(test)]';
const PANIC = /\.unwrap\(\)|\.expect\(/;
const VENDOR_HOSTS = /storyteller|fakeyou|artcraft|getartcraft|cloudfront|cdn[.-]|\.cdn\b|ltx|lightricks/i;
const ASSET_BASES = ['http://asset.localhost/', 'asset://localhost/'];

/** File text, or '' when missing, so each test reports its own failure. */
const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');

/** Production code: everything before the first #[cfg(test)]. */
const prodSource = (src: string) => src.split(CFG_TEST)[0];

/** Text after the first #[cfg(test)] (the test module). */
const testSource = (src: string) => src.split(CFG_TEST).slice(1).join(CFG_TEST);

/** Trimmed lines of production code that mention a CDN field. */
const cdnLines = (src: string) =>
  prodSource(src)
    .split(/\r?\n/)
    .filter((l) => /cdn/i.test(l))
    .map((l) => l.trim());

/** True when a CDN line takes its value from the local asset_url binding only. */
const isLocalCdnLine = (line: string) =>
  /^maybe_(?:primary_media_file_)?cdn_url:\s*Some\(asset_url(?:\.as_str\(\))?\),$/.test(line);

const PROVIDERS = [
  { name: 'generate_video/byteplus.rs', file: VIDEO_RS, entry: 'pub async fn generate_video_byteplus(' },
  { name: 'generate_image/providers/byteplus.rs', file: IMAGE_RS, entry: 'pub async fn generate_image_byteplus(' },
];

describe('R4-T0 guard helpers (synthetic inputs)', () => {
  it('the panic guard catches .unwrap() and .expect(..)', () => {
    expect('let x = y.unwrap();').toMatch(PANIC);
    expect('let x = y.expect("boom");').toMatch(PANIC);
  });

  it('the panic guard ignores the non-panicking unwrap_or family', () => {
    for (const ok of ['a.unwrap_or(1)', 'a.unwrap_or_default()', 'a.unwrap_or_else(|| 2)', 'a.expect_err']) {
      expect(ok).not.toMatch(PANIC);
    }
  });

  it('prodSource drops only the test module and keeps code above it', () => {
    const src = 'fn main() { ok(); }\n#[cfg(test)]\nmod tests { fn t() { x.unwrap(); } }\n';
    expect(prodSource(src)).toBe('fn main() { ok(); }\n');
    expect(prodSource(src)).not.toMatch(PANIC);
    expect(testSource(src)).toMatch(PANIC);
  });

  it('prodSource keeps the whole file when there is no test module', () => {
    const src = 'fn main() { a.unwrap(); }\n';
    expect(prodSource(src)).toBe(src);
    expect(prodSource(src)).toMatch(PANIC);
  });

  it('the CDN line check accepts only the local asset_url binding', () => {
    expect(isLocalCdnLine('maybe_cdn_url: Some(asset_url),')).toBe(true);
    expect(isLocalCdnLine('maybe_primary_media_file_cdn_url: Some(asset_url.as_str()),')).toBe(true);
    expect(isLocalCdnLine('maybe_cdn_url: None,')).toBe(false);
    expect(isLocalCdnLine('maybe_cdn_url: Some(remote_url),')).toBe(false);
    expect(isLocalCdnLine('maybe_cdn_url: Some(Url::parse("https://cdn.storyteller.ai/x")?),')).toBe(false);
    expect(isLocalCdnLine('maybe_cdn_url: Some(format!("{}/{}", host, id)),')).toBe(false);
  });

  it('the vendor host pattern flags known vendor CDNs but not the asset host', () => {
    for (const bad of ['https://cdn.storyteller.ai/a.png', 'https://cdn-2.fakeyou.com/x', 'https://d1.cloudfront.net/x']) {
      expect(bad).toMatch(VENDOR_HOSTS);
    }
    for (const base of ASSET_BASES) expect(base).not.toMatch(VENDOR_HOSTS);
  });
});

describe.each(PROVIDERS)('R4-T0 production slice of $name', ({ file, entry }) => {
  const src = read(file);

  it('the file exists and has exactly one trailing #[cfg(test)] module', () => {
    expect(src.length).toBeGreaterThan(0);
    // Line-anchored: the test module may quote "#[cfg(test)]" in a string.
    expect(src.match(/^#\[cfg\(test\)\]\s*$/gm) ?? []).toHaveLength(1);
    expect(testSource(src)).toMatch(/^\s*mod tests\s*\{/);
  });

  it('the production slice still holds the entry point (stripping is not vacuous)', () => {
    expect(prodSource(src)).toContain(entry);
    expect(prodSource(src).length).toBeGreaterThan(src.length / 3);
  });

  it('production code has no unwrap()/expect()', () => {
    expect(prodSource(src)).not.toMatch(PANIC);
  });

  it('the test module is where any unwrap() lives, so stripping it is required', () => {
    // If this ever fails, the strip is no longer needed, but the guard still holds.
    expect(src).toMatch(PANIC);
  });

  it('production code has no hard-coded URL or vendor host', () => {
    expect(prodSource(src)).not.toMatch(/https?:\/\//);
    for (const lit of prodSource(src).match(/"(?:[^"\\]|\\.)*"/g) ?? []) expect(lit).not.toMatch(VENDOR_HOSTS);
  });
});

describe('R4-T0 image CDN fields hold the local asset URL', () => {
  const src = read(IMAGE_RS);
  const prod = prodSource(src);

  it('imports local_asset_url from the shared core utils helper', () => {
    expect(prod).toContain('use crate::core::utils::local_asset_url::local_asset_url;');
    expect(prod).not.toMatch(/fn local_asset_url\b/);
  });

  it('both CDN fields are set, and only from asset_url', () => {
    const lines = cdnLines(src);
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(isLocalCdnLine(l)).toBe(true);
    expect(lines.some((l) => l.startsWith('maybe_cdn_url:'))).toBe(true);
    expect(lines.some((l) => l.startsWith('maybe_primary_media_file_cdn_url:'))).toBe(true);
  });

  it('neither CDN field is None (the stale pre-PR #11 shape)', () => {
    expect(prod).not.toMatch(/maybe_cdn_url:\s*None/);
    expect(prod).not.toMatch(/maybe_primary_media_file_cdn_url:\s*None/);
  });

  it('asset_url is bound exactly once, from the saved local path', () => {
    expect(prod.match(/let asset_url\s*=/g) ?? []).toHaveLength(1);
    expect(prod).toContain('let asset_url = local_asset_url(&path);');
    expect(prod).toMatch(/let path = directory\.join\(/);
  });

  it('asset_url is built after the file is written to disk', () => {
    const write = prod.indexOf('tokio::fs::write(');
    expect(write).toBeGreaterThan(-1);
    expect(prod.indexOf('local_asset_url(&path)')).toBeGreaterThan(write);
  });

  it('the task row is updated with the asset URL before the frontend is notified', () => {
    const update = prod.indexOf('maybe_primary_media_file_cdn_url: Some(asset_url.as_str())');
    const notify = prod.indexOf('notify_frontend_of_completion(');
    expect(update).toBeGreaterThan(-1);
    expect(notify).toBeGreaterThan(update);
  });
});

describe('R4-T0 video completion (poller) uses the same local asset URL', () => {
  const prod = prodSource(read(POLL_RS));

  it('both CDN fields come from local_asset_url of the downloaded file', () => {
    expect(prod).toContain('let asset_url = local_asset_url(&local_path);');
    const lines = cdnLines(read(POLL_RS));
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(isLocalCdnLine(l)).toBe(true);
  });

  it('the poller production code has no unwrap()/expect()', () => {
    expect(prod).not.toMatch(PANIC);
  });
});

describe('R4-T0 local_asset_url only builds Tauri asset-protocol URLs', () => {
  const src = read(HELPER_RS);
  const prod = prodSource(src);

  it('the helper exists and is registered in core/utils/mod.rs', () => {
    expect(src.length).toBeGreaterThan(0);
    expect(read(path.join(CORE_DIR, 'utils/mod.rs'))).toMatch(/^\s*pub mod local_asset_url;/m);
  });

  it('the only URL bases are the Windows and non-Windows asset hosts', () => {
    const urls = prod.match(/"[a-z]+:\/\/[^"]*"/g) ?? [];
    expect(urls.map((u) => u.slice(1, -1)).sort()).toEqual([...ASSET_BASES].sort());
    expect(prod).toMatch(/if cfg!\(windows\) \{ "http:\/\/asset\.localhost\/" \} else \{ "asset:\/\/localhost\/" \}/);
  });

  it('no string literal in the helper names a vendor host', () => {
    for (const lit of prod.match(/"(?:[^"\\]|\\.)*"/g) ?? []) expect(lit).not.toMatch(VENDOR_HOSTS);
  });

  it('the path is percent-encoded (Windows backslash and drive colon included)', () => {
    expect(prod).toContain('encode_uri_component(&path.to_string_lossy())');
    // The unreserved set matches encodeURIComponent, so ':' and '\\' are escaped.
    const unreserved = prod.match(/b'A'\.\.=b'Z'[^=]*=>/)?.[0] ?? '';
    expect(unreserved).not.toContain("b':'");
    expect(unreserved).not.toContain("b'\\\\'");
    expect(unreserved).not.toContain("b'/'");
  });

  it('the helper has a Windows-path unit test', () => {
    expect(testSource(src)).toContain('C%3A%5CUsers');
  });
});
