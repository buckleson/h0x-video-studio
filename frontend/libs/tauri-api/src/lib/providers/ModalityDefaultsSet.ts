import { invoke } from "@tauri-apps/api/core";
import { CommandResult } from "../common/CommandStatus";
import { Modality } from "./ProviderList";

// A null id clears the default for that modality.
export const ModalityDefaultsSet = async (modality: Modality, providerOrEndpointId: string | null) : Promise<CommandResult> => {
  return await invoke("modality_defaults_set_command", {
    request: { modality, provider_or_endpoint_id: providerOrEndpointId },
  }) as CommandResult;
}
