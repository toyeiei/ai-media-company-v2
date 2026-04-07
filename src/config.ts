// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const API_CONFIG = {
  MINIMAX_BASE_URL: 'https://api.minimax.io/v1',
  MINIMAX_MODEL: 'MiniMax-M2.7-highspeed',
  MINIMAX_TIMEOUT_MS: 60_000,
  MINIMAX_MAX_RETRIES: 3,
  MINIMAX_RETRY_DELAY_MS: 1000,
} as const;

export const DISCORD_CONFIG = {
  MAX_MESSAGE_LENGTH: 1900,
  CHUNK_DELAY_MS: 100,
  AUTO_ARCHIVE_DURATION: 1440,
} as const;

export const EXA_CONFIG = {
  NUM_RESULTS: 10,
  REQUEST_TIMEOUT_MS: 30_000,
  MAX_RETRIES: 3,
} as const;

// ---------------------------------------------------------------------------
// Prompt Templates
// ---------------------------------------------------------------------------

export const PROMPTS = {
  RESEARCH_WITH_EXA: `You are a research analyst. Based on the following web search results, create a detailed research summary for a blog post.

Search Results:
{summary}

Topic: {topic}

Write a comprehensive research summary with:
- Key findings and insights
- 4-6 main points to cover in the blog post
- Important statistics, facts, or quotes
- Any relevant context or background

Aim for 200-300 words. Be thorough but focused.`,

  RESEARCH_FALLBACK: `You are a research analyst. Research the following topic thoroughly and provide a detailed summary.

Topic: {topic}

Provide:
- Key facts and statistics
- Recent developments and trends
- Interesting angles and perspectives
- 4-6 main points to cover

Aim for 200-300 words. Be thorough and informative.`,

  DRAFT: `You are a professional content writer. Write a complete blog post based on the research below.

Topic: {topic}

Research:
{research}

Requirements:
- Write a full blog post (300-500 words)
- Include an engaging title
- Introduction paragraph (2-3 sentences)
- 3-4 body paragraphs with key points and supporting details
- Conclusion with call to action

Make it informative, engaging, and ready for publication.`,

  EDIT: `You are a senior editor. Review the blog draft below and provide exactly 5 key improvement suggestions.

Draft:
{draft}

Provide exactly 5 specific, actionable improvements. Focus on:
- Clarity and readability
- Engagement and tone
- Structure and flow
- Impact of key points
- Call to action effectiveness

Be direct and specific in your suggestions.`,

  FINAL: `You are a professional content editor. Polish this blog post into a final, publication-ready version.

Topic: {topic}

Original Draft:
{draft}

Editor Improvement Points:
{feedback}

Apply these rules while polishing:
1. Fix any grammar, spelling, or clarity issues
2. Improve flow and transitions between paragraphs
3. Ensure tone is consistent and engaging throughout
4. Strengthen weak sentences and paragraphs
5. Keep the core message and key points intact

Return only the polished blog post - no preamble or explanation.

Target: 300-450 words.`,

  FACEBOOK: `Convert this blog post into an engaging Facebook post.

Blog Post:
{blog}

Requirements:
- Conversational, friendly tone
- Include 1-2 emojis and a call to action
- 350 characters max
- Make it scannable and engaging for Facebook feed

Return ONLY the Facebook post text.`,

} as const;

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

export function sanitizeTopic(topic: string): string {
  return topic
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

export function countWords(text: string): number {
  return text.split(' ').filter(Boolean).length;
}

export function countCharacters(text: string): number {
  return text.length;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    retryDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {},
): Promise<T> {
  const { maxRetries = API_CONFIG.MINIMAX_MAX_RETRIES, retryDelayMs = API_CONFIG.MINIMAX_RETRY_DELAY_MS, shouldRetry } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries && (shouldRetry === undefined || shouldRetry(error))) {
        await sleep(retryDelayMs * Math.pow(2, attempt));
        continue;
      }
    }
  }

  throw lastError;
}
