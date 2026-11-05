import { invoke } from "@tauri-apps/api/core";
import { CommandResult } from "../common/CommandStatus";

export const ProviderClear = async (provider: string) : Promise<CommandResult> => {
  return await invoke("provider_clear_command", { request: { provider } }) as CommandResult;
}
