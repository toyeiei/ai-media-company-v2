import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { MiniMaxClient } from './minimax';
import { GitHubClient, generateBlogMarkdown } from './github';
import { searchWeb, summarizeSearchResults } from './exa';
import { postToChannel, sendApprovalMessage } from './discord';
import type { Env, WorkflowChannels } from './env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowParams {
  topic: string;
  userId: string;
  channels: WorkflowChannels;
}

export interface ApprovalPayload {
  approved: boolean;
}

export function parseSocialPosts(
  content: string,
): { facebook: string; twitter: string; linkedin: string } {
  const r = { facebook: '', twitter: '', linkedin: '' };
  const fb = content.match(/\*\*Facebook:\*\*\s*\n([\s\S]*?)(?=\n\*\*|$)/i);
  const tw = content.match(/\*\*X\/Twitter:\*\*\s*\n([\s\S]*?)(?=\n\*\*|$)/i);
  const li = content.match(/\*\*LinkedIn:\*\*\s*\n([\s\S]*?)(?=\n\*\*|$)/i);
  if (fb) r.facebook = fb[1].trim();
  if (tw) r.twitter = tw[1].trim();
  if (li) r.linkedin = li[1].trim();
  return r;
}

// ---------------------------------------------------------------------------
// Prompt Templates
// ---------------------------------------------------------------------------

const RESEARCH_PROMPT = `Research the following topic thoroughly. Find key facts, statistics, recent developments, and interesting angles. Format your response with clear sections.

Topic: {topic}

**CRITICAL: Keep the summary under 1600 characters. Be concise and focused.**`;

const RESEARCH_WITH_EXA_PROMPT = `You are a research analyst. Based on the following web search results, create a concise research summary for a blog post.

Search Results:
{summary}

Topic: {topic}

**CRITICAL: Keep the summary under 1600 characters. Be concise and focused.**

Provide:
- Key findings (bullet list)
- Top 3-5 points to cover in the blog
- Any important statistics or facts

Use bullet points and keep it brief.`;

const DRAFT_PROMPT = `You are a professional content writer. Write a blog post draft based on the following research.

Topic: {topic}
Research:
{research}

**CRITICAL: Keep the draft under 1600 characters. Be concise and focused.**

Write a compelling, well-structured blog post draft with an engaging title, introduction, main body with 3-5 key points, and a conclusion.`;

const EDIT_PROMPT = `You are a senior editor reviewing a blog post draft. Review and critique the following draft. Provide specific, actionable suggestions for improvement.

**CRITICAL: Keep the critique under 1600 characters. Be concise and focused.**

Focus on:
- Clarity and readability
- Engagement and flow
- Factual accuracy
- SEO optimization opportunities
- Missing angles or perspectives

Draft:
{draft}

Provide your critique and suggested improvements.`;

const FINAL_PROMPT = `You are a professional content editor. Polish the following blog post into a final, publication-ready version.

Topic: {topic}
Edited draft:
{edited}

**CRITICAL: Keep the blog post under 1600 characters. Be concise and focused.**

Return only the final polished blog post.`;

const SOCIAL_PROMPT = `You are a social media strategist. Create social media posts for 3 platforms based on the following blog post.

Blog post:
{blog}

**CRITICAL: Keep each post under 1600 characters total. Be concise.**

Create posts for:
1. Facebook - engaging, community-focused, up to 500 characters with relevant hashtags
2. X/Twitter - punchy, conversational, up to 280 characters with relevant hashtags
3. LinkedIn - professional, thought-leadership focused, up to 1300 characters with relevant hashtags

Format as:
**Facebook:**
[post]

**X/Twitter:**
[post]

**LinkedIn:**
[post]`;

const REVISE_EDIT_PROMPT = `You are a senior editor. The following blog post was sent back for revisions. Please revise it, addressing any issues with clarity, accuracy, engagement, and completeness.

Topic: {topic}
Current version:
{current}

Provide an improved version.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(): string {
  return new Date().toISOString().split('T')[0];
}

async function publish(topic: string, finalBlog: string, socialPosts: string, env: Env): Promise<string> {
  const github = new GitHubClient(env.GITHUB_TOKEN, env.GITHUB_REPO);
  const slug = github.generateSlug(topic);
  const path = `_posts/${formatDate()}-${slug}.md`;
  const posts = typeof socialPosts === 'string' ? JSON.parse(socialPosts) : socialPosts;
  const markdown = generateBlogMarkdown(topic, finalBlog, posts);
  const ok = await github.createFile(path, markdown, `Publish: ${topic}`);
  if (!ok) throw new Error('GitHub publish failed');
  return path;
}

async function runRevision(
  topic: string,
  currentBlog: string,
  channels: WorkflowChannels,
  botToken: string,
  miniMax: MiniMaxClient,
): Promise<{ edited: string; finalBlog: string; socialPosts: string }> {
  // Post progress OUTSIDE step.do() - NO RETRIES, runs once
  await postToChannel(channels.edit, `🔍 **Edit Phase (Revised)** - Revising...`, botToken);
  const edited = await miniMax.chat([{ role: 'user', content: REVISE_EDIT_PROMPT.replace('{topic}', topic).replace('{current}', currentBlog) }], { maxTokens: 1600 });

  await postToChannel(channels.final, `✨ **Final Phase (Revised)** - Polishing...`, botToken);
  const finalBlog = await miniMax.chat([{ role: 'user', content: FINAL_PROMPT.replace('{topic}', topic).replace('{edited}', edited) }], { maxTokens: 1600 });

  await postToChannel(channels.social, `📱 **Social Phase (Revised)** - Updating...`, botToken);
  const socialContent = await miniMax.chat([{ role: 'user', content: SOCIAL_PROMPT.replace('{blog}', finalBlog) }], { maxTokens: 1600 });
  
  const { facebook, twitter, linkedin } = parseSocialPosts(socialContent);
  await postToChannel(channels.social, `✅ **Social Posts Updated**\n\n**Facebook:**\n${facebook}`, botToken);
  await postToChannel(channels.social, `**X/Twitter:**\n${twitter}`, botToken);
  await postToChannel(channels.social, `**LinkedIn:**\n${linkedin}`, botToken);
  
  const socialPosts = JSON.stringify({ facebook, twitter, linkedin });
  await sendApprovalMessage(channels.final, finalBlog, socialPosts, botToken);
  return { edited, finalBlog, socialPosts };
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export class ContentWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    const { topic, channels } = event.payload;
    
    // Check if MINIMAX_API_KEY is configured
    if (!this.env.MINIMAX_API_KEY) {
      await postToChannel(channels.research, '❌ **ERROR**: MINIMAX_API_KEY not configured. Please set it via `wrangler secret put MINIMAX_API_KEY`', this.env.DISCORD_BOT_TOKEN);
      throw new Error('MINIMAX_API_KEY not configured');
    }
    
    const miniMax = new MiniMaxClient(this.env.MINIMAX_API_KEY);
    const botToken = this.env.DISCORD_BOT_TOKEN;

    // RESEARCH - NO RETRIES, runs once
    await postToChannel(channels.research, '🔍 **Research Phase** - Searching the web...', botToken);
    
    let research: string;
    if (this.env.EXA_API_KEY) {
      const results = await step.do('research-web', async () => {
        return await searchWeb(`${topic} latest news, trends, insights, statistics`, this.env.EXA_API_KEY);
      });
      await postToChannel(channels.research, `🔍 **Research Phase** - Found ${results.length} results. Generating summary...`, botToken);
      
      const summary = await summarizeSearchResults(results);
      research = await miniMax.chat([{
        role: 'user',
        content: RESEARCH_WITH_EXA_PROMPT.replace('{summary}', summary).replace('{topic}', topic),
      }], { maxTokens: 1600 });
    } else {
      await postToChannel(channels.research, '🔍 **Research Phase** - No EXA_API_KEY, using MiniMax directly...', botToken);
      research = await miniMax.chat([{
        role: 'user',
        content: RESEARCH_PROMPT.replace('{topic}', topic),
      }], { maxTokens: 1600 });
    }
    
    if (this.env.CACHE) {
      const key = `research:${topic.toLowerCase().replace(/\s+/g, '-')}`;
      await this.env.CACHE.put(key, research, { expirationTtl: 86400 });
    }
    await postToChannel(channels.research, `✅ **Research Phase Complete**\n\n${research}`, botToken);

    // DRAFT - NO RETRIES, runs once
    await postToChannel(channels.draft, '✍️ **Draft Phase** - Writing...', botToken);
    const draft = await miniMax.chat([{ role: 'user', content: DRAFT_PROMPT.replace('{topic}', topic).replace('{research}', research) }], { maxTokens: 1600 });
    await postToChannel(channels.draft, `✅ **Draft Phase Complete**\n\n${draft}`, botToken);

    // EDIT - NO RETRIES, runs once
    await postToChannel(channels.edit, '🔍 **Edit Phase** - Reviewing...', botToken);
    const edited = await miniMax.chat([{ role: 'user', content: EDIT_PROMPT.replace('{draft}', draft) }], { maxTokens: 1600 });
    await postToChannel(channels.edit, `✅ **Edit Phase Complete**\n\n${edited}`, botToken);

    // FINAL - NO RETRIES, runs once
    await postToChannel(channels.final, '✨ **Final Phase** - Polishing...', botToken);
    const finalBlog = await miniMax.chat([{ role: 'user', content: FINAL_PROMPT.replace('{topic}', topic).replace('{edited}', edited) }], { maxTokens: 1600 });
    await postToChannel(channels.final, `✅ **Final Phase Complete**\n\n${finalBlog}`, botToken);

    // SOCIAL - NO RETRIES, runs once
    await postToChannel(channels.social, '📱 **Social Phase** - Creating posts...', botToken);
    const socialContent = await miniMax.chat([{ role: 'user', content: SOCIAL_PROMPT.replace('{blog}', finalBlog) }], { maxTokens: 1600 });
    });
    const { facebook, twitter, linkedin } = parseSocialPosts(socialContent);
    
    await postToChannel(channels.social, `✅ **Social Phase Complete**\n\n**Facebook:**\n${facebook}`, botToken);
    await postToChannel(channels.social, `**X/Twitter:**\n${twitter}`, botToken);
    await postToChannel(channels.social, `**LinkedIn:**\n${linkedin}`, botToken);
    
    const socialPosts = JSON.stringify({ facebook, twitter, linkedin });

    // APPROVAL - in final channel
    await sendApprovalMessage(channels.final, finalBlog, socialPosts, botToken);
    const { payload } = await step.waitForEvent<ApprovalPayload>('await-approval', {
      type: 'approval',
      timeout: '24 hours',
    });

    if (payload.approved) {
      await step.do('publish', async () => {
        await postToChannel(channels.final, '🚀 **Publishing** - Uploading to GitHub Pages...', botToken);
        const path = await publish(topic, finalBlog, socialPosts, this.env);
        await postToChannel(channels.final, `🎉 **Published!** → GitHub Pages: \`${path}\``, botToken);
      });
    } else {
      // Revision loop
      const { finalBlog: revFinal, socialPosts: revSocial } = await runRevision(
        topic, finalBlog, channels, botToken, miniMax,
      );

      const { payload: p2 } = await step.waitForEvent<ApprovalPayload>('await-revision', {
        type: 'approval',
        timeout: '24 hours',
      });

      if (p2.approved) {
        await step.do('revise-publish', async () => {
          await postToChannel(channels.final, '🚀 **Publishing** - Uploading to GitHub Pages...', botToken);
          const path = await publish(topic, revFinal, revSocial, this.env);
          await postToChannel(channels.final, `🎉 **Published!** → GitHub Pages: \`${path}\``, botToken);
        });
      } else {
        await postToChannel(channels.final, 'Workflow ended. Use `/create` to start over.', botToken);
      }
    }
  }
}
