import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@storyteller/ui-button";
import {
  CommandSuccessStatus,
  CustomEndpointDelete,
  CustomEndpointKind,
  CustomEndpointList,
  CustomEndpointListEntry,
  CustomEndpointSave,
  Modality,
  ModalityDefaults,
  ModalityDefaultsGet,
  ModalityDefaultsSet,
  ProviderClear,
  ProviderList,
  ProviderListEntry,
  ProviderSetApiKey,
  commandErrorMessage,
} from "@storyteller/tauri-api";

const MODALITIES: { id: Modality; label: string }[] = [
  { id: "llm", label: "LLM" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
];

export const MCP_SNIPPET = JSON.stringify(
  { mcpServers: { h0x: { command: "node", args: ["<install>/mcp/h0x-mcp/index.mjs"] } } },
  null,
  2,
);

const CARD = "rounded-2xl border border-ui-panel-border bg-base-fg/[0.03] p-3";
const INPUT = "w-full rounded-lg border border-ui-panel-border bg-transparent px-2 py-1";
const HEADING = "font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-base-fg/60";

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname;
  } catch {
    return false;
  }
};

const KeyStatus = ({ hasKey, hint }: { hasKey: boolean; hint: string | null }) => (
  <span className={hasKey ? "text-xs text-primary" : "text-xs text-base-fg/50"}>
    {hasKey ? `Connected •••• ${hint ?? ""}`.trim() : "Not set"}
  </span>
);

const ModalityChips = ({ modalities }: { modalities: Modality[] }) => (
  <div className="flex flex-wrap gap-1">
    {modalities.map((m) => (
      <span key={m} className="rounded-full bg-base-fg/10 px-2 py-0.5 text-[11px]">
        {MODALITIES.find((x) => x.id === m)?.label ?? m}
      </span>
    ))}
  </div>
);

interface EndpointForm {
  id?: string;
  name: string;
  base_url: string;
  kind: CustomEndpointKind;
  modalities: Modality[];
  api_key: string;
}

const EMPTY_FORM: EndpointForm = { name: "", base_url: "", kind: "openai_compatible", modalities: [], api_key: "" };

export const ProvidersPane = () => {
  const [providers, setProviders] = useState<ProviderListEntry[]>([]);
  const [endpoints, setEndpoints] = useState<CustomEndpointListEntry[]>([]);
  const [defaults, setDefaults] = useState<ModalityDefaults>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [form, setForm] = useState<EndpointForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reload = async () => {
    try {
      const [p, e, d] = await Promise.all([ProviderList(), CustomEndpointList(), ModalityDefaultsGet()]);
      setProviders(p.payload.providers.filter((x) => x.kind === "api_key"));
      setEndpoints(e.payload.endpoints);
      setDefaults(d.payload ?? {});
    } catch (err) {
      setError(commandErrorMessage(err, "Could not load providers"));
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const run = async (action: () => Promise<{ status: string } | undefined>, fallback: string) => {
    setError(null);
    try {
      const result = await action();
      if (result?.status !== CommandSuccessStatus.Success) throw result;
      await reload();
      return true;
    } catch (err) {
      setError(commandErrorMessage(err, fallback));
      return false;
    }
  };

  const saveKey = async (provider: string) => {
    const key = keyInput.trim();
    if (!key) return;
    if (await run(() => ProviderSetApiKey(provider, key), "Failed to save API key")) {
      setEditingKey(null);
      setKeyInput("");
    }
  };

  const saveEndpoint = async () => {
    if (!form) return;
    if (!form.name.trim()) return setError("Name is required");
    if (!isHttpUrl(form.base_url.trim())) return setError("Base URL must start with http:// or https://");
    const { api_key, ...rest } = form;
    const request = { ...rest, name: form.name.trim(), base_url: form.base_url.trim(), api_key: api_key.trim() || undefined };
    if (await run(() => CustomEndpointSave(request), "Failed to save custom endpoint")) setForm(null);
  };

  const saveDefault = async (modality: Modality, id: string) => {
    if (await run(() => ModalityDefaultsSet(modality, id || null), "Failed to save default")) {
      setDefaults((d) => ({ ...d, [modality]: id || undefined }));
    }
  };

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(MCP_SNIPPET);
      setCopied(true);
    } catch {
      setError("Could not copy to the clipboard");
    }
  };

  const toggleModality = (m: Modality) =>
    form &&
    setForm({
      ...form,
      modalities: form.modalities.includes(m) ? form.modalities.filter((x) => x !== m) : [...form.modalities, m],
    });

  return (
    <div className="flex flex-col gap-4 pe-3">
      {error && (
        <div role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h3 className={HEADING}>Providers</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {providers.map((p) => (
            <div key={p.id} data-testid={`provider-${p.id}`} className={`${CARD} flex flex-col gap-2`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{p.name}</span>
                <KeyStatus hasKey={p.has_key} hint={p.key_hint} />
              </div>
              <ModalityChips modalities={p.modalities} />
              {editingKey === p.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    autoComplete="off"
                    aria-label={`${p.name} API key`}
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    className={INPUT}
                  />
                  <Button onClick={() => saveKey(p.id)} disabled={!keyInput.trim()}>
                    Save
                  </Button>
                  <Button variant="secondary" onClick={() => setEditingKey(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setEditingKey(p.id);
                      setKeyInput("");
                    }}
                  >
                    {p.has_key ? "Replace" : "Set key"}
                  </Button>
                  {p.has_key && (
                    <Button variant="secondary" onClick={() => run(() => ProviderClear(p.id), "Failed to remove key")}>
                      Remove
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className={HEADING}>Custom endpoints</h3>
          {!form && (
            <Button onClick={() => setForm(EMPTY_FORM)}>
              <PlusIcon />
              Add endpoint
            </Button>
          )}
        </div>
        {endpoints.map((e) => (
          <div key={e.id} className={`${CARD} flex items-center justify-between gap-2`}>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-semibold">{e.name}</span>
              <span className="truncate text-xs text-base-fg/60">{e.base_url}</span>
              <ModalityChips modalities={e.modalities} />
            </div>
            <div className="flex items-center gap-2">
              <KeyStatus hasKey={e.has_key} hint={e.key_hint} />
              <Button
                variant="ghost"
                aria-label={`Edit ${e.name}`}
                onClick={() => setForm({ id: e.id, name: e.name, base_url: e.base_url, kind: e.kind, modalities: e.modalities, api_key: "" })}
              >
                <PencilSimpleIcon />
              </Button>
              <Button
                variant="ghost"
                aria-label={`Delete ${e.name}`}
                onClick={() => run(() => CustomEndpointDelete(e.id), "Failed to delete custom endpoint")}
              >
                <TrashIcon />
              </Button>
            </div>
          </div>
        ))}
        {form && (
          <form
            className={`${CARD} flex flex-col gap-2`}
            onSubmit={(e) => {
              e.preventDefault();
              saveEndpoint();
            }}
          >
            <label className="flex flex-col gap-1">
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT} />
            </label>
            <label className="flex flex-col gap-1">
              Base URL
              <input
                value={form.base_url}
                placeholder="https://api.example.com/v1"
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1">
              Type
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as CustomEndpointKind })}
                className={INPUT}
              >
                <option value="openai_compatible">OpenAI-compatible</option>
                <option value="other">Other</option>
              </select>
            </label>
            <div className="flex flex-wrap gap-3">
              {MODALITIES.map((m) => (
                <label key={m.id} className="flex items-center gap-1">
                  <input type="checkbox" checked={form.modalities.includes(m.id)} onChange={() => toggleModality(m.id)} />
                  {m.label}
                </label>
              ))}
            </div>
            <label className="flex flex-col gap-1">
              API key
              <input
                type="password"
                autoComplete="off"
                value={form.api_key}
                placeholder={form.id ? "Leave blank to keep the current key" : ""}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                className={INPUT}
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit">Save endpoint</Button>
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </section>

      <section className={`${CARD} flex flex-col gap-2`}>
        <h3 className={HEADING}>Defaults</h3>
        {MODALITIES.map((m) => (
          <label key={m.id} className="flex items-center justify-between gap-2">
            {m.label}
            <select
              value={defaults[m.id] ?? ""}
              onChange={(e) => saveDefault(m.id, e.target.value)}
              className={`${INPUT} max-w-[60%]`}
            >
              <option value="">None</option>
              {providers
                .filter((p) => p.has_key && p.modalities.includes(m.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              {endpoints
                .filter((e) => e.modalities.includes(m.id))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </section>

      <section className={`${CARD} flex flex-col gap-2`}>
        <div className="flex items-center justify-between">
          <h3 className={HEADING}>Connect your agent</h3>
          <Button onClick={copySnippet}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="text-xs text-base-fg/60">
          Add this to Claude Code or any MCP client, with &lt;install&gt; set to the H0x install folder.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-base-fg/[0.06] p-2 text-xs">{MCP_SNIPPET}</pre>
      </section>
    </div>
  );
};
