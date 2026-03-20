// WS-C7: /wpvcost — show LLM compute cost for WPV operations
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions, Content } from "@elizaos/core";
import { safeSerialize } from "../utils/safeSerialize";
import { WpvService } from "../WpvService";

function getWpvService(runtime: IAgentRuntime): WpvService | null {
  return runtime.getService<WpvService>(WpvService.serviceType) ?? null;
}

export const WpvCostAction: Action = {
  name: "WPV_COST",
  description: "Show current WPV LLM token usage and compute cost (COC/V). Use this action when the user asks about costs, token usage, or spending.",
  similes: ["WPVCOST", "WPV_COMPUTE_COST", "VERIFICATION_COST", "TOKEN_USAGE", "COMPUTE_COST", "SHOW_COST"],
  examples: [
    [
      { name: "{{name1}}", content: { text: "wpv cost" } },
      { name: "{{name2}}", content: { text: "Pulling cost data.", actions: ["WPV_COST"] } },
    ],
    [
      { name: "{{name1}}", content: { text: "How much has verification cost?" } },
      { name: "{{name2}}", content: { text: "Checking compute costs.", actions: ["WPV_COST"] } },
    ],
    [
      { name: "{{name1}}", content: { text: "Show me the token usage" } },
      { name: "{{name2}}", content: { text: "Fetching LLM token usage and cost.", actions: ["WPV_COST"] } },
    ],
    [
      { name: "{{name1}}", content: { text: "What's the compute cost so far?" } },
      { name: "{{name2}}", content: { text: "Checking COC/V metrics.", actions: ["WPV_COST"] } },
    ],
  ],
  parameters: { type: "object", properties: {}, required: [] },

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = ((message.content as Content)?.text || "").toLowerCase();
    return /\b(wpv\s*cost|compute\s*cost|verification\s*cost|token\s*usage|how\s*much.*cost|cost.*verif|spending|llm\s*cost)/i.test(text);
  },

  async handler(
    runtime: IAgentRuntime, _message: Memory, _state: State | undefined,
    _options: HandlerOptions | undefined, callback: HandlerCallback | undefined,
  ): Promise<ActionResult> {
    const wpv = getWpvService(runtime);
    if (!wpv?.costTracker || !wpv?.verificationsRepo) {
      const text = "WPV service not initialized. Cost tracking unavailable.";
      if (callback) await callback({ text, action: "WPV_COST" });
      return { success: false, text, data: safeSerialize({ error: "service_unavailable" }) };
    }

    // Session-level metrics (current process)
    const sessionTokens = wpv.costTracker.getTotalTokens();
    const sessionCost = wpv.costTracker.getTotalCostUsd();
    const stageMetrics = wpv.costTracker.getStageMetrics();

    // Monthly aggregate from database
    let monthly;
    try {
      monthly = await wpv.verificationsRepo.getMonthlyCostSummary();
    } catch {
      monthly = null;
    }

    const parts: string[] = [];

    // Session costs
    parts.push(`**Session:** $${sessionCost.toFixed(4)} (${sessionTokens.input} input + ${sessionTokens.output} output tokens)`);

    if (stageMetrics.l2.inputTokens > 0 || stageMetrics.l3.inputTokens > 0) {
      parts.push(`  L2 claim extraction: $${stageMetrics.l2.costUsd.toFixed(4)} (${stageMetrics.l2.durationMs}ms)`);
      parts.push(`  L3 claim evaluation: $${stageMetrics.l3.costUsd.toFixed(4)} (${stageMetrics.l3.durationMs}ms)`);
    }

    // Monthly aggregate
    if (monthly && monthly.totalVerifications > 0) {
      parts.push('');
      parts.push(`**This month:** ${monthly.totalVerifications} verifications, $${monthly.totalCostUsd.toFixed(2)} total`);
      parts.push(`  Live runs: ${monthly.liveRuns} | Cache hits: ${monthly.cacheHits} (${(monthly.cacheHitRate * 100).toFixed(0)}%)`);
      parts.push(`  L2 cost: $${monthly.l2CostUsd.toFixed(2)} | L3 cost: $${monthly.l3CostUsd.toFixed(2)}`);
      parts.push(`  Avg COC/V: $${monthly.avgCostPerVerification.toFixed(4)}`);

      if (monthly.totalVerifications >= 300) {
        parts.push('');
        parts.push('⚠ Volume approaching local LLM evaluation threshold (300/month). See LOCAL_LLM_EVALUATION.md.');
      }
    }

    const text = parts.join('\n');
    if (callback) await callback({ text, action: "WPV_COST" });
    return {
      success: true,
      text,
      data: safeSerialize({
        session: { ...sessionTokens, cost: sessionCost, stages: stageMetrics },
        monthly: monthly ?? null,
      }),
    };
  },
};
