// WS-C7: /wpvalerts — show scam alert feed
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions, Content } from "@elizaos/core";
import { safeSerialize } from "../utils/safeSerialize";
import { WpvService } from "../WpvService";

function getWpvService(runtime: IAgentRuntime): WpvService | null {
  return runtime.getService<WpvService>(WpvService.serviceType) ?? null;
}

export const WpvAlertsAction: Action = {
  name: "WPV_ALERTS",
  description: "Show the WPV scam alert feed: flagged projects with red flags.",
  similes: ["WPVALERTS", "SCAM_ALERTS", "WPV_SCAM_FEED"],
  examples: [
    [
      { name: "{{name1}}", content: { text: "Show scam alerts" } },
      { name: "{{name2}}", content: { text: "Fetching scam alert feed...", actions: ["WPV_ALERTS"] } },
    ],
  ],
  parameters: { type: "object", properties: {}, required: [] },

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = ((message.content as Content)?.text || "").toLowerCase();
    return /\b(wpv\s*alert|scam\s*alert|scam\s*feed|red\s*flag)/i.test(text);
  },

  async handler(
    runtime: IAgentRuntime, _message: Memory, _state: State | undefined,
    _options: HandlerOptions | undefined, callback: HandlerCallback | undefined,
  ): Promise<ActionResult> {
    const wpv = getWpvService(runtime);
    if (!wpv?.resourceHandlers) {
      const text = "WPV service not initialized. Scam alert feed unavailable.";
      if (callback) await callback({ text, action: "WPV_ALERTS" });
      return { success: false, text, data: safeSerialize({ error: "service_unavailable" }) };
    }

    const result = await wpv.resourceHandlers.getScamAlertFeed();
    const text = `WPV Scam Alerts (${result.date}): ${result.flagged.length} flagged projects.`;
    if (callback) await callback({ text, action: "WPV_ALERTS" });
    return { success: true, text, data: safeSerialize(result) };
  },
};
