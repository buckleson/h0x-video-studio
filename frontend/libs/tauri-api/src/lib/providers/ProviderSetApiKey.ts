import { invoke } from "@tauri-apps/api/core";
import { CommandResult } from "../common/CommandStatus";

export const ProviderSetApiKey = async (apiKey: string) : Promise<CommandResult> => {
  const result = await invoke("provider_set_api_key_command", {
    request: {
      provider_credential: "byte_plus_api_key",
      api_key: apiKey,
    }
  });
  return (result as CommandResult);
}
