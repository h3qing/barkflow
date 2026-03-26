import { describe, it, expect, vi } from 'vitest';
import { Pipeline } from './pipeline';
import type { PolishService, RouteService } from './pipeline';
import type { StorageProvider } from '../storage/storage-provider';
import type { PipelineInput } from './types';
import type { Entry } from '../storage/types';

function makeInput(overrides: Partial<PipelineInput> = {}): PipelineInput {
  return {
    rawText: 'um add milk to the groceries list',
    source: 'voice',
    hotkeyUsed: 'Fn',
    durationMs: 3200,
    audioPath: null,
    projectId: null,
    ...overrides,
  };
}

function makeSavedEntry(input: PipelineInput, polished: string | null, routedTo: string): Entry {
  return Object.freeze({
    id: 'test-id',
    createdAt: '2026-03-26T00:00:00Z',
    source: input.source,
    rawText: input.rawText,
    polished,
    routedTo,
    hotkeyUsed: input.hotkeyUsed,
    durationMs: input.durationMs,
    projectId: input.projectId,
    audioPath: input.audioPath,
    metadata: {},
  });
}

function mockStorage(): StorageProvider {
  return {
    saveEntry: vi.fn(async (entry) => ({
      id: 'test-id',
      createdAt: '2026-03-26T00:00:00Z',
      ...entry,
    })),
    getEntry: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
    search: vi.fn(),
    getRecent: vi.fn(),
    saveProject: vi.fn(),
    getProject: vi.fn(),
    getProjects: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    exportAll: vi.fn(),
    importAll: vi.fn(),
    initialize: vi.fn(),
    close: vi.fn(),
  } as unknown as StorageProvider;
}

function mockPolisher(polishedText: string): PolishService {
  return {
    polish: vi.fn(async () => ({ polishedText, applied: true })),
  };
}

function mockRouter(destination = 'paste-at-cursor'): RouteService {
  return {
    dispatch: vi.fn(async () => ({ destination, success: true })),
  };
}

describe('Pipeline', () => {
  it('full happy path: polish + route + store', async () => {
    const storage = mockStorage();
    const polisher = mockPolisher('Add milk to the groceries list');
    const router = mockRouter('paste-at-cursor');
    const pipeline = new Pipeline(storage, polisher, router);

    const result = await pipeline.process(makeInput());

    expect(result.polished).toBe(true);
    expect(result.routed).toBe(true);
    expect(result.routedTo).toBe('paste-at-cursor');
    expect(result.error).toBeNull();
    expect(polisher.polish).toHaveBeenCalledWith('um add milk to the groceries list');
    expect(storage.saveEntry).toHaveBeenCalled();
  });

  it('skips polish when disabled', async () => {
    const storage = mockStorage();
    const polisher = mockPolisher('should not be called');
    const router = mockRouter();
    const pipeline = new Pipeline(storage, polisher, router, {
      polishEnabled: false,
      polishTimeoutMs: 2000,
      defaultDestination: 'paste-at-cursor',
    });

    const result = await pipeline.process(makeInput());

    expect(result.polished).toBe(false);
    expect(polisher.polish).not.toHaveBeenCalled();
  });

  it('skips polish on empty input', async () => {
    const storage = mockStorage();
    const polisher = mockPolisher('');
    const router = mockRouter();
    const pipeline = new Pipeline(storage, polisher, router);

    const result = await pipeline.process(makeInput({ rawText: '   ' }));

    expect(result.polished).toBe(false);
    expect(polisher.polish).not.toHaveBeenCalled();
  });

  it('falls back to raw text when polish fails', async () => {
    const storage = mockStorage();
    const polisher: PolishService = {
      polish: vi.fn(async () => { throw new Error('Ollama timeout'); }),
    };
    const router = mockRouter();
    const pipeline = new Pipeline(storage, polisher, router);

    const result = await pipeline.process(makeInput());

    expect(result.polished).toBe(false);
    expect(result.routed).toBe(true);
    expect(result.error).toBeNull();
  });

  it('falls back to default destination when router fails', async () => {
    const storage = mockStorage();
    const router: RouteService = {
      dispatch: vi.fn(async () => { throw new Error('Router crashed'); }),
    };
    const pipeline = new Pipeline(storage, null, router);

    const result = await pipeline.process(makeInput());

    expect(result.routed).toBe(false);
    expect(result.routedTo).toBe('paste-at-cursor');
    expect(result.error).toBe('Router error — falling back to paste');
  });

  it('still returns result when storage fails', async () => {
    const storage = mockStorage();
    (storage.saveEntry as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('DB locked')
    );
    const router = mockRouter();
    const pipeline = new Pipeline(storage, null, router);

    const result = await pipeline.process(makeInput());

    expect(result.entry.id).toBe('unsaved');
    expect(result.entry.rawText).toBe('um add milk to the groceries list');
  });

  it('works with no polisher (null)', async () => {
    const storage = mockStorage();
    const router = mockRouter();
    const pipeline = new Pipeline(storage, null, router);

    const result = await pipeline.process(makeInput());

    expect(result.polished).toBe(false);
    expect(result.routed).toBe(true);
  });

  it('routes to project destination', async () => {
    const storage = mockStorage();
    const router = mockRouter('project');
    const pipeline = new Pipeline(storage, null, router);

    const input = makeInput({ hotkeyUsed: 'Fn+P', projectId: 'proj-123' });
    const result = await pipeline.process(input);

    expect(result.routedTo).toBe('project');
    const savedEntry = (storage.saveEntry as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(savedEntry.projectId).toBe('proj-123');
  });
});
