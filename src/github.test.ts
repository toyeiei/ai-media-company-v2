import { describe, it, expect, vi } from 'vitest';
import { GitHubClient, generateBlogMarkdown } from './github';

describe('GitHubClient', () => {
  describe('constructor', () => {
    it('should store token and repo', () => {
      const client = new GitHubClient('test-token', 'owner/repo');

      expect(client).toBeDefined();
    });
  });

  describe('generateSlug', () => {
    it('should convert title to lowercase slug', () => {
      const client = new GitHubClient('token', 'owner/repo');
      const slug = client.generateSlug('Hello World');

      expect(slug).toBe('hello-world');
    });

    it('should remove special characters', () => {
      const client = new GitHubClient('token', 'owner/repo');
      const slug = client.generateSlug('Hello! @World#2024');

      expect(slug).toBe('hello-world-2024');
    });

    it('should trim leading and trailing dashes', () => {
      const client = new GitHubClient('token', 'owner/repo');
      const slug = client.generateSlug('---Hello World---');

      expect(slug).toBe('hello-world');
    });

    it('should handle empty strings', () => {
      const client = new GitHubClient('token', 'owner/repo');
      const slug = client.generateSlug('');

      expect(slug).toBe('');
    });
  });

  describe('formatDate', () => {
    it('should return ISO date string', () => {
      const client = new GitHubClient('token', 'owner/repo');
      const date = client.formatDate();

      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('createFile', () => {
    it('should throw error for invalid repo format', async () => {
      const client = new GitHubClient('token', 'invalid-repo');

      await expect(client.createFile('path.md', 'content', 'message')).rejects.toThrow(
        "Invalid repo format: invalid-repo. Expected 'owner/repo'",
      );
    });

    it('should create file successfully', async () => {
      const client = new GitHubClient('token', 'owner/repo');

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sha: null }),
        })
        .mockResolvedValueOnce({
          ok: true,
        });

      const result = await client.createFile('path.md', 'content', 'message');

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should update existing file with SHA', async () => {
      const client = new GitHubClient('token', 'owner/repo');

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sha: 'existing-sha' }),
        })
        .mockResolvedValueOnce({
          ok: true,
        });

      const result = await client.createFile('path.md', 'new content', 'update message');

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error on 403 from getFileSha', async () => {
      const client = new GitHubClient('token', 'owner/repo');

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });

      await expect(client.createFile('path.md', 'content', 'message')).rejects.toThrow(
        'GitHub API error: 403',
      );
    });
  });

  describe('getFileSha', () => {
    it('should return SHA for existing file', async () => {
      const client = new GitHubClient('token', 'owner/repo');

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sha: 'test-sha' }),
      });

      const sha = await client.getFileSha('path.md');

      expect(sha).toBe('test-sha');
    });

    it('should return null for non-existing file (404)', async () => {
      const client = new GitHubClient('token', 'owner/repo');

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const sha = await client.getFileSha('nonexistent.md');

      expect(sha).toBeNull();
    });

    it('should throw error on other API errors', async () => {
      const client = new GitHubClient('token', 'owner/repo');

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(client.getFileSha('path.md')).rejects.toThrow('GitHub API error: 500');
    });
  });
});

describe('generateBlogMarkdown', () => {
  it('should generate valid markdown with frontmatter', () => {
    const md = generateBlogMarkdown('Test Title', 'Blog content here.');

    expect(md).toContain('---');
    expect(md).toContain('title: "Test Title"');
    expect(md).toContain('date:');
    expect(md).toContain('excerpt: "Test Title"');
    expect(md).toContain('# Test Title');
    expect(md).toContain('Blog content here.');
  });

  it('should include social posts if provided', () => {
    const md = generateBlogMarkdown(
      'Test Title',
      'Content',
      {
        facebook: 'FB post',
        twitter: 'Tweet',
        linkedin: 'LI post',
      },
    );

    expect(md).toContain('## Share This Post');
    expect(md).toContain('**Facebook:** FB post');
    expect(md).toContain('**X/Twitter:** Tweet');
    expect(md).toContain('**LinkedIn:** LI post');
  });

  it('should not include social posts section if not provided', () => {
    const md = generateBlogMarkdown('Title', 'Content');

    expect(md).not.toContain('## Share This Post');
  });

  it('should handle special characters in title', () => {
    const md = generateBlogMarkdown('Title with "quotes" and more', 'Content');

    expect(md).toContain('title: "Title with "quotes" and more"');
  });
});
