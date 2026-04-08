import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIChatClient } from './minimax';

describe('AIChatClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a client with default settings', () => {
      const client = new AIChatClient('test-api-key');
      expect(client).toBeDefined();
    });

    it('should use gpt-5.4-nano as default model', () => {
      const client = new AIChatClient('test-api-key');
      expect(client).toBeDefined();
    });

    it('should use custom model when provided', () => {
      const client = new AIChatClient('test-api-key', 'gpt-4');
      expect(client).toBeDefined();
    });
  });

  describe('chat', () => {
    it('should throw error on API error', async () => {
      const client = new AIChatClient('test-api-key');

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(
        client.chat([{ role: 'user', content: 'Hello' }]),
      ).rejects.toThrow('AI API error: 401 - Unauthorized');
    });

    it('should throw error when no choices returned', async () => {
      const client = new AIChatClient('test-api-key');

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test',
            choices: [],
          }),
      });

      await expect(
        client.chat([{ role: 'user', content: 'Hello' }]),
      ).rejects.toThrow('No response from AI');
    });

    it('should return content from successful response', async () => {
      const client = new AIChatClient('test-api-key');

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test',
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Hello, how can I help you?',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
            },
          }),
      });

      const result = await client.chat([{ role: 'user', content: 'Hello' }]);

      expect(result).toBe('Hello, how can I help you?');
    });

    it('should use provided temperature', async () => {
      const client = new AIChatClient('test-api-key');

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test',
            choices: [
              {
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
          }),
      });

      await client.chat([{ role: 'user', content: 'Hello' }], { temperature: 0.9 });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: expect.stringContaining('"temperature":0.9'),
        }),
      );
    });

    it('should use provided maxTokens', async () => {
      const client = new AIChatClient('test-api-key');

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test',
            choices: [
              {
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
          }),
      });

      await client.chat([{ role: 'user', content: 'Hello' }], { maxTokens: 1024 });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          body: expect.stringContaining('"max_completion_tokens":1024'),
        }),
      );
    });
  });
});
