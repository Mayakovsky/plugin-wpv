// WS-C7: /wpvstatus — show verification pipeline status
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions, Content } from "@elizaos/core";
import { safeSerialize } from "../utils/safeSerialize";
import { WpvService } from "../WpvService";

function getWpvService(runtime: IAgentRuntime): WpvService | null {
  return runtime.getService<WpvService>(WpvService.serviceType) ?? null;
}

export const WpvStatusAction: Action = {
  name: "WPV_STATUS",
  description: "Show current WPV pipeline status: whitepaper counts by status and recent verifications.",
  similes: ["WPVSTATUS", "WPV_PIPELINE_STATUS", "WHITEPAPER_STATUS"],
  examples: [
    [
      { name: "{{name1}}", content: { text: "What's the WPV pipeline status?" } },
      { name: "{{name2}}", content: { text: "Fetching WPV status...", actions: ["WPV_STATUS"] } },
    ],
  ],
  parameters: { type: "object", properties: {}, required: [] },

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = ((message.content as Content)?.text || "").toLowerCase();
    return /\b(wpv\s*status|pipeline\s*status|verification\s*status)/i.test(text);
  },

  async handler(
    runtime: IAgentRuntime, _message: Memory, _state: State | undefined,
    _options: HandlerOptions | undefined, callback: HandlerCallback | undefined,
  ): Promise<ActionResult> {
    const wpv = getWpvService(runtime);
    if (!wpv?.whitepaperRepo || !wpv?.verificationsRepo) {
      const text = "WPV service not initialized. Status unavailable.";
      if (callback) await callback({ text, action: "WPV_STATUS" });
      return { success: false, text, data: safeSerialize({ error: "service_unavailable" }) };
    }

    const ingested = await wpv.whitepaperRepo.listByStatus('INGESTED');
    const verified = await wpv.whitepaperRepo.listByStatus('VERIFIED');
    const failed = await wpv.whitepaperRepo.listByStatus('FAILED');

    const status = {
      ingested: ingested.length,
      verified: verified.length,
      failed: failed.length,
      total: ingested.length + verified.length + failed.length,
    };

    const text = `WPV Pipeline: ${status.total} whitepapers total — ${status.verified} verified, ${status.ingested} ingested, ${status.failed} failed.`;
    if (callback) await callback({ text, action: "WPV_STATUS" });
    return { success: true, text, data: safeSerialize(status) };
  },
};
