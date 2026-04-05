import { MiniMaxClient } from './minimax';
import { GitHubClient, generateBlogMarkdown } from './github';
import { runStep } from './steps';
import type { Env } from './env';
import type { WorkflowState } from './env';
import { getNextStep } from './env';

export interface DiscordInteraction {
  type: number;
  data?: {
    name: string;
    options?: Array<{
      name: string;
      value: string;
    }>;
  };
  token: string;
  member?: {
    user: {
      id: string;
      username: string;
    };
  };
  channel_id?: string;
}

export interface DiscordResponse {
  type: number;
  data?: {
    content?: string;
    embeds?: Array<{
      title?: string;
      description?: string;
      color?: number;
    }>;
    components?: Array<{
      type: number;
      label: string;
      style: number;
      custom_id: string;
    }>;
  };
}

export class DiscordSlashHandler {
  private env: Env;
  private miniMax: MiniMaxClient;
  private github: GitHubClient;

  constructor(env: Env) {
    this.env = env;
    this.miniMax = new MiniMaxClient(env.MINIMAX_API_KEY);
    this.github = new GitHubClient(env.GITHUB_TOKEN, env.GITHUB_REPO);
  }

  async handleInteraction(body: DiscordInteraction): Promise<DiscordResponse> {
    const command = body.data?.name;

    switch (command) {
      case 'create':
        return this.handleCreate(body);
      case 'status':
        return this.handleStatus(body);
      case 'cancel':
        return this.handleCancel(body);
      default:
        return this.ephemeralResponse('Unknown command');
    }
  }

  private async handleCreate(body: DiscordInteraction): Promise<DiscordResponse> {
    const userId = body.member?.user.id || 'unknown';
    const channelId = body.channel_id || 'unknown';
    const topic = body.data?.options?.find((o) => o.name === 'topic')?.value || '';

    if (!topic) {
      return this.ephemeralResponse('Usage: /create topic: <your blog topic>');
    }

    // Acknowledge immediately (Discord requires response within 3 seconds)
    // Fire and forget - we'll send follow-up messages
    this.runWorkflow(userId, channelId, topic, body.token).catch(console.error);

    return {
      type: 4, // ChannelMessageWithSource
      data: {
        content: `Starting workflow for: **${topic}**\n\nI'll DM you as each step completes.`,
      },
    };
  }

  private async handleStatus(body: DiscordInteraction): Promise<DiscordResponse> {
    const userId = body.member?.user.id || 'unknown';
    const workflowId = `workflow-${userId}`;
    const workflowStub = this.env.WORKFLOW.get(this.env.WORKFLOW.idFromName(workflowId));

    try {
      const response = await workflowStub.fetch(new Request('http://localhost/status'));
      const { workflow } = await response.json() as { workflow: WorkflowState };

      if (!workflow || workflow.currentStep === 'IDLE') {
        return this.ephemeralResponse('No active workflow. Use `/create <topic>` to start.');
      }

      return {
        type: 4,
        data: {
          content: this.formatStatus(workflow),
        },
      };
    } catch {
      return this.ephemeralResponse('Could not fetch workflow status.');
    }
  }

  private async handleCancel(body: DiscordInteraction): Promise<DiscordResponse> {
    const userId = body.member?.user.id || 'unknown';
    const workflowId = `workflow-${userId}`;
    const workflowStub = this.env.WORKFLOW.get(this.env.WORKFLOW.idFromName(workflowId));

    try {
      await workflowStub.fetch(new Request('http://localhost/cancel', { method: 'POST' }));
      return this.ephemeralResponse('Workflow cancelled.');
    } catch {
      return this.ephemeralResponse('Could not cancel workflow.');
    }
  }

  private async runWorkflow(
    userId: string,
    channelId: string,
    topic: string,
    token: string,
  ): Promise<void> {
    const workflowId = `workflow-${userId}`;
    const workflowStub = this.env.WORKFLOW.get(this.env.WORKFLOW.idFromName(workflowId));

    // Initialize workflow
    await workflowStub.fetch(new Request('http://localhost/init', {
      method: 'POST',
      body: JSON.stringify({ topic, userId, channelId }),
    }));

    // Run through steps
    await this.runSteps(workflowStub, userId, token);
  }

  private async runSteps(workflowStub: DurableObjectStub, userId: string, token: string): Promise<void> {
    while (true) {
      const statusResponse = await workflowStub.fetch(new Request('http://localhost/status'));
      const { workflow } = await statusResponse.json() as { workflow: WorkflowState };

      if (!workflow ||
          workflow.currentStep === 'IDLE' ||
          workflow.currentStep === 'AWAITING_APPROVAL' ||
          workflow.currentStep === 'PUBLISHED' ||
          workflow.currentStep === 'ERROR') {
        break;
      }

      // Send step notification
      await this.sendFollowUp(token, `**Step: ${workflow.currentStep}**`);

      const stepResult = await runStep(workflow.currentStep, {
        state: workflow,
        miniMax: this.miniMax,
        cache: this.env.CACHE,
        exaApiKey: this.env.EXA_API_KEY,
      });

      if (!stepResult.success) {
        await workflowStub.fetch(new Request('http://localhost/set-error', {
          method: 'POST',
          body: JSON.stringify({ message: stepResult.error }),
        }));
        await this.sendFollowUp(token, `Error: ${stepResult.error}`);
        break;
      }

      const dataKey = this.getDataKeyForStep(workflow.currentStep);
      if (dataKey && stepResult.data) {
        await workflowStub.fetch(new Request('http://localhost/set-data', {
          method: 'POST',
          body: JSON.stringify({ key: dataKey, value: stepResult.data }),
        }));
      }

      await workflowStub.fetch(new Request('http://localhost/advance', { method: 'POST' }));

      if (workflow.currentStep === 'FINAL') {
        await this.sendApprovalRequest(workflowStub, token, userId);
        break;
      }
    }
  }

  private async sendApprovalRequest(
    workflowStub: DurableObjectStub,
    token: string,
    userId: string,
  ): Promise<void> {
    const statusResponse = await workflowStub.fetch(new Request('http://localhost/status'));
    const { workflow } = await statusResponse.json() as { workflow: WorkflowState };

    let content = '**Content Ready for Review**\n\n';

    if (workflow?.data?.finalBlog) {
      content += '**Final Blog Post:**\n```\n';
      content += workflow.data.finalBlog.slice(0, 1500);
      if (workflow.data.finalBlog.length > 1500) {
        content += '\n... (truncated)';
      }
      content += '```\n\n';
    }

    if (workflow?.data?.socialPosts) {
      const posts = typeof workflow.data.socialPosts === 'string'
        ? JSON.parse(workflow.data.socialPosts)
        : workflow.data.socialPosts;
      content += '**Social Posts:**\n';
      content += `FB: ${posts.facebook?.slice(0, 200) || 'N/A'}\n`;
      content += `X: ${posts.twitter?.slice(0, 200) || 'N/A'}\n`;
      content += `LinkedIn: ${posts.linkedin?.slice(0, 200) || 'N/A'}\n`;
    }

    content += '\n**React ✅ to publish or ❌ to request revisions.**';

    await this.sendFollowUp(token, content);
  }

  private async sendFollowUp(token: string, content: string): Promise<void> {
    await fetch(`https://discord.com/api/v10/webhooks/${this.env.DISCORD_APP_ID}/${token}/messages/@original`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${this.env.DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify({ content }),
    });
  }

  private getDataKeyForStep(step: string): string | null {
    switch (step) {
      case 'RESEARCH': return 'research';
      case 'DRAFT': return 'draft';
      case 'EDIT': return 'edited';
      case 'FINAL': return 'finalBlog';
      case 'SOCIAL': return 'socialPosts';
      default: return null;
    }
  }

  private formatStatus(workflow: WorkflowState): string {
    let status = '**Workflow Status**\n';
    status += `Topic: ${workflow.topic}\n`;
    status += `Step: ${workflow.currentStep}\n\n`;

    if (workflow.data.errorMessage) {
      status += `Error: ${workflow.data.errorMessage}\n\n`;
    }

    if (workflow.data.finalBlog) {
      status += '**Preview:**\n```\n';
      status += workflow.data.finalBlog.slice(0, 500);
      if (workflow.data.finalBlog.length > 500) {
status += '\n...';
}
      status += '```';
    }

    return status;
  }

  private ephemeralResponse(content: string): DiscordResponse {
    return {
      type: 4,
      data: {
        content,
      },
    };
  }
}
