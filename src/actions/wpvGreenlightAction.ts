// WS-C7: /wpvgreenlight — show verified projects that passed
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions, Content } from "@elizaos/core";
import { safeSerialize } from "../utils/safeSerialize";
import { WpvService } from "../WpvService";

function getWpvService(runtime: IAgentRuntime): WpvService | null {
  return runtime.getService<WpvService>(WpvService.serviceType) ?? null;
}

export const WpvGreenlightAction: Action = {
  name: "WPV_GREENLIGHT",
  description: "Show the WPV greenlight list: projects that passed verification today.",
  similes: ["WPVGREENLIGHT", "GREENLIGHT_LIST", "VERIFIED_PROJECTS"],
  examples: [
    [
      { name: "{{name1}}", content: { text: "Show me the greenlight list" } },
      { name: "{{name2}}", content: { text: "Fetching greenlight list...", actions: ["WPV_GREENLIGHT"] } },
    ],
  ],
  parameters: { type: "object", properties: {}, required: [] },

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = ((message.content as Content)?.text || "").toLowerCase();
    return /\b(greenlight|green\s*light|verified\s*projects|pass\s*list)/i.test(text);
  },

  async handler(
    runtime: IAgentRuntime, _message: Memory, _state: State | undefined,
    _options: HandlerOptions | undefined, callback: HandlerCallback | undefined,
  ): Promise<ActionResult> {
    const wpv = getWpvService(runtime);
    if (!wpv?.resourceHandlers) {
      const text = "WPV service not initialized. Greenlight list unavailable.";
      if (callback) await callback({ text, action: "WPV_GREENLIGHT" });
      return { success: false, text, data: safeSerialize({ error: "service_unavailable" }) };
    }

    const result = await wpv.resourceHandlers.getGreenlightList();
    const text = `WPV Greenlight List (${result.date}): ${result.totalVerified} verified projects.`;
    if (callback) await callback({ text, action: "WPV_GREENLIGHT" });
    return { success: true, text, data: safeSerialize(result) };
  },
};
