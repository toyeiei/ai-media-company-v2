export interface MiniMaxMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface MiniMaxChatRequest {
  model: string;
  messages: MiniMaxMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface MiniMaxChatResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class MiniMaxClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.minimax.chat/v1';
    this.model = 'MiniMax-Text-01';
  }

  async chat(
    messages: MiniMaxMessage[],
    options: { temperature?: number; maxTokens?: number } = {},
  ): Promise<string> {
    const { temperature = 0.7, maxTokens = 4096 } = options;

    const request: MiniMaxChatRequest = {
      model: this.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    const response = await fetch(`${this.baseUrl}/text/chatcompletion_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MiniMax API error: ${response.status} - ${errorText}`);
    }

    const data: MiniMaxChatResponse = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error('No response from MiniMax');
    }

    return data.choices[0].message.content;
  }

  async chatWithRetry(
    messages: MiniMaxMessage[],
    options: { temperature?: number; maxTokens?: number; retries?: number } = {},
  ): Promise<string> {
    const { retries = 3 } = options;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await this.chat(messages, options);
      } catch (error) {
        lastError = error as Error;
        if (attempt < retries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('MiniMax chat failed after retries');
  }
}

export function createSystemPrompt(context?: string): string {
  let prompt = 'You are a professional content writer for a media team. ';
  if (context) {
    prompt += `\n\nContext: ${context}`;
  }
  return prompt;
}
