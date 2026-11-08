import { invoke } from "@tauri-apps/api/core";
import { CommandResult } from "../common/CommandStatus";
import { Modality } from "./ProviderList";

export type CustomEndpointKind = "openai_compatible" | "other";

export interface CustomEndpointListEntry {
  id: string;
  name: string;
  base_url: string;
  kind: CustomEndpointKind;
  modalities: Modality[];
  has_key: boolean;
  key_hint: string | null;
}

export interface CustomEndpointListSuccess extends CommandResult {
  payload: { endpoints: CustomEndpointListEntry[] };
}

export const CustomEndpointList = async () : Promise<CustomEndpointListSuccess> => {
  return await invoke("custom_endpoint_list_command") as CustomEndpointListSuccess;
}
