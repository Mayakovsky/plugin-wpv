// Thin fetch-based Anthropic client that implements the AnthropicClient interface.
// No SDK dependency — uses raw HTTP requests to the Anthropic API.

import type { AnthropicClient } from './ClaimExtractor';

export function createAnthropicClient(apiKey: string): AnthropicClient {
  return {
    messages: {
      async create(params) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: params.model,
            max_tokens: params.max_tokens,
            system: params.system,
            messages: params.messages,
            tools: params.tools,
          }),
          signal: AbortSignal.timeout(120000), // 2 min for LLM calls
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Anthropic API error ${response.status}: ${text.slice(0, 200)}`);
        }

        const data = await response.json() as {
          content: { type: string; input?: Record<string, unknown>; text?: string }[];
          usage: { input_tokens: number; output_tokens: number };
        };

        return data;
      },
    },
  };
}
