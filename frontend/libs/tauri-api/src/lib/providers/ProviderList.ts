import { invoke } from "@tauri-apps/api/core";
import { CommandResult } from "../common/CommandStatus";

export type Modality = "llm" | "image" | "video" | "audio";

export interface ProviderListEntry {
  id: string;
  name: string;
  kind: "api_key" | "web_login";
  modalities: Modality[];
  has_key: boolean;
  key_hint: string | null;
}

export interface ProviderListSuccess extends CommandResult {
  payload: { providers: ProviderListEntry[] };
}

export const ProviderList = async () : Promise<ProviderListSuccess> => {
  return await invoke("provider_list_command") as ProviderListSuccess;
}
