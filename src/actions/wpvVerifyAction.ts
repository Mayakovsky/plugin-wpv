// WS-C7: /wpvverify <url> — trigger verification on a whitepaper
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions, Content } from "@elizaos/core";
import { safeSerialize } from "../utils/safeSerialize";
import { WpvService } from "../WpvService";

function getWpvService(runtime: IAgentRuntime): WpvService | null {
  return runtime.getService<WpvService>(WpvService.serviceType) ?? null;
}

export const WpvVerifyAction: Action = {
  name: "WPV_VERIFY",
  description: "Trigger full verification on a whitepaper URL.",
  similes: ["WPVVERIFY", "VERIFY_WHITEPAPER", "CHECK_WHITEPAPER"],
  examples: [
    [
      { name: "{{name1}}", content: { text: "Verify this whitepaper: https://example.com/wp.pdf" } },
      { name: "{{name2}}", content: { text: "Starting verification...", actions: ["WPV_VERIFY"] } },
    ],
  ],
  parameters: {
    type: "object",
    properties: {
      document_url: { type: "string", description: "URL of the whitepaper to verify" },
      project_name: { type: "string", description: "Name of the project" },
    },
    required: ["document_url"],
  },

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = ((message.content as Content)?.text || "").toLowerCase();
    return /\b(wpv\s*verify|verify.*whitepaper|check.*whitepaper)/i.test(text);
  },

  async handler(
    runtime: IAgentRuntime, message: Memory, _state: State | undefined,
    _options: HandlerOptions | undefined, callback: HandlerCallback | undefined,
  ): Promise<ActionResult> {
    const wpv = getWpvService(runtime);
    if (!wpv?.jobRouter) {
      const text = "WPV service not initialized. Verification unavailable.";
      if (callback) await callback({ text, action: "WPV_VERIFY" });
      return { success: false, text, data: safeSerialize({ error: "service_unavailable" }) };
    }

    const args = (message.content as Record<string, unknown>) || {};
    const url = args.document_url as string | undefined;
    const projectName = (args.project_name as string) || "Unknown";

    if (!url) {
      const text = "Please provide a whitepaper URL to verify.";
      if (callback) await callback({ text, action: "WPV_VERIFY" });
      return { success: false, text, data: safeSerialize({ error: "missing_url" }) };
    }

    const result = await wpv.jobRouter.handleJob('full_technical_verification', {
      document_url: url,
      project_name: projectName,
    });

    const text = `WPV verification complete for: ${url}`;
    if (callback) await callback({ text, action: "WPV_VERIFY" });
    return { success: true, text, data: safeSerialize(result) as Record<string, any> };
  },
};
