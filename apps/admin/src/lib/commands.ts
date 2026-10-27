import type { CommandType } from "@showroom/contracts";

export type CommandStatus = "queued" | "in_progress" | "succeeded" | "failed";

export const commandLabels: Record<CommandType, string> = {
  sync_now: "Sync content",
  restart_player: "Restart player",
  reboot_device: "Reboot",
  take_screenshot: "Refresh preview",
  blank_screen: "Turn display off",
  unblank_screen: "Turn display on",
  update_youtube_auth: "Update YouTube sign-in",
  update_release: "Install software update",
  update_network: "Change Wi-Fi",
};

export const commandStatusLabels: Record<CommandStatus, string> = {
  queued: "Waiting for screen",
  in_progress: "Running",
  succeeded: "Done",
  failed: "Failed",
};

export function commandLabel(commandType: string) {
  return commandLabels[commandType as CommandType] ?? commandType.replaceAll("_", " ");
}

export function isCommandPending(status: CommandStatus | undefined) {
  return !status || status === "queued" || status === "in_progress";
}
