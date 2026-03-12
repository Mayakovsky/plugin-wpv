// WS-C7: /wpvcost — show LLM compute cost for WPV operations
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions, Content } from "@elizaos/core";
import { safeSerialize } from "../utils/safeSerialize";
import { WpvService } from "../WpvService";

function getWpvService(runtime: IAgentRuntime): WpvService | null {
  return runtime.getService<WpvService>(WpvService.serviceType) ?? null;
}

export const WpvCostAction: Action = {
  name: "WPV_COST",
  description: "Show current WPV LLM token usage and compute cost.",
  similes: ["WPVCOST", "WPV_COMPUTE_COST", "VERIFICATION_COST"],
  examples: [
    [
      { name: "{{name1}}", content: { text: "How much has WPV verification cost?" } },
      { name: "{{name2}}", content: { text: "Fetching WPV cost data...", actions: ["WPV_COST"] } },
    ],
  ],
  parameters: { type: "object", properties: {}, required: [] },

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = ((message.content as Content)?.text || "").toLowerCase();
    return /\b(wpv\s*cost|compute\s*cost|verification\s*cost|token\s*usage)/i.test(text);
  },

  async handler(
    runtime: IAgentRuntime, _message: Memory, _state: State | undefined,
    _options: HandlerOptions | undefined, callback: HandlerCallback | undefined,
  ): Promise<ActionResult> {
    const wpv = getWpvService(runtime);
    if (!wpv?.costTracker) {
      const text = "WPV service not initialized. Cost tracking unavailable.";
      if (callback) await callback({ text, action: "WPV_COST" });
      return { success: false, text, data: safeSerialize({ error: "service_unavailable" }) };
    }

    const tokens = wpv.costTracker.getTotalTokens();
    const totalCost = wpv.costTracker.getTotalCostUsd();

    const costData = {
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      totalCostUsd: totalCost,
    };

    const text = `WPV compute cost: $${totalCost.toFixed(4)} (${tokens.input} input + ${tokens.output} output tokens)`;
    if (callback) await callback({ text, action: "WPV_COST" });
    return { success: true, text, data: safeSerialize(costData) };
  },
};
