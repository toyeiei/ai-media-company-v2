import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runStep } from './index';
import { MiniMaxClient } from '../minimax';
import { createInitialState } from '../env';

vi.mock('../exa', () => ({
  searchWeb: vi.fn(),
  summarizeSearchResults: vi.fn(),
}));

import { searchWeb, summarizeSearchResults } from '../exa';

describe('Workflow Steps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runStep', () => {
    it('should return error for unknown step', async () => {
      const state = createInitialState('test-id', 'Test Topic', 'user', 'channel');
      state.currentStep = 'UNKNOWN' as never;

      const result = await runStep(state.currentStep, {
        state,
        miniMax: new MiniMaxClient('fake-key'),
        cache: null,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown step');
    });
  });

  describe('RESEARCH step', () => {
    it('should perform research using MiniMax', async () => {
      const state = createInitialState('test-id', 'Test Topic', 'user', 'channel');
      state.currentStep = 'RESEARCH';

      const mockMiniMax = {
        chatWithRetry: vi.fn().mockResolvedValue('Research results about Test Topic'),
      } as unknown as MiniMaxClient;

      const result = await runStep('RESEARCH', {
        state,
        miniMax: mockMiniMax,
        cache: null,
      });

      expect(result.success).toBe(true);
      expect(result.data).toContain('Test Topic');
      expect(result.nextStep).toBe('DRAFT');
    });

    it('should use Exa for web search when API key provided', async () => {
      const state = createInitialState('test-id', 'Test Topic', 'user', 'channel');
      state.currentStep = 'RESEARCH';

      const mockMiniMax = {
        chatWithRetry: vi.fn().mockResolvedValue('Synthesized research with Exa data'),
      } as unknown as MiniMaxClient;

      const mockSearchResults = [
        { title: 'Article 1', url: 'https://example.com/1', snippet: 'Key finding 1' },
        { title: 'Article 2', url: 'https://example.com/2', snippet: 'Key finding 2' },
      ];

      vi.mocked(searchWeb).mockResolvedValue(mockSearchResults);
      vi.mocked(summarizeSearchResults).mockResolvedValue('## Search Summary\n\nResults summarized');

      const result = await runStep('RESEARCH', {
        state,
        miniMax: mockMiniMax,
        cache: null,
        exaApiKey: 'test-exa-key',
      });

      expect(result.success).toBe(true);
      expect(searchWeb).toHaveBeenCalledWith(
        expect.stringContaining('Test Topic'),
        'test-exa-key',
      );
      expect(summarizeSearchResults).toHaveBeenCalledWith(mockSearchResults);
      expect(mockMiniMax.chatWithRetry).toHaveBeenCalled();
      expect(result.nextStep).toBe('DRAFT');
    });

    it('should fallback to MiniMax-only research without Exa key', async () => {
      const state = createInitialState('test-id', 'Test Topic', 'user', 'channel');
      state.currentStep = 'RESEARCH';

      const mockMiniMax = {
        chatWithRetry: vi.fn().mockResolvedValue('Research results without Exa'),
      } as unknown as MiniMaxClient;

      const result = await runStep('RESEARCH', {
        state,
        miniMax: mockMiniMax,
        cache: null,
        exaApiKey: undefined,
      });

      expect(result.success).toBe(true);
      expect(searchWeb).not.toHaveBeenCalled();
      expect(summarizeSearchResults).not.toHaveBeenCalled();
      expect(result.nextStep).toBe('DRAFT');
    });
  });

  describe('DRAFT step', () => {
    it('should generate draft from research', async () => {
      const state = createInitialState('test-id', 'Test Topic', 'user', 'channel');
      state.currentStep = 'DRAFT';
      state.data.research = 'Research data here';

      const mockMiniMax = {
        chatWithRetry: vi.fn().mockResolvedValue('Draft blog post content'),
      } as unknown as MiniMaxClient;

      const result = await runStep('DRAFT', {
        state,
        miniMax: mockMiniMax,
        cache: null,
      });

      expect(result.success).toBe(true);
      expect(result.nextStep).toBe('EDIT');
    });
  });

  describe('EDIT step', () => {
    it('should edit the draft', async () => {
      const state = createInitialState('test-id', 'Test Topic', 'user', 'channel');
      state.currentStep = 'EDIT';
      state.data.draft = 'Draft content';

      const mockMiniMax = {
        chatWithRetry: vi.fn().mockResolvedValue('Edited content with improvements'),
      } as unknown as MiniMaxClient;

      const result = await runStep('EDIT', {
        state,
        miniMax: mockMiniMax,
        cache: null,
      });

      expect(result.success).toBe(true);
      expect(result.nextStep).toBe('FINAL');
    });
  });

  describe('FINAL step', () => {
    it('should produce final polished blog', async () => {
      const state = createInitialState('test-id', 'Test Topic', 'user', 'channel');
      state.currentStep = 'FINAL';
      state.data.edited = 'Edited draft';

      const mockMiniMax = {
        chatWithRetry: vi.fn().mockResolvedValue('Final polished blog post'),
      } as unknown as MiniMaxClient;

      const result = await runStep('FINAL', {
        state,
        miniMax: mockMiniMax,
        cache: null,
      });

      expect(result.success).toBe(true);
      expect(result.nextStep).toBe('SOCIAL');
    });
  });

  describe('SOCIAL step', () => {
    it('should generate social posts', async () => {
      const state = createInitialState('test-id', 'Test Topic', 'user', 'channel');
      state.currentStep = 'SOCIAL';
      state.data.finalBlog = 'Final blog content';

      const mockMiniMax = {
        chatWithRetry: vi.fn().mockResolvedValue(`**Facebook:**
Facebook post content

**X/Twitter:**
Twitter post content

**LinkedIn:**
LinkedIn post content`),
      } as unknown as MiniMaxClient;

      const result = await runStep('SOCIAL', {
        state,
        miniMax: mockMiniMax,
        cache: null,
      });

      expect(result.success).toBe(true);
      expect(result.nextStep).toBe('AWAITING_APPROVAL');
      expect(result.data).toBeDefined();
    });

    it('should parse social posts correctly', async () => {
      const state = createInitialState('test-id', 'Test Topic', 'user', 'channel');
      state.currentStep = 'SOCIAL';
      state.data.finalBlog = 'Final blog content';

      const mockMiniMax = {
        chatWithRetry: vi.fn().mockResolvedValue(`**Facebook:**
Check out our latest blog!

**X/Twitter:**
New blog post just dropped!

**LinkedIn:**
Excited to share our latest insights on industry trends.`),
      } as unknown as MiniMaxClient;

      const result = await runStep('SOCIAL', {
        state,
        miniMax: mockMiniMax,
        cache: null,
      });

      expect(result.success).toBe(true);
      const posts = JSON.parse(result.data as string);
      expect(posts.facebook).toContain('Check out our latest blog');
      expect(posts.twitter).toContain('New blog post just dropped');
      expect(posts.linkedin).toContain('Excited to share');
    });
  });

  describe('Error handling', () => {
    it('should return error when MiniMax call fails', async () => {
      const state = createInitialState('test-id', 'Test Topic', 'user', 'channel');
      state.currentStep = 'RESEARCH';

      const mockMiniMax = {
        chatWithRetry: vi.fn().mockRejectedValue(new Error('API rate limit exceeded')),
      } as unknown as MiniMaxClient;

      const result = await runStep('RESEARCH', {
        state,
        miniMax: mockMiniMax,
        cache: null,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Research failed');
      expect(result.error).toContain('API rate limit exceeded');
    });
  });
});
