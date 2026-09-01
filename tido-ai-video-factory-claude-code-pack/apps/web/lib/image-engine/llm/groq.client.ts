import { defaultLLMProviderService, LLMProviderService } from "./llm-provider.service";

/**
 * Legacy GroqClient wrapper now delegating to environment-driven LLMProviderService.
 */
export class GroqClient {
  private llmProvider: LLMProviderService;

  constructor(provider?: LLMProviderService) {
    this.llmProvider = provider || defaultLLMProviderService;
  }

  public isConfigured(): boolean {
    return this.llmProvider.isConfigured();
  }

  public async generateChatCompletion(
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    return this.llmProvider.generateChatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
  }
}

export const defaultGroqClient = new GroqClient();
