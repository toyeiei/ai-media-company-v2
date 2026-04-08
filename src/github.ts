export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  topic: string;
  excerpt: string;
}

export class GitHubClient {
  private owner: string;
  private name: string;

  constructor(private token: string, private repo: string) {
    [this.owner, this.name] = this.repo.split('/');
    if (!this.owner || !this.name) {
      throw new Error(`Invalid repo: ${this.repo} (expected owner/repo)`);
    }
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ai-media-team-bot',
    };
  }

  async createFile(path: string, content: string, message: string): Promise<boolean> {
    const url = `https://api.github.com/repos/${this.owner}/${this.name}/contents/${path}`;
    const encoded = btoa(unescape(encodeURIComponent(content)));

    const body: Record<string, unknown> = { message, content: encoded };
    const sha = await this.getSha(path);
    if (sha) {
      body.sha = sha;
    }

    const res = await fetch(url, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      let errorMsg = `GitHub API error: ${res.status}`;
      if (res.status === 401) {
        errorMsg = 'GitHub authentication failed. Check GITHUB_TOKEN is valid and not expired.';
      } else if (res.status === 403) {
        errorMsg = 'GitHub access forbidden. Ensure GITHUB_TOKEN has "repo" scope for private repos or public_repo scope for public repos.';
      } else if (res.status === 404) {
        errorMsg = `GitHub repo not found: ${this.owner}/${this.name}. Check GITHUB_REPO is correct.`;
      }
      throw new Error(`${errorMsg} - ${errorBody}`);
    }

    return res.ok;
  }

  private async getSha(path: string): Promise<string | null> {
    const res = await fetch(`https://api.github.com/repos/${this.owner}/${this.name}/contents/${path}`, {
      headers: this.headers,
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      const errorBody = await res.text();
      if (res.status === 401) {
        throw new Error(`GitHub authentication failed: ${res.status} - Check GITHUB_TOKEN is valid.`);
      }
      throw new Error(`GitHub API error: ${res.status} - ${errorBody}`);
    }
    return (await res.json() as { sha?: string }).sha || null;
  }

  async publishBlogPost(title: string, content: string, excerpt: string, topic: string, facebook: string): Promise<string> {
    const date = new Date().toISOString().split('T')[0];
    const slug = `${date}-${this.generateSlug(title)}`;
    const blogPath = `blog/${slug}.md`;

    const markdown = this.generateBlogMarkdown(title, content, excerpt, topic, facebook);
    const success = await this.createFile(blogPath, markdown, `Add blog post: ${title}`);
    
    if (!success) {
      throw new Error(`Failed to create blog post file: ${blogPath}`);
    }

    // Update index.json
    await this.updateBlogIndex({ slug, title, date, topic, excerpt });

    return slug;
  }

  private async updateBlogIndex(post: BlogPost): Promise<void> {
    const indexPath = 'blog/index.json';
    let posts: BlogPost[] = [];

    // Fetch existing index
    try {
      const res = await fetch(`https://api.github.com/repos/${this.owner}/${this.name}/contents/${indexPath}`, {
        headers: this.headers,
      });
      if (res.ok) {
        const data = await res.json() as { content?: string };
        if (data.content) {
          const decoded = atob(data.content);
          posts = JSON.parse(decoded);
        }
      }
    } catch {
      // Index doesn't exist yet, start with empty array
    }

    // Add new post
    posts.push(post);

    // Save updated index
    const success = await this.createFile(indexPath, JSON.stringify(posts, null, 2), 'Update blog index');
    if (!success) {
      throw new Error('Failed to update blog index');
    }
  }

  generateSlug(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  }

  generateBlogMarkdown(
    title: string,
    content: string,
    excerpt: string,
    topic: string,
    facebook: string,
  ): string {
    const date = new Date().toISOString().split('T')[0];
    return `---
title: "${title}"
date: ${date}
topic: "${topic}"
excerpt: "${excerpt}"
---

# ${title}

${content}

---

## Share on Facebook

${facebook}
`;
  }
}
