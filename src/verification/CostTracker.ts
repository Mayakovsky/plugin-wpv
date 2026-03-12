// ════════════════════════════════════════════
// WS-B5: CostTracker
// Tracks LLM token usage and compute cost (COC/V).
// Build early — ClaimExtractor and ClaimEvaluator depend on this.
// ════════════════════════════════════════════

export class CostTracker {
  private inputTokens = 0;
  private outputTokens = 0;

  constructor(
    private pricePerInputToken: number,
    private pricePerOutputToken: number,
  ) {}

  recordUsage(input: number, output: number): void {
    this.inputTokens += input;
    this.outputTokens += output;
  }

  getTotalTokens(): { input: number; output: number } {
    return { input: this.inputTokens, output: this.outputTokens };
  }

  getTotalCostUsd(): number {
    return (
      this.inputTokens * this.pricePerInputToken +
      this.outputTokens * this.pricePerOutputToken
    );
  }

  reset(): void {
    this.inputTokens = 0;
    this.outputTokens = 0;
  }
}
