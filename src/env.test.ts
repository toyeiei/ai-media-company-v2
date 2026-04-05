import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  getNextStep,
  isApprovalStep,
  isErrorRecoverable,
  STEP_SEQUENCE,
} from './env';
import type { WorkflowState, WorkflowStep } from './env';

describe('Workflow Types', () => {
  describe('STEP_SEQUENCE', () => {
    it('should contain all workflow steps in order', () => {
      expect(STEP_SEQUENCE).toEqual([
        'RESEARCH',
        'DRAFT',
        'EDIT',
        'FINAL',
        'SOCIAL',
        'AWAITING_APPROVAL',
        'PUBLISHED',
      ]);
    });
  });

  describe('createInitialState', () => {
    it('should create a valid initial state', () => {
      const state = createInitialState('test-id', 'Test Topic', 'user-123', 'channel-456');

      expect(state.id).toBe('test-id');
      expect(state.topic).toBe('Test Topic');
      expect(state.userId).toBe('user-123');
      expect(state.channelId).toBe('channel-456');
      expect(state.currentStep).toBe('IDLE');
      expect(state.data).toEqual({});
      expect(state.createdAt).toBeDefined();
      expect(state.updatedAt).toBeDefined();
    });

    it('should generate a unique ID when not provided', () => {
      const state1 = createInitialState(crypto.randomUUID(), 'Topic', 'user', 'channel');
      const state2 = createInitialState(crypto.randomUUID(), 'Topic', 'user', 'channel');

      expect(state1.id).not.toBe(state2.id);
    });
  });

  describe('getNextStep', () => {
    it('should return null for IDLE (special starting state)', () => {
      expect(getNextStep('IDLE')).toBeNull();
    });

    it('should return DRAFT for RESEARCH', () => {
      expect(getNextStep('RESEARCH')).toBe('DRAFT');
    });

    it('should return EDIT for DRAFT', () => {
      expect(getNextStep('DRAFT')).toBe('EDIT');
    });

    it('should return FINAL for EDIT', () => {
      expect(getNextStep('EDIT')).toBe('FINAL');
    });

    it('should return SOCIAL for FINAL', () => {
      expect(getNextStep('FINAL')).toBe('SOCIAL');
    });

    it('should return AWAITING_APPROVAL for SOCIAL', () => {
      expect(getNextStep('SOCIAL')).toBe('AWAITING_APPROVAL');
    });

    it('should return PUBLISHED for AWAITING_APPROVAL', () => {
      expect(getNextStep('AWAITING_APPROVAL')).toBe('PUBLISHED');
    });

    it('should return null for PUBLISHED', () => {
      expect(getNextStep('PUBLISHED')).toBeNull();
    });

    it('should return null for ERROR', () => {
      expect(getNextStep('ERROR')).toBeNull();
    });
  });

  describe('isApprovalStep', () => {
    it('should return true for AWAITING_APPROVAL', () => {
      expect(isApprovalStep('AWAITING_APPROVAL')).toBe(true);
    });

    it('should return false for any other step', () => {
      expect(isApprovalStep('IDLE')).toBe(false);
      expect(isApprovalStep('RESEARCH')).toBe(false);
      expect(isApprovalStep('DRAFT')).toBe(false);
      expect(isApprovalStep('EDIT')).toBe(false);
      expect(isApprovalStep('FINAL')).toBe(false);
      expect(isApprovalStep('SOCIAL')).toBe(false);
      expect(isApprovalStep('PUBLISHED')).toBe(false);
      expect(isApprovalStep('ERROR')).toBe(false);
    });
  });

  describe('isErrorRecoverable', () => {
    it('should return true for all steps except IDLE, PUBLISHED, and ERROR', () => {
      expect(isErrorRecoverable('RESEARCH')).toBe(true);
      expect(isErrorRecoverable('DRAFT')).toBe(true);
      expect(isErrorRecoverable('EDIT')).toBe(true);
      expect(isErrorRecoverable('FINAL')).toBe(true);
      expect(isErrorRecoverable('SOCIAL')).toBe(true);
      expect(isErrorRecoverable('AWAITING_APPROVAL')).toBe(true);
    });

    it('should return false for IDLE', () => {
      expect(isErrorRecoverable('IDLE')).toBe(false);
    });

    it('should return false for PUBLISHED', () => {
      expect(isErrorRecoverable('PUBLISHED')).toBe(false);
    });

    it('should return false for ERROR', () => {
      expect(isErrorRecoverable('ERROR')).toBe(false);
    });
  });
});

describe('WorkflowState', () => {
  it('should allow full workflow progression', () => {
    const state = createInitialState('test', 'My Blog Post', 'user1', 'channel1');
    state.currentStep = 'RESEARCH';

    // Move through each step
    const steps: WorkflowStep[] = [
      'DRAFT',
      'EDIT',
      'FINAL',
      'SOCIAL',
      'AWAITING_APPROVAL',
      'PUBLISHED',
    ];

    for (const step of steps) {
      const nextStep = getNextStep(state.currentStep);
      state.currentStep = nextStep!;
      expect(state.currentStep).toBe(step);
    }

    // PUBLISHED should not advance further
    expect(getNextStep(state.currentStep)).toBeNull();
  });

  it('should store workflow data correctly', () => {
    const state = createInitialState('test', 'Topic', 'user', 'channel');
    state.data.research = 'Research findings...';
    state.data.draft = 'Draft blog post...';
    state.data.edited = 'Edited version...';
    state.data.finalBlog = 'Final blog content...';
    state.data.socialPosts = {
      facebook: 'FB post',
      twitter: 'Tweet',
      linkedin: 'LI post',
    };

    expect(state.data.research).toBe('Research findings...');
    expect(state.data.draft).toBe('Draft blog post...');
    expect(state.data.edited).toBe('Edited version...');
    expect(state.data.finalBlog).toBe('Final blog content...');
    expect(state.data.socialPosts.facebook).toBe('FB post');
    expect(state.data.socialPosts.twitter).toBe('Tweet');
    expect(state.data.socialPosts.linkedin).toBe('LI post');
  });

  it('should track error state', () => {
    const state = createInitialState('test', 'Topic', 'user', 'channel');
    state.currentStep = 'ERROR';
    state.data.errorMessage = 'Something went wrong';

    expect(state.currentStep).toBe('ERROR');
    expect(state.data.errorMessage).toBe('Something went wrong');
    expect(isErrorRecoverable(state.currentStep)).toBe(false);
  });
});
