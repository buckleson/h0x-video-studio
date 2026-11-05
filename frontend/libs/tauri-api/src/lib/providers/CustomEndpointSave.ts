import { invoke } from "@tauri-apps/api/core";
import { CommandResult } from "../common/CommandStatus";
import { CustomEndpointKind } from "./CustomEndpointList";
import { Modality } from "./ProviderList";

// No `id` creates an endpoint; a missing or blank `api_key` keeps the stored key.
export interface CustomEndpointSaveRequest {
  id?: string;
  name: string;
  base_url: string;
  api_key?: string;
  kind: CustomEndpointKind;
  modalities: Modality[];
}

export interface CustomEndpointSaveSuccess extends CommandResult {
  payload: { id: string };
}

export const CustomEndpointSave = async (request: CustomEndpointSaveRequest) : Promise<CustomEndpointSaveSuccess> => {
  return await invoke("custom_endpoint_save_command", { request }) as CustomEndpointSaveSuccess;
}
