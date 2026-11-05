import { invoke } from "@tauri-apps/api/core";
import { CommandResult } from "../common/CommandStatus";

export const CustomEndpointDelete = async (id: string) : Promise<CommandResult> => {
  return await invoke("custom_endpoint_delete_command", { request: { id } }) as CommandResult;
}
