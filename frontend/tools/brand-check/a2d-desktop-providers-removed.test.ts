// A2d: the desktop crate (crates/desktop/artcraft) no longer contains the Grok,
// Midjourney, Sora and WorldLabs consumer services, their Tauri commands,
// provider handlers, startup threads, managed state or error variants.
// Static checks only (cargo is deferred to A2); no network, no build.
//
// Because nothing compiles here, the module, import, arity and state checks
// below stand in for the compiler: they catch a `mod` that points at a
// deleted file, a `use crate::...` into a deleted module, a call that still
// passes a removed argument, and a command asking for state nobody manages.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '../../..');
const CRATE = 'crates/desktop/artcraft';
const SRC = `${CRATE}/src`;
const CARGO = `${CRATE}/Cargo.toml`;
const LIB = `${SRC}/lib.rs`;

const DELETED_CRATES = [
  'midjourney_client',
  'openai_sora_client',
  'grok_consumer_client',
  'kinovi_web_client',
  'worldlabs_consumer_client',
  'cloudflare_mitigation',
  'browser_emulation',
];
const FORBIDDEN_DEPS = [...DELETED_CRATES, 'cookie_store_wrapper', 'wreq', 'wreq-util'];
// cookie_store's only user was the Midjourney cookie check in the billing thread.
const ALLOWED_DROPS = [...FORBIDDEN_DEPS, 'cookie_store'];
const KEPT_DEPS = ['artcraft_api_defs', 'artcraft_client', 'artcraft_router', 'fal_client', 'enums', 'errors', 'tokens', 'tauri', 'reqwest', 'serde', 'tokio'];
const ACCEPTANCE_GREP =
  'midjourney_client|openai_sora_client|grok_consumer_client|kinovi_web_client|worldlabs_consumer_client|cloudflare_mitigation|browser_emulation|cookie_store_wrapper|wreq';

const DELETED_PATHS = [
  `${SRC}/services/grok`,
  `${SRC}/services/midjourney`,
  `${SRC}/services/sora`,
  `${SRC}/services/worldlabs`,
  `${SRC}/core/lifecycle/startup/tasks/spawn_sora_task_polling_thread.rs`,
  `${SRC}/core/commands/generate/generate_image/providers/grok`,
  `${SRC}/core/commands/generate/generate_image/providers/midjourney`,
  `${SRC}/core/commands/generate/generate_image/providers/sora`,
  `${SRC}/core/commands/generate/generate_video/grok`,
  `${SRC}/core/commands/generate/generate_video/sora2`,
  `${SRC}/core/commands/deprecated/text_to_image/grok`,
  `${SRC}/core/commands/deprecated/text_to_image/midjourney`,
  `${SRC}/core/commands/deprecated/text_to_image/sora`,
  `${SRC}/core/commands/deprecated/image_edit/sora`,
  `${SRC}/core/commands/enqueue/image_to_gaussian/worldlabs`,
  `${SRC}/core/commands/enqueue/common/maybe_notify_frontend_of_grok_errors.rs`,
  `${SRC}/core/api_adapters/aspect_ratio/convert/aspect_ratio_to_grok_image.rs`,
  `${SRC}/core/api_adapters/aspect_ratio/convert/aspect_ratio_to_sora_native_gpt_image_1.rs`,
];

// The 14 Tauri commands whose files were deleted.
const REMOVED_COMMANDS = [
  'check_sora_session_command',
  'grok_clear_credentials_command',
  'grok_get_credential_info_command',
  'grok_open_login_command',
  'midjourney_clear_credentials_command',
  'midjourney_get_credential_info_command',
  'midjourney_open_login_command',
  'open_sora_login_command',
  'sora_get_credential_info_command',
  'sora_logout_command',
  'worldlabs_clear_credentials_command',
  'worldlabs_get_credential_info_command',
  'worldlabs_open_login_command',
  'worldlabs_receive_bearer_command',
];

// Managed state and thread entry points that lived in the deleted services.
const REMOVED_TYPES = [
  'GrokCredentialManager',
  'GrokImagePromptQueue',
  'MidjourneyCredentialManager',
  'MidjourneyUserInfo',
  'SoraCredentialManager',
  'SoraTaskQueue',
  'SoraCredentialSet',
  'SoraLoginSuccessEvent',
  'WorldlabsCredentialManager',
  'WorldlabsBearerBridge',
  'GrokError',
  'MidjourneyError',
  'SoraError',
  'WorldLabsError',
];
const REMOVED_FNS = [
  'spawn_sora_task_polling_thread',
  'sora_task_polling_thread',
  'grok_video_task_polling_thread',
  'grok_image_websocket_thread',
  'midjourney_long_polling_thread',
  'worldlabs_marble_task_polling',
  'maybe_notify_frontend_of_grok_errors',
  'aspect_ratio_to_grok_image',
  'aspect_ratio_to_sora_native_gpt_image_1',
  'extract_midjourney_webview_cookies',
  'extract_sora_webview_cookies',
  'cookie_store_has_auth_cookies',
  'maybe_upgrade_or_renew_session',
  'handle_midjourney',
  'handle_grok_video',
  'handle_sora_sora2',
];

const REMOVED_SERVICE_MODULES = ['grok', 'midjourney', 'sora', 'worldlabs'];

// Every command lib.rs registers after the 14 removals, sorted.
const REGISTERED_COMMANDS = [
  'download_directory_reveal_command',
  'download_media_file_command',
  'download_url_command',
  'enqueue_image_bg_removal_command',
  'enqueue_image_to_3d_object_command',
  'enqueue_image_to_gaussian_command',
  'estimate_audio_cost_command',
  'estimate_image_cost_command',
  'estimate_mesh_cost_command',
  'estimate_splat_cost_command',
  'estimate_video_cost_command',
  'flip_image',
  'generate_audio_command',
  'generate_image_command',
  'generate_mesh_command',
  'generate_splat_command',
  'generate_video_command',
  'get_app_info_command',
  'get_app_preferences_command',
  'get_download_path_command',
  'get_provider_order_command',
  'get_task_queue_command',
  'list_image_models_command',
  'list_video_models_command',
  'load_without_cors_command',
  'mark_task_as_dismissed_command',
  'media_file_delete_command',
  'platform_info_command',
  'provider_clear_command',
  'provider_list_command',
  'provider_set_api_key_command',
  'set_provider_order_command',
  'storyteller_cancel_login_challenge_command',
  'storyteller_create_login_challenge_command',
  'storyteller_get_credits_command',
  'storyteller_get_login_session_command',
  'storyteller_get_subscription_command',
  'storyteller_open_credits_purchase_command',
  'storyteller_open_customer_portal_cancel_plan_command',
  'storyteller_open_customer_portal_manage_plan_command',
  'storyteller_open_customer_portal_switch_plan_command',
  'storyteller_open_customer_portal_update_payment_method_command',
  'storyteller_open_subscription_purchase_command',
  'storyteller_password_login_command',
  'storyteller_password_signup_command',
  'storyteller_poll_login_challenge_command',
  'storyteller_purge_credentials_command',
  'tasks_nuke_all_command',
  'update_app_preferences_command',
];

// Every dependency in Cargo.toml after the drops, sorted.
const EXPECTED_DEPS = [
  'anyhow', 'artcraft_api_defs', 'artcraft_client', 'artcraft_router', 'base64', 'build_metadata', 'bytes', 'chrono',
  'directories', 'dirs', 'discord-rich-presence', 'enums', 'errors', 'fal_client', 'filesys', 'futures', 'image', 'images',
  'indexmap', 'log', 'memory_store', 'mimetypes', 'once_cell', 'os_info', 'primitives', 'rand', 'reqwest', 'serde',
  'serde_derive', 'serde_json', 'serial_test', 'sqlite_tasks', 'tauri', 'tauri-build', 'tauri-plugin-dialog',
  'tauri-plugin-http', 'tauri-plugin-log', 'tauri-plugin-opener', 'tauri-plugin-upload', 'tempdir', 'tempfile', 'tokens',
  'tokio', 'tokio-util', 'toml', 'url', 'url_utils', 'uuid_utils', 'web_base64',
];

// Sources the light lexer miscounts (lifetimes, char literals, raw strings).
const LEXER_QUIRKS = [
  'core/commands/download/download_directory_reveal_command.rs',
  'core/commands/generate/generate_video/artcraft/handle_artcraft_video_via_router.rs',
  'core/commands/generate/models/image/list_image_models_command.rs',
  'core/commands/generate/models/video/list_video_models_command.rs',
  'core/commands/generate/models/video/response_types.rs',
  'core/commands/generate/omni/dispatch.rs',
  'core/commands/generate/omni/request.rs',
  'core/commands/providers/deprecated/set_provider_order_command.rs',
  'core/commands/response/success_response_wrapper.rs',
  'core/state/app_preferences/app_preferences_serializable.rs',
  'core/state/app_preferences/preferred_download_directory.rs',
  'core/state/app_preferences/preferred_download_filename.rs',
  'core/state/data_dir/app_data_root.rs',
  'core/state/expanduser.rs',
  'core/threads/main_window_thread/persist_storyteller_cookies_task.rs',
  'core/threads/third_party_task_polling_thread/events/notify_frontend_of_completion.rs',
  'services/storyteller/commands/login_bridge.rs',
  'services/storyteller/commands/password_auth_error_message.rs',
  'services/storyteller/commands/storyteller_login_bridge_tests.rs',
].map((f) => `${SRC}/${f}`);

describe('A2d deleted files and directories', () => {
  it.each(DELETED_PATHS)('%s is gone from disk', (rel) => {
    expect(existsSync(abs(rel))).toBe(false);
  });

  it.each(DELETED_PATHS)('%s has no tracked or untracked file left in its place', (rel) => {
    expect(git('ls-files', '--cached', '--others', '--exclude-standard', '--', rel)).toBe('');
  });

  it('services/mod.rs declares no removed service module', () => {
    const decls = modDecls(read(`${SRC}/services/mod.rs`));
    for (const m of REMOVED_SERVICE_MODULES) expect(decls).not.toContain(m);
    expect(decls).toContain('storyteller');
  });

  it('the startup tasks module no longer declares the Sora polling task', () => {
    expect(modDecls(read(`${SRC}/core/lifecycle/startup/tasks/mod.rs`))).not.toContain('spawn_sora_task_polling_thread');
  });

  it('enqueue/common/mod.rs no longer declares the Grok error notifier', () => {
    expect(modDecls(read(`${SRC}/core/commands/enqueue/common/mod.rs`))).not.toContain('maybe_notify_frontend_of_grok_errors');
  });

  it('aspect_ratio/convert/mod.rs no longer declares the Grok or Sora converters', () => {
    const decls = modDecls(read(`${SRC}/core/api_adapters/aspect_ratio/convert/mod.rs`));
    expect(decls).not.toContain('aspect_ratio_to_grok_image');
    expect(decls).not.toContain('aspect_ratio_to_sora_native_gpt_image_1');
  });

  it.each([
    [`${SRC}/core/commands/generate/generate_image/providers/mod.rs`, ['grok', 'midjourney', 'sora'], ['artcraft', 'artcraft_router']],
    [`${SRC}/core/commands/generate/generate_video/mod.rs`, ['grok', 'sora2'], ['artcraft', 'generate_video_command', 'request']],
    [
      `${SRC}/core/commands/deprecated/text_to_image/mod.rs`,
      ['grok', 'midjourney', 'sora'],
      ['artcraft', 'enqueue_text_to_image_command', 'text_to_image_models'],
    ],
    [`${SRC}/core/commands/deprecated/image_edit/mod.rs`, ['sora'], ['artcraft', 'enqueue_edit_image_command', 'image_edit_models']],
    [`${SRC}/core/commands/enqueue/image_to_gaussian/mod.rs`, ['worldlabs'], ['artcraft', 'enqueue_image_to_gaussian_command']],
  ])('%s drops exactly its provider modules', (file, gone, kept) => {
    const now = modDecls(read(file));
    for (const m of gone) expect(now).not.toContain(m);
    expect([...now].sort()).toEqual(kept);
  });
});

describe('A2d module tree (compiler stand-in)', () => {
  const files = rustFiles();

  it('finds the crate sources (guards against an empty walk)', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain(LIB);
  });

  it('every `mod x;` resolves to an existing file', () => {
    const missing: string[] = [];
    for (const f of files) {
      for (const d of modDeclsWithPath(read(f))) {
        if (!resolveMod(f, d)) missing.push(`${f}: mod ${d.name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every .rs file is reachable from lib.rs or main.rs (no orphaned provider file)', () => {
    const reachable = new Set<string>();
    const queue = [LIB, `${SRC}/main.rs`].filter((f) => existsSync(abs(f)));
    while (queue.length) {
      const f = queue.pop() as string;
      if (reachable.has(f)) continue;
      reachable.add(f);
      for (const d of modDeclsWithPath(read(f))) {
        const r = resolveMod(f, d);
        if (r) queue.push(r);
      }
    }
    expect(files.filter((f) => !reachable.has(f))).toEqual([]);
  });

  it('no `crate::` path walks into a deleted module', () => {
    const deletedModules = deletedModulePaths();
    const stale: string[] = [];
    for (const f of files) {
      for (const p of cratePaths(stripStringsAndComments(read(f)))) {
        const segs = p.split('::');
        let mod = 'crate';
        for (const s of segs) {
          const next = `${mod}::${s}`;
          if (moduleFile(next)) {
            mod = next;
            continue;
          }
          if (deletedModules.has(next)) stale.push(`${f}: ${p}`);
          break;
        }
      }
    }
    expect([...new Set(stale)]).toEqual([]);
  });

  it('no source names a removed service module path', () => {
    const re = new RegExp(`\\bservices::(${REMOVED_SERVICE_MODULES.join('|')})\\b`);
    const hits = files.filter((f) => re.test(read(f)));
    expect(hits).toEqual([]);
  });

  it.each(REMOVED_TYPES)('no source still names %s', (name) => {
    const re = new RegExp(`\\b${name}\\b`);
    expect(files.filter((f) => re.test(stripStringsAndComments(read(f))))).toEqual([]);
  });

  it.each(REMOVED_FNS)('no source still calls or imports %s', (name) => {
    const re = new RegExp(`\\b${name}\\b`);
    expect(files.filter((f) => re.test(stripStringsAndComments(read(f))))).toEqual([]);
  });

  it('every free fn call passes as many arguments as the fn declares', () => {
    const defs = new Map<string, number[]>();
    for (const f of files) {
      for (const d of fnDefs(read(f))) {
        defs.set(d.name, [...(defs.get(d.name) ?? []), d.arity]);
      }
    }
    const mismatches: string[] = [];
    for (const f of files) {
      const code = stripStringsAndComments(read(f));
      for (const c of fnCalls(code, defs)) {
        mismatches.push(`${f}: ${c.name} called with ${c.arity}, declared ${c.declared}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('every `app.state()` forwarding call matches the callee State<...> parameter count', () => {
    const bad: string[] = [];
    for (const f of files) {
      const code = stripStringsAndComments(read(f));
      for (const d of fnDefs(code)) {
        if (d.stateParams === 0) continue;
        for (const args of callArgs(code, d.name)) {
          const forwarded = args.filter((a) => /^\w+\.state\(\)$/.test(a.replace(/\s+/g, ''))).length;
          if (forwarded > 0 && forwarded !== d.stateParams) bad.push(`${f}: ${d.name} forwards ${forwarded}, wants ${d.stateParams}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  // The light lexer miscounts LEXER_QUIRKS; every other source must balance,
  // so a half-deleted block shows up here.
  it('every source outside the known lexer quirks has balanced brackets (no half-deleted block)', () => {
    const zero = JSON.stringify({ brace: 0, paren: 0, bracket: 0 });
    const bad = files.filter((f) => !LEXER_QUIRKS.includes(f) && JSON.stringify(balance(stripStringsAndComments(read(f)))) !== zero);
    expect(bad).toEqual([]);
  }, 30_000);
});

describe('A2d Tauri command registration (lib.rs)', () => {
  const lib = read(LIB);
  const handlers = generateHandlerNames(lib);

  it('parses the generate_handler! list (guards against a silent empty parse)', () => {
    expect(handlers.length).toBeGreaterThan(20);
  });

  it.each(REMOVED_COMMANDS)('%s is not registered or imported', (cmd) => {
    expect(handlers).not.toContain(cmd);
    expect(lib).not.toMatch(new RegExp(`\\b${cmd}\\b`));
  });

  it('registers exactly the remaining commands', () => {
    expect([...handlers].sort()).toEqual(REGISTERED_COMMANDS);
  });

  it('registers each command once', () => {
    expect(handlers.filter((h, i) => handlers.indexOf(h) !== i)).toEqual([]);
  });

  it('every registered command is a #[tauri::command] fn that still exists', () => {
    const commands = new Set<string>();
    for (const f of rustFiles()) {
      for (const m of read(f).matchAll(/#\[tauri::command[^\]]*\][\s\S]{0,200}?\bfn\s+(\w+)/g)) commands.add(m[1]);
    }
    expect(handlers.filter((h) => !commands.has(h))).toEqual([]);
  });

  it('every registered command is imported by lib.rs', () => {
    const imported = new Set([...lib.matchAll(/^\s*use\s+[\w:]+::(\w+)\s*;/gm)].map((m) => m[1]));
    for (const m of lib.matchAll(/^\s*use\s+[\w:]+::\{([^}]*)\}\s*;/gm)) {
      for (const n of m[1].split(',')) imported.add(n.trim().split('::').pop() as string);
    }
    expect(handlers.filter((h) => !imported.has(h))).toEqual([]);
  });

  it('no .manage() call registers a removed state type or its variable', () => {
    const managed = [...lib.matchAll(/\.manage\(\s*([\w.()]+)\s*\)/g)].map((m) => m[1]);
    expect(managed.length).toBeGreaterThan(3);
    for (const v of managed) expect(v).not.toMatch(/grok|midjourney|mj_|sora|worldlabs/i);
  });

  it('no command asks for State<T> that nothing manages (would panic at runtime)', () => {
    const managedTypes = managedStateTypes();
    const wanted = new Set<string>();
    for (const f of rustFiles()) {
      for (const m of read(f).matchAll(/\bState<\s*'_\s*,\s*([\w:]+)\s*>/g)) wanted.add(m[1].split('::').pop() as string);
    }
    expect([...wanted].filter((t) => !managedTypes.has(t)).sort()).toEqual([]);
  });

  it('handle_tauri_startup is called with as many arguments as it declares', () => {
    const startup = read(`${SRC}/core/lifecycle/startup/handle_tauri_startup.rs`);
    const def = fnDefs(startup).find((d) => d.name === 'handle_tauri_startup');
    expect(def).toBeDefined();
    const calls = callArgs(stripStringsAndComments(lib), 'handle_tauri_startup');
    expect(calls.length).toBe(1);
    expect(calls[0].length).toBe(def?.arity);
  });

  it('lib.rs no longer loads removed credentials or queues at startup', () => {
    expect(lib).not.toMatch(/grok_creds|grok_prompt_queue|midjourney_creds|sora_creds|sora_task_queue|worldlabs_(creds|bearer)/);
    expect(lib).not.toMatch(/read existing sora credentials/i);
  });
});

describe('A2d startup threads', () => {
  const startup = read(`${SRC}/core/lifecycle/startup/handle_tauri_startup.rs`);

  it('spawns no removed provider thread', () => {
    expect(startup).not.toMatch(/sora|grok|midjourney|mj_creds|worldlabs/i);
  });

  it('still spawns the shared third-party polling and storyteller threads', () => {
    expect(startup).toMatch(/third_party_task_polling_thread\(/);
    expect(startup).toMatch(/spawn_storyteller_threads\(/);
    expect(startup).toMatch(/spawn_main_window_thread\(/);
  });

  it('every startup task the function imports is still declared in tasks/mod.rs', () => {
    const decls = modDecls(read(`${SRC}/core/lifecycle/startup/tasks/mod.rs`));
    const used = [...startup.matchAll(/startup::tasks::(\w+)::/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((u) => !decls.includes(u))).toEqual([]);
  });
});

describe('A2d remaining commands lost the removed state params', () => {
  const OWNED = [
    `${SRC}/core/commands/generate/generate_image/generate_image_command.rs`,
    `${SRC}/core/commands/generate/generate_video/generate_video_command.rs`,
    `${SRC}/core/commands/deprecated/text_to_image/enqueue_text_to_image_command.rs`,
    `${SRC}/core/commands/deprecated/image_edit/enqueue_edit_image_command.rs`,
    `${SRC}/core/commands/deprecated/image_inpaint/enqueue_image_inpaint_command.rs`,
    `${SRC}/core/commands/enqueue/image_bg_removal/enqueue_image_bg_removal_command.rs`,
    `${SRC}/core/commands/enqueue/image_to_gaussian/enqueue_image_to_gaussian_command.rs`,
    `${SRC}/core/commands/enqueue/image_to_object/enqueue_image_to_3d_object_command.rs`,
    `${SRC}/core/commands/media_files/media_file_delete_command.rs`,
    `${SRC}/core/commands/task_queue/get_task_queue_command.rs`,
    `${SRC}/core/commands/task_queue/mark_task_as_dismissed_command.rs`,
    `${SRC}/core/commands/task_queue/tasks_nuke_all_command.rs`,
    `${SRC}/services/storyteller/commands/storyteller_get_credits_command.rs`,
    `${SRC}/services/storyteller/commands/storyteller_get_subscription_command.rs`,
    `${SRC}/services/storyteller/windows/open_storyteller_billing_window.rs`,
    `${SRC}/services/storyteller/windows/storyteller_billing_window_thread.rs`,
  ];

  it.each(OWNED)('%s has no removed state param, import or local', (file) => {
    const code = stripStringsAndComments(read(file));
    expect(code).not.toMatch(/(grok|midjourney|mj|sora|worldlabs)_(creds|credential|credentials|task_queue|prompt_queue|bearer)\w*/i);
    for (const t of REMOVED_TYPES) expect(code).not.toMatch(new RegExp(`\\b${t}\\b`));
  });

  // Each *_command.rs keeps the command it is named after; the billing window files have none.
  it.each(OWNED)('%s keeps its #[tauri::command]', (file) => {
    const names = [...read(file).matchAll(/#\[tauri::command[^\]]*\][\s\S]{0,200}?\bfn\s+(\w+)/g)].map((m) => m[1]);
    const base = path.posix.basename(file, '.rs');
    expect(names).toEqual(base.endsWith('_command') ? [base] : []);
  });

  it('the billing window thread no longer checks Midjourney or Sora cookies', () => {
    const t = read(`${SRC}/services/storyteller/windows/storyteller_billing_window_thread.rs`);
    expect(t).not.toMatch(/midjourney|sora|cookie_store|CookieStore|has_auth_cookies/i);
    expect(t).toMatch(/fn storyteller_billing_window_thread\b/);
    expect(t).toMatch(/BILLING_WINDOW_NAME/);
  });

  it('video generation always routes to the ArtCraft handler', () => {
    const v = read(`${SRC}/core/commands/generate/generate_video/generate_video_command.rs`);
    expect(v).toMatch(/handle_video_artcraft\(/);
    expect(v).not.toMatch(/GenerationProvider::(Grok|Sora)\b/);
    expect(v).not.toMatch(/TauriVideoModel::GrokVideo\b/);
  });

  it('image generation has no Midjourney dispatch arm or login-modal trigger', () => {
    const g = stripStringsAndComments(read(`${SRC}/core/commands/generate/generate_image/generate_image_command.rs`));
    expect(g).not.toMatch(/GenerationProvider::(Midjourney|Sora|Grok)\s*=>/);
    expect(g).not.toMatch(/ShowProviderLoginModalEvent::send_for_provider\(\s*GenerationProvider::Midjourney/);
  });

  it('credential path helpers for removed providers are gone, ArtCraft ones remain', () => {
    const c = read(`${SRC}/core/state/data_dir/app_credentials_dir.rs`);
    expect(c).not.toMatch(/fn get_(grok|sora|midjourney|worldlabs)_\w+/);
    expect(c).not.toMatch(/"(grok|sora|midjourney|worldlabs)_[\w.]+"/);
    expect([...c.matchAll(/fn (\w+)/g)].map((m) => m[1]).sort()).toEqual([
      'get_fal_api_key_file_path',
      'get_storyteller_avt_cookie_file_path',
      'get_storyteller_session_cookie_file_path',
      'new_from',
      'path',
    ]);
  });
});

describe('A2d error types', () => {
  const artcraftError = read(`${SRC}/core/artcraft_error.rs`);
  const generateError = read(`${SRC}/core/commands/enqueue/generate_error.rs`);
  const routerProviderError = read('crates/api_clients/artcraft/artcraft_router/src/errors/provider_error.rs');

  it.each([
    ['artcraft_error.rs', artcraftError],
    ['generate_error.rs', generateError],
  ])('%s wraps no deleted crate error type', (_name, src) => {
    const code = stripStringsAndComments(src);
    expect(code).not.toMatch(new RegExp(`\\b(${DELETED_CRATES.join('|')})::`));
    expect(code).not.toMatch(/\b(GrokError|MidjourneyError|SoraError|WorldLabsError|KinoviError)\b/);
    expect(code).not.toMatch(/impl From<(Grok|Midjourney|Sora|WorldLabs)\w*Error>/);
  });

  it('ArtcraftError keeps its Storyteller and IO variants', () => {
    const v = enumVariants(artcraftError, 'ArtcraftError');
    expect(v).toContain('StorytellerError');
    expect(v).toContain('IoError');
    expect(v).not.toContain('GrokError');
  });

  it('ProviderFailureReason only wraps the Storyteller error', () => {
    expect(enumVariants(generateError, 'ProviderFailureReason')).toEqual(['StorytellerError']);
  });

  it('BillingProvider is exactly ArtCraft and fal', () => {
    expect(enumVariants(generateError, 'BillingProvider')).toEqual(['Artcraft', 'Fal']);
  });

  it('the router ProviderError match arms line up with the router enum (exhaustive, no dead arms)', () => {
    const routerVariants = enumVariants(routerProviderError, 'ProviderError').sort();
    const code = stripStringsAndComments(generateError);
    const billing = [...code.matchAll(/^\s*ProviderError::(\w+)\(_\)\s*=>\s*BillingProvider::/gm)].map((m) => m[1]).sort();
    expect(billing).toEqual(routerVariants);
    const used = [...new Set([...code.matchAll(/ProviderError::(\w+)/g)].map((m) => m[1]))];
    expect(used.filter((u) => !routerVariants.includes(u))).toEqual([]);
  });

  // The developer left these frontend-facing enums in place on purpose; they
  // are serialized to the frontend, so A2d must not have dropped any variant.
  it.each([
    [
      `${SRC}/core/commands/enqueue/generate_error.rs`,
      'MissingCredentialsReason',
      [
        'NeedsGrokCredentials',
        'NeedsFalApiKey',
        'NeedsMidjourneyCredentials',
        'NeedsMidjourneyUserId',
        'NeedsMidjourneyUserInfo',
        'NeedsSoraCredentials',
        'NeedsStorytellerCredentials',
        'NeedsWorldLabsCredentials',
      ],
    ],
    [
      `${SRC}/core/commands/generate/generate_image/tauri_generate_image_request.rs`,
      'TauriGenerateImageErrorType',
      [
        'ModelNotSpecified',
        'BadInput',
        'NoProviderAvailable',
        'ServerError',
        'NeedsStorytellerCredentials',
        'NeedsFalApiKey',
        'NeedsGrokCredentials',
        'NeedsMidjourneyCredentials',
        'BillingIssue',
      ],
    ],
  ])('%s keeps every %s variant', (file, name, variants) => {
    expect(enumVariants(read(file as string), name as string)).toEqual(variants);
  });

  // The four GenerateError constructors whose only callers were the deleted
  // handlers are gone; the enum variants they built stay.
  const REMOVED_CONSTRUCTORS = [
    'needs_grok_credentials',
    'needs_midjourney_credentials',
    'needs_sora_credentials',
    'needs_worldlabs_credentials',
  ];

  it.each(REMOVED_CONSTRUCTORS)('GenerateError::%s is neither defined nor called in the desktop crate', (fn) => {
    // `(` keeps the serialized snake_case error names (string literals) out of the match.
    expect(gitGrep(`\\b${fn}\\s*\\(`, false, 'crates/desktop')).toBe('');
  });

  it('generate_error.rs keeps exactly its remaining fns', () => {
    expect(fnDefs(generateError).map((f) => f.name).sort()).toEqual([
      'both_image_mask_media_token_and_bytes_supplied',
      'from',
      'from',
      'from',
      'from',
      'needs_fal_api_key',
      'needs_storyteller_credentials',
      'no_model_specified',
      'required_source_image_mask_not_provided',
      'required_source_image_not_provided',
    ]);
  });

  it('the surviving fal and storyteller constructors are kept', () => {
    const names = fnDefs(generateError).map((f) => f.name);
    expect(names).toContain('needs_fal_api_key');
    expect(names).toContain('needs_storyteller_credentials');
  });

  it('every MissingCredentialsReason variant is still used outside its definition (no dead variant)', () => {
    const others = rustFiles()
      .filter((f) => !f.endsWith('/generate_error.rs'))
      .map((f) => stripComments(read(f)))
      .join('\n');
    const unused = enumVariants(generateError, 'MissingCredentialsReason').filter(
      (v) => !new RegExp(`MissingCredentialsReason::${v}\\b`).test(others),
    );
    // NeedsFalApiKey is built inside generate_error.rs itself by needs_fal_api_key().
    expect(unused.filter((v) => v !== 'NeedsFalApiKey')).toEqual([]);
  });

  it('every frontend GenerateImageErrorType value still has a matching Rust variant (serialized snake_case)', () => {
    const ts = read('frontend/libs/tauri-api/src/lib/generate/GenerateImage.ts');
    const block = ts.match(/export enum GenerateImageErrorType\s*\{([\s\S]*?)\}/);
    expect(block).not.toBeNull();
    const tsValues = [...(block as RegExpMatchArray)[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(tsValues.length).toBeGreaterThan(0);
    const rust = enumVariants(
      read(`${SRC}/core/commands/generate/generate_image/tauri_generate_image_request.rs`),
      'TauriGenerateImageErrorType',
    ).map((v) => v.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase());
    expect(tsValues.filter((v) => !rust.includes(v))).toEqual([]);
  });
});

describe('A2d Cargo.toml', () => {
  const toml = read(CARGO);
  const deps = dependencyNames(toml);

  it('parses the dependency tables (guards against a silent empty parse)', () => {
    expect(deps.length).toBeGreaterThan(15);
  });

  it.each(FORBIDDEN_DEPS)('does not depend on %s in any table', (crate) => {
    expect(deps).not.toContain(crate);
  });

  it('mentions no deleted crate anywhere, including features and comments', () => {
    expect(toml).not.toMatch(new RegExp(`\\b(${[...DELETED_CRATES, 'cookie_store_wrapper', 'wreq(-util)?'].join('|')})\\b`));
    expect(toml).not.toMatch(/features\s*=\s*\[[^\]]*"wreq"/);
  });

  it.each(KEPT_DEPS)('still depends on %s', (crate) => {
    expect(deps).toContain(crate);
  });

  it('lists each dependency once', () => {
    expect(deps.filter((d, i) => deps.indexOf(d) !== i)).toEqual([]);
  });

  it('depends on exactly the remaining crates', () => {
    expect([...deps].sort()).toEqual(EXPECTED_DEPS);
  });

  it('no source still uses a dropped dependency', () => {
    const dropped = ALLOWED_DROPS.map((d) => d.replace(/-/g, '_'));
    const re = new RegExp(`(^|[^\\w:])(${dropped.join('|')})::`, 'm');
    expect(rustFiles().filter((f) => re.test(stripStringsAndComments(read(f))))).toEqual([]);
  });

  it('keeps the package name', () => {
    expect(toml).toMatch(/^\[package\]/m);
    expect(toml).toMatch(/^name\s*=\s*"[\w-]+"/m);
  });
});

describe('A2d acceptance grep and scope', () => {
  it('git grep over crates/desktop (tracked and untracked) is empty', () => {
    expect(gitGrep(ACCEPTANCE_GREP, false, 'crates/desktop')).toBe('');
  });

  it('git grep for cookie_store:: / browser cookie helpers over the crate is empty', () => {
    expect(gitGrep('\\bcookie_store::', false, SRC)).toBe('');
  });

  it('capabilities grant nothing to a removed service', () => {
    for (const f of readdirSync(abs(`${CRATE}/capabilities`))) {
      const c = read(`${CRATE}/capabilities/${f}`);
      expect(c).not.toMatch(/grok|midjourney|sora|worldlabs|kinovi/i);
      for (const cmd of REMOVED_COMMANDS) expect(c).not.toContain(cmd);
    }
  });

  it('no crate source has an LTX or Lightricks brand', () => {
    for (const f of rustFiles()) expect(read(f), f).not.toMatch(/\bLTX\b|Lightricks/i);
  });

  // Ceilings are the counts after A2d, so any new string pushes the total over.
  const literalCount = (re: RegExp) => rustFiles().reduce((n, f) => n + stringLiterals(read(f)).filter((s) => re.test(s)).length, 0);

  it('the crate gained no user-visible "ArtCraft" string', () => {
    expect(literalCount(/artcraft/i)).toBeLessThanOrEqual(107);
  }, 30_000);

  it('the crate gained no string literal naming a removed provider', () => {
    expect(literalCount(/grok|midjourney|sora|worldlabs|world labs/i)).toBeLessThanOrEqual(83);
  }, 30_000);
});

// ---------------------------------------------------------------- helpers

function abs(rel: string): string {
  return path.join(APP_ROOT, ...rel.split('/'));
}

function read(rel: string): string {
  // Normalise CRLF so line-anchored checks behave the same on Windows checkouts.
  return readFileSync(abs(rel), 'utf8').replace(/\r\n/g, '\n');
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: APP_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replace(/\r\n/g, '\n').trim();
}

// git grep exits 1 when nothing matches; treat that as "no output".
function gitGrep(pattern: string, ignoreCase: boolean, ...scope: string[]): string {
  const flags = ['grep', '--untracked', '-n', '-I', '-E', ...(ignoreCase ? ['-i'] : []), pattern, '--', ...scope];
  try {
    return git(...flags);
  } catch (e) {
    if ((e as { status?: number }).status === 1) return '';
    throw e;
  }
}

let rustFilesCache: string[] | undefined;
// Crate sources as repo-relative POSIX paths (Windows separators normalised).
function rustFiles(): string[] {
  if (rustFilesCache) return rustFilesCache;
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(abs(rel))) {
      const child = `${rel}/${name}`;
      if (statSync(abs(child)).isDirectory()) walk(child);
      else if (name.endsWith('.rs')) out.push(child);
    }
  };
  walk(SRC);
  rustFilesCache = out.sort();
  return rustFilesCache;
}

// Types registered with Tauri's `.manage(x)` anywhere in the crate. `x` is
// resolved through `Type::ctor(..)`, `let x: Type`, `let x = Type::..`,
// `let x = y.clone()` and `let x = some_fn(..)` where `fn some_fn(..) -> Type`.
function managedStateTypes(): Set<string> {
  const files = rustFiles().map((f) => stripComments(read(f)));
  const all = files.join(String.fromCharCode(10));
  const fnReturns = new Map<string, string>();
  for (const m of all.matchAll(/\bfn\s+(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*->\s*(?:\w+Result<|Result<|Option<)?\s*([A-Z]\w*)/g)) {
    fnReturns.set(m[1], m[2]);
  }
  const out = new Set<string>();
  for (const src of files) {
    const resolve = (expr: string, depth = 0): string | undefined => {
      if (depth > 5) return undefined;
      const e = expr.trim();
      const typed = e.match(/^(?:[\w]+::)*([A-Z]\w*)\s*(?:::|\{|$)/);
      if (typed) return typed[1];
      const v = e.match(/^(\w+)(?:\.clone\(\))?$/);
      if (!v) return undefined;
      const let_ = src.match(new RegExp(`\\blet\\s+(?:mut\\s+)?${v[1]}\\s*(?::\\s*([\\w:<>]+))?\\s*=\\s*([^;]+);`));
      if (!let_) return undefined;
      if (let_[1]) return let_[1].split('::').pop()?.replace(/<.*/, '');
      const rhs = let_[2].trim();
      const call = rhs.match(/^(?:[\w]+::)*(\w+)\s*\(/);
      if (call && /^[a-z_]/.test(call[1]) && !rhs.match(/^(?:[\w]+::)*[A-Z]\w*::/)) {
        const t = fnReturns.get(call[1]);
        if (t) return t;
      }
      const ctor = rhs.match(/^(?:[a-z_]\w*::)*([A-Z]\w*)::/);
      if (ctor) return ctor[1];
      const match = rhs.match(/^match\s+(?:[a-z_]\w*::)*([A-Z]\w*)::/);
      if (match) return match[1];
      return resolve(rhs.replace(/\.clone\(\)$/, ''), depth + 1);
    };
    for (const m of src.matchAll(/\.manage\(\s*([^()]+(?:\(\))?)\s*\)/g)) {
      const t = resolve(m[1]);
      if (t) out.add(t);
    }
  }
  return out;
}

// crate:: module paths of DELETED_PATHS.
function deletedModulePaths(): Set<string> {
  return new Set(DELETED_PATHS.map((p) => ['crate', ...p.slice(SRC.length + 1).replace(/\.rs$/, '').split('/')].join('::')));
}

// The file backing a crate:: module path, if it exists on disk now.
function moduleFile(modPath: string): string | undefined {
  const segs = modPath.split('::').slice(1);
  const base = [SRC, ...segs].join('/');
  for (const c of [`${base}.rs`, `${base}/mod.rs`]) if (existsSync(abs(c))) return c;
  return undefined;
}

type ModDecl = { name: string; explicitPath?: string };

function modDecls(src: string): string[] {
  return modDeclsWithPath(src).map((d) => d.name);
}

// Out-of-line `mod x;` declarations, with an optional #[path = "..."] override.
function modDeclsWithPath(src: string): ModDecl[] {
  const code = stripComments(src);
  return [...code.matchAll(/((?:#\[[^\]]*\]\s*)*)(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/g)].map((m) => {
    const p = m[1].match(/#\[path\s*=\s*"([^"]+)"\]/);
    return { name: m[2], explicitPath: p?.[1] };
  });
}

// Rust 2018 module resolution: children of lib.rs / main.rs / mod.rs live in the
// same directory; children of foo.rs live in foo/.
function resolveMod(file: string, d: ModDecl): string | undefined {
  const dir = path.posix.dirname(file);
  if (d.explicitPath) {
    const p = path.posix.join(dir, d.explicitPath.replace(/\\/g, '/'));
    return existsSync(abs(p)) ? p : undefined;
  }
  const base = path.posix.basename(file, '.rs');
  const parent = ['lib', 'main', 'mod'].includes(base) ? dir : `${dir}/${base}`;
  for (const c of [`${parent}/${d.name}.rs`, `${parent}/${d.name}/mod.rs`]) if (existsSync(abs(c))) return c;
  return undefined;
}

// crate::a::b::c paths, expanding one level of `crate::a::{b, c::d}` groups.
function cratePaths(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/\bcrate::((?:\w+::)*\w+)(::\{([^{}]*)\})?/g)) {
    if (m[3] === undefined) {
      out.push(m[1]);
      continue;
    }
    for (const item of m[3].split(',')) {
      const t = item.trim().replace(/\s+as\s+\w+$/, '');
      if (t && t !== 'self' && t !== '*') out.push(`${m[1]}::${t}`);
      else out.push(m[1]);
    }
  }
  return out;
}

type FnDef = { name: string; arity: number; stateParams: number };

// Free functions (no self receiver) with their parameter counts.
function fnDefs(src: string): FnDef[] {
  const code = stripStringsAndComments(src);
  const out: FnDef[] = [];
  for (const m of code.matchAll(/\bfn\s+(\w+)\s*(<(?:[^<>]|<[^<>]*>)*>)?\s*\(/g)) {
    const open = (m.index as number) + m[0].length - 1;
    const params = splitTopLevel(code.slice(open + 1, matchingParen(code, open)));
    if (params.some((p) => /^(&\s*('\w+\s+)?(mut\s+)?)?(mut\s+)?self\b/.test(p))) continue;
    out.push({ name: m[1], arity: params.length, stateParams: params.filter((p) => /\bState<\s*'_/.test(p)).length });
  }
  return out;
}

// Calls whose argument count disagrees with every definition of a uniquely named fn.
function fnCalls(code: string, defs: Map<string, number[]>): { name: string; arity: number; declared: number }[] {
  const out: { name: string; arity: number; declared: number }[] = [];
  for (const m of code.matchAll(/(^|[^\w.])((?:\w+::)*)(\w+)\s*\(/g)) {
    const name = m[3];
    if (/(^|::)[A-Z]\w*::$/.test(m[2])) continue;
    const arities = defs.get(name);
    if (!arities || arities.length !== 1) continue;
    const before = code.slice(Math.max(0, (m.index as number) - 4), (m.index as number) + m[1].length);
    if (/fn\s*$/.test(before)) continue;
    const open = (m.index as number) + m[0].length - 1;
    const close = matchingParen(code, open);
    if (close < 0) continue;
    const arity = splitTopLevel(code.slice(open + 1, close)).length;
    if (arity !== arities[0]) out.push({ name, arity, declared: arities[0] });
  }
  return out;
}

function callArgs(code: string, name: string): string[][] {
  const out: string[][] = [];
  for (const m of code.matchAll(new RegExp(`(^|[^\\w.])(?:\\w+::)*${name}\\s*\\(`, 'g'))) {
    const before = code.slice(Math.max(0, (m.index as number) - 4), (m.index as number) + m[1].length);
    if (/fn\s*$/.test(before)) continue;
    const open = (m.index as number) + m[0].length - 1;
    out.push(splitTopLevel(code.slice(open + 1, matchingParen(code, open))));
  }
  return out;
}

function matchingParen(code: string, open: number): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

// Split on commas outside (), [], {} and <> (so State<'_, T> stays one param).
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let angle = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === '<' && /[\w:>\s]$/.test(cur) && /^[\w'&(\[]/.test(s.slice(i + 1).trimStart())) angle++;
    else if (ch === '>' && angle > 0 && s[i - 1] !== '-' && s[i - 1] !== '=') angle--;
    if (ch === ',' && depth === 0 && angle === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function generateHandlerNames(lib: string): string[] {
  const m = lib.match(/generate_handler!\[([\s\S]*?)\]/);
  if (!m) throw new Error('generate_handler! not found');
  return stripComments(m[1])
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split('::').pop() as string);
}

function enumVariants(src: string, name: string): string[] {
  const code = stripComments(src);
  const start = code.search(new RegExp(`enum ${name}\\b`));
  if (start < 0) throw new Error(`enum ${name} not found`);
  const open = code.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  const body = code.slice(open + 1, end).replace(/#\[[^\]]*\]/g, '');
  return splitTopLevel(body).map((v) => v.replace(/[\s({=].*$/s, '').trim()).filter(Boolean);
}

function dependencyNames(toml: string): string[] {
  const names: string[] = [];
  let inDeps = false;
  for (const raw of toml.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    const header = line.match(/^\[([^\]]+)\]$/);
    if (header) {
      inDeps = /(^|\.)(dev-|build-)?dependencies$/.test(header[1]);
      const inline = header[1].match(/(?:^|\.)(?:dev-|build-)?dependencies\.([\w-]+)$/);
      if (inline) names.push(inline[1]);
      continue;
    }
    const m = inDeps && line.match(/^([\w-]+)(?:\.workspace)?\s*=/);
    if (m) names.push(m[1]);
  }
  return names;
}

function stringLiterals(src: string): string[] {
  return [...src.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map((m) => m[1]);
}

function count(s: string, re: RegExp): number {
  return (s.match(re) ?? []).length;
}

function balance(code: string): { brace: number; paren: number; bracket: number } {
  return {
    brace: count(code, /\{/g) - count(code, /\}/g),
    paren: count(code, /\(/g) - count(code, /\)/g),
    bracket: count(code, /\[/g) - count(code, /\]/g),
  };
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function stripStringsAndComments(src: string): string {
  return src
    .replace(/r(#+)"[\s\S]*?"\1/g, '""')
    .replace(/r"[^"]*"/g, '""')
    .replace(/b?"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)'/g, "' '")
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
