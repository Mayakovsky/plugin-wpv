// WS-C7: /wpvscan — trigger manual discovery run
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions, Content } from "@elizaos/core";
import { safeSerialize } from "../utils/safeSerialize";
import { WpvService } from "../WpvService";

function getWpvService(runtime: IAgentRuntime): WpvService | null {
  return runtime.getService<WpvService>(WpvService.serviceType) ?? null;
}

export const WpvScanAction: Action = {
  name: "WPV_SCAN",
  description: "Trigger a manual WPV discovery scan for new whitepapers on Virtuals/Base. Use this action when the user wants to scan, discover, or find new whitepapers.",
  similes: ["WPVSCAN", "SCAN_WHITEPAPERS", "DISCOVER_WHITEPAPERS", "RUN_DISCOVERY", "FIND_WHITEPAPERS"],
  examples: [
    [
      { name: "{{name1}}", content: { text: "wpvscan" } },
      { name: "{{name2}}", content: { text: "Starting discovery scan...", actions: ["WPV_SCAN"] } },
    ],
    [
      { name: "{{name1}}", content: { text: "Scan for new whitepapers" } },
      { name: "{{name2}}", content: { text: "Running WPV discovery scan now.", actions: ["WPV_SCAN"] } },
    ],
    [
      { name: "{{name1}}", content: { text: "Run the daily scan" } },
      { name: "{{name2}}", content: { text: "Triggering discovery pipeline.", actions: ["WPV_SCAN"] } },
    ],
    [
      { name: "{{name1}}", content: { text: "Find new whitepapers on Base" } },
      { name: "{{name2}}", content: { text: "Scanning Base chain for new tokens with whitepapers.", actions: ["WPV_SCAN"] } },
    ],
  ],
  parameters: { type: "object", properties: {}, required: [] },

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = ((message.content as Content)?.text || "").toLowerCase();
    return /\b(wpv\s*scan|scan.*whitepaper|discover.*whitepaper|find.*whitepaper|run.*scan|run.*discovery|daily\s*scan)/i.test(text);
  },

  async handler(
    runtime: IAgentRuntime, _message: Memory, _state: State | undefined,
    _options: HandlerOptions | undefined, callback: HandlerCallback | undefined,
  ): Promise<ActionResult> {
    const wpv = getWpvService(runtime);
    if (!wpv?.discoveryCron) {
      const text = "WPV service not initialized. Discovery scan unavailable.";
      if (callback) await callback({ text, action: "WPV_SCAN" });
      return { success: false, text, data: safeSerialize({ error: "service_unavailable" }) };
    }

    const result = await wpv.discoveryCron.runDaily();
    const text = `WPV discovery scan complete: ${result.whitepapersIngested} whitepapers ingested from ${result.tokensScanned} tokens scanned. ${result.errors.length} errors.`;
    if (callback) await callback({ text, action: "WPV_SCAN" });
    return { success: true, text, data: safeSerialize(result) };
  },
};
