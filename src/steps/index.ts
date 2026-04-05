import { MiniMaxClient } from '../minimax';
import { searchWeb, summarizeSearchResults } from '../exa';
import type { WorkflowState, WorkflowStep } from '../env';

export interface StepResult {
  success: boolean;
  data?: string;
  error?: string;
  nextStep: WorkflowStep;
}

export interface StepContext {
  state: WorkflowState;
  miniMax: MiniMaxClient;
  cache?: KVNamespace | null;
  exaApiKey?: string;
}

export async function runStep(step: WorkflowStep, ctx: StepContext): Promise<StepResult> {
  switch (step) {
    case 'RESEARCH':
      return runResearchStep(ctx);
    case 'DRAFT':
      return runDraftStep(ctx);
    case 'EDIT':
      return runEditStep(ctx);
    case 'FINAL':
      return runFinalStep(ctx);
    case 'SOCIAL':
      return runSocialStep(ctx);
    default:
      return { success: false, error: `Unknown step: ${step}`, nextStep: ctx.state.currentStep };
  }
}

async function runResearchStep(ctx: StepContext): Promise<StepResult> {
  const { state, miniMax, cache, exaApiKey } = ctx;
  const topic = state.topic;

  try {
    let researchData = '';

    // Step 1: Use Exa to search the web for relevant information
    if (exaApiKey) {
      const searchResults = await searchWeb(`${topic} latest news, trends, insights, statistics`, exaApiKey);
      const searchSummary = await summarizeSearchResults(searchResults);

      // Step 2: Use MiniMax to synthesize and analyze the research
      const messages = [
        {
          role: 'user' as const,
          content: `You are a research analyst. Based on the following web search results, provide a comprehensive research summary for a blog post.\n\nSearch Results:\n${searchSummary}\n\nTopic: ${topic}\n\nCreate a structured research summary with:\n- Key findings and statistics\n- Recent developments and trends\n- Interesting angles and perspectives\n- Potential points to cover in the blog\n\nFormat with clear sections.`,
        },
      ];
      researchData = await miniMax.chatWithRetry(messages, { maxTokens: 2048 });
    } else {
      // Fallback: Use MiniMax only if no Exa key
      const messages = [
        {
          role: 'user' as const,
          content: `Research the following topic thoroughly. Find key facts, statistics, recent developments, and interesting angles. Format your response with clear sections.\n\nTopic: ${topic}`,
        },
      ];
      researchData = await miniMax.chatWithRetry(messages, { maxTokens: 2048 });
    }

    if (cache) {
      const cacheKey = `research:${topic.toLowerCase().replace(/\s+/g, '-')}`;
      await cache.put(cacheKey, researchData, { expirationTtl: 86400 });
    }

    return { success: true, data: researchData, nextStep: 'DRAFT' };
  } catch (error) {
    return { success: false, error: `Research failed: ${error}`, nextStep: 'RESEARCH' };
  }
}

async function runDraftStep(ctx: StepContext): Promise<StepResult> {
  const { state, miniMax } = ctx;
  const topic = state.topic;
  const research = state.data.research || '';

  try {
    const messages = [
      {
        role: 'user' as const,
        content: `You are a professional content writer. Write a blog post draft based on the following research.\n\nTopic: ${topic}\n\nResearch:\n${research}\n\nWrite a compelling, well-structured blog post draft with an engaging title, introduction, main body with 3-5 key points, and a conclusion.`,
      },
    ];

    const draft = await miniMax.chatWithRetry(messages, { maxTokens: 2048 });

    return { success: true, data: draft, nextStep: 'EDIT' };
  } catch (error) {
    return { success: false, error: `Draft failed: ${error}`, nextStep: 'DRAFT' };
  }
}

async function runEditStep(ctx: StepContext): Promise<StepResult> {
  const { state, miniMax } = ctx;
  const draft = state.data.draft || '';

  try {
    const messages = [
      {
        role: 'user' as const,
        content: `You are a senior editor reviewing a blog post draft. Review and critique the following draft. Provide specific, actionable suggestions for improvement.\n\nFocus on:\n- Clarity and readability\n- Engagement and flow\n- Factual accuracy\n- SEO optimization opportunities\n- Missing angles or perspectives\n\nDraft:\n${draft}\n\nProvide your critique and suggested improvements.`,
      },
    ];

    const edited = await miniMax.chatWithRetry(messages, { maxTokens: 2048 });

    return { success: true, data: edited, nextStep: 'FINAL' };
  } catch (error) {
    return { success: false, error: `Edit failed: ${error}`, nextStep: 'EDIT' };
  }
}

async function runFinalStep(ctx: StepContext): Promise<StepResult> {
  const { state, miniMax } = ctx;
  const topic = state.topic;
  const edited = state.data.edited || state.data.draft || '';

  try {
    const messages = [
      {
        role: 'user' as const,
        content: `You are a professional content editor. Polish the following blog post into a final, publication-ready version.\n\nTopic: ${topic}\n\nEdited draft:\n${edited}\n\nCreate a clean, final version with:\n- Engaging title\n- Compelling introduction\n- Well-organized body\n- Strong conclusion\n- Proper formatting (use markdown)\n\nReturn only the final polished blog post.`,
      },
    ];

    const finalBlog = await miniMax.chatWithRetry(messages, { maxTokens: 2048 });

    return { success: true, data: finalBlog, nextStep: 'SOCIAL' };
  } catch (error) {
    return { success: false, error: `Final step failed: ${error}`, nextStep: 'FINAL' };
  }
}

async function runSocialStep(ctx: StepContext): Promise<StepResult> {
  const { state, miniMax } = ctx;
  const topic = state.topic;
  const finalBlog = state.data.finalBlog || '';

  try {
    const messages = [
      {
        role: 'user' as const,
        content: `You are a social media strategist. Create social media posts for 3 platforms based on the following blog post.\n\nBlog post:\n${finalBlog}\n\nCreate posts for:\n1. Facebook - engaging, community-focused, up to 500 characters with relevant hashtags\n2. X/Twitter - punchy, conversational, up to 280 characters with relevant hashtags\n3. LinkedIn - professional, thought-leadership focused, up to 1300 characters with relevant hashtags\n\nFormat as:\n**Facebook:**\n[post]\n\n**X/Twitter:**\n[post]\n\n**LinkedIn:**\n[post]`,
      },
    ];

    const socialContent = await miniMax.chatWithRetry(messages, { maxTokens: 2048 });

    const posts = parseSocialPosts(socialContent);

    return { success: true, data: JSON.stringify(posts), nextStep: 'AWAITING_APPROVAL' };
  } catch (error) {
    return { success: false, error: `Social posts failed: ${error}`, nextStep: 'SOCIAL' };
  }
}

function parseSocialPosts(content: string): { facebook: string; twitter: string; linkedin: string } {
  const result = { facebook: '', twitter: '', linkedin: '' };

  const fbMatch = content.match(/\*\*Facebook:\*\*\s*\n([\s\S]*?)(?=\n\*\*|$)/i);
  const twitterMatch = content.match(/\*\*X\/Twitter:\*\*\s*\n([\s\S]*?)(?=\n\*\*|$)/i);
  const linkedinMatch = content.match(/\*\*LinkedIn:\*\*\s*\n([\s\S]*?)(?=\n\*\*|$)/i);

  if (fbMatch) {
    result.facebook = fbMatch[1].trim();
  }
  if (twitterMatch) {
    result.twitter = twitterMatch[1].trim();
  }
  if (linkedinMatch) {
    result.linkedin = linkedinMatch[1].trim();
  }

  return result;
}
