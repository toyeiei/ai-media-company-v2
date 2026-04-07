import { describe, it, expect, vi } from 'vitest';
import { GitHubClient } from './github';

describe('GitHubClient', () => {
  describe('generateSlug', () => {
    it('converts title to lowercase slug', () => {
      expect(new GitHubClient('t', 'o/r').generateSlug('Hello World')).toBe('hello-world');
    });

    it('removes special characters', () => {
      expect(new GitHubClient('t', 'o/r').generateSlug('Hello! @World#2024')).toBe('hello-world-2024');
    });

    it('trims leading and trailing dashes', () => {
      expect(new GitHubClient('t', 'o/r').generateSlug('---Hello World---')).toBe('hello-world');
    });

    it('handles empty strings', () => {
      expect(new GitHubClient('t', 'o/r').generateSlug('')).toBe('');
    });

    it('limits slug length to 60 chars', () => {
      const longTitle = 'This is a very long title that should be trimmed because it exceeds sixty characters limit';
      const slug = new GitHubClient('t', 'o/r').generateSlug(longTitle);
      expect(slug.length).toBeLessThanOrEqual(60);
    });
  });

  describe('createFile', () => {
    it('throws for invalid repo format', async () => {
      expect(() => new GitHubClient('t', 'invalid')).toThrow('Invalid repo');
    });

    it('creates file successfully', async () => {
      const client = new GitHubClient('t', 'owner/repo');
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sha: null }) })
        .mockResolvedValueOnce({ ok: true });

      expect(await client.createFile('p.md', 'content', 'msg')).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('updates existing file with SHA', async () => {
      const client = new GitHubClient('t', 'owner/repo');
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sha: 'existing-sha' }) })
        .mockResolvedValueOnce({ ok: true });

      expect(await client.createFile('p.md', 'new content', 'update')).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('throws on non-404 API errors from getSha', async () => {
      const client = new GitHubClient('t', 'owner/repo');
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });

      await expect(client.createFile('p.md', 'c', 'm')).rejects.toThrow('GitHub API error: 403');
    });
  });

  describe('generateBlogMarkdown', () => {
    it('generates valid markdown with frontmatter', () => {
      const client = new GitHubClient('t', 'o/r');
      const md = client.generateBlogMarkdown('Test Title', 'Blog content.', 'Short excerpt', 'AI', 'FB post');
      expect(md).toContain('---');
      expect(md).toContain('title: "Test Title"');
      expect(md).toContain('# Test Title');
      expect(md).toContain('Short excerpt');
    });

    it('includes facebook share section', () => {
      const client = new GitHubClient('t', 'o/r');
      const md = client.generateBlogMarkdown('Title', 'Content', 'Excerpt', 'Topic', 'Check out our post!');
      expect(md).toContain('## Share on Facebook');
      expect(md).toContain('Check out our post!');
    });
  });
});
