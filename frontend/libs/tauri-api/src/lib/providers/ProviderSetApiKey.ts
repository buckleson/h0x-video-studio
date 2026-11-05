import { invoke } from "@tauri-apps/api/core";
import { CommandResult } from "../common/CommandStatus";

// `provider` is a provider id from ProviderList (e.g. "byteplus").
export const ProviderSetApiKey = async (provider: string, apiKey: string) : Promise<CommandResult> => {
  const result = await invoke("provider_set_api_key_command", {
    request: {
      provider,
      api_key: apiKey,
    }
  });
  return (result as CommandResult);
}
