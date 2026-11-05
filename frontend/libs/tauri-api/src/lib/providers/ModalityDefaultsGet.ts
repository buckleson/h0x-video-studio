import { invoke } from "@tauri-apps/api/core";
import { CommandResult } from "../common/CommandStatus";
import { Modality } from "./ProviderList";

// Provider id or custom endpoint id per modality; unset modalities are absent.
export type ModalityDefaults = Partial<Record<Modality, string>>;

export interface ModalityDefaultsGetSuccess extends CommandResult {
  payload?: ModalityDefaults;
}

export const ModalityDefaultsGet = async () : Promise<ModalityDefaultsGetSuccess> => {
  return await invoke("modality_defaults_get_command") as ModalityDefaultsGetSuccess;
}
