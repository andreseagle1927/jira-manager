import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processTickets, TicketResearcherImpl, JiraAdapterImpl, DiscordNotifier, extractTextFromDoc, AiWorkerDeps, JiraAdapter, TicketResearcher, Notifier, AgentResearcher, ResearchAgentTool } from '../src/lib/ai-worker.js';

describe('extractTextFromDoc', () => {
  it('extracts text from doc structure', () => {
    const doc = {
      content: [
        { content: [{ text: 'Line 1' }, { text: 'Line 2' }] },
        { content: [{ text: 'Line 3' }] },
      ],
    };
    expect(extractTextFromDoc(doc)).toBe('Line 1Line 2\nLine 3');
  });

  it('returns empty string for null', () => {
    expect(extractTextFromDoc(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(extractTextFromDoc(undefined)).toBe('');
  });
});

describe('TicketResearcherImpl', () => {
  it('returns research result with empty sources when no results', async () => {
    const researcher = new TicketResearcherImpl(
      { search: async () => ({ results: [] }) },
      { search: async () => null },
      { getNews: async () => ({ results: [] }) }
    );

    const result = await researcher.research('test query');

    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('details');
    expect(result).toHaveProperty('sources');
    expect(result.sources).toHaveLength(0);
  });

  it('aggregates sources from web search', async () => {
    const researcher = new TicketResearcherImpl(
      { search: async () => ({ results: [{ title: 'Result 1', url: 'http://url1' }, { title: 'Result 2', url: 'http://url2' }] }) },
      { search: async () => null },
      { getNews: async () => ({ results: [] }) }
    );

    const result = await researcher.research('test query');

    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].title).toBe('Result 1');
  });

  it('includes code search results in details', async () => {
    const researcher = new TicketResearcherImpl(
      { search: async () => ({ results: [] }) },
      { search: async () => 'function example() {\n  return true;\n}' },
      { getNews: async () => ({ results: [] }) }
    );

    const result = await researcher.research('test query');

    expect(result.details).toContain('Code References');
    expect(result.details).toContain('function example()');
  });

  it('includes news in summary', async () => {
    const researcher = new TicketResearcherImpl(
      { search: async () => ({ results: [] }) },
      { search: async () => null },
      { getNews: async () => ({ results: [{ title: 'Big News' }, { title: 'More News' }] }) }
    );

    const result = await researcher.research('test query');

    expect(result.summary).toContain('Latest News');
    expect(result.summary).toContain('Big News');
  });
});

describe('DiscordNotifier', () => {
  beforeEach(() => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', '');
  });

  it('logs to console when no webhook configured', async () => {
    const notifier = new DiscordNotifier('');
    const consoleSpy = vi.spyOn(console, 'log');

    await notifier.send('test message');

    expect(consoleSpy).toHaveBeenCalledWith('[Discord notification]:', 'test message');
  });

  it('sends to webhook when configured', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const notifier = new DiscordNotifier('https://webhook.url');

    await notifier.send('test message');

    expect(mockFetch).toHaveBeenCalledWith('https://webhook.url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'test message' }),
    });
  });
});

describe('processTickets', () => {
  const createMockDeps = (overrides: Partial<AiWorkerDeps> = {}): AiWorkerDeps => ({
    jira: {
      searchTickets: vi.fn().mockResolvedValue([]),
      getIssue: vi.fn(),
      addComment: vi.fn(),
      transition: vi.fn(),
    },
    researcher: {
      research: vi.fn().mockResolvedValue({ summary: '', details: '', sources: [] }),
    },
    notifier: {
      send: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  });

  it('processes tickets and returns result', async () => {
    const mockJira = {
      searchTickets: vi.fn().mockResolvedValue([
        { key: 'TEST-1', fields: { summary: 'Test issue' } },
      ]),
      getIssue: vi.fn().mockResolvedValue({
        key: 'TEST-1',
        fields: { summary: 'Test issue', description: null },
      }),
      addComment: vi.fn().mockResolvedValue(undefined),
      transition: vi.fn().mockResolvedValue(undefined),
    };

    const mockResearcher = {
      research: vi.fn().mockResolvedValue({
        summary: 'Research summary',
        details: 'Details',
        sources: [{ title: 'Source', url: 'https://url' }],
      }),
    };

    const mockNotifier = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    vi.stubEnv('JIRA_DOMAIN', 'test.atlassian.net');

    const result = await processTickets(
      { jira: mockJira, researcher: mockResearcher, notifier: mockNotifier },
      { fromStatus: 'To AI', toStatus: 'To Human' }
    );

    expect(result.processed).toBe(1);
    expect(result.tickets).toHaveLength(1);
    expect(result.tickets[0].key).toBe('TEST-1');
    expect(result.tickets[0].success).toBe(true);
    // Notification sent once per ticket after it's fully processed
    expect(mockNotifier.send).toHaveBeenCalledTimes(1);
  });

  it('handles empty ticket queue', async () => {
    const mockJira = {
      searchTickets: vi.fn().mockResolvedValue([]),
    };

    const result = await processTickets(
      { jira: mockJira, researcher: { research: vi.fn() }, notifier: { send: vi.fn() } },
      { fromStatus: 'To AI', toStatus: 'To Human' }
    );

    expect(result.processed).toBe(0);
    expect(result.tickets).toHaveLength(0);
  });

  it('uses default statuses when not provided', async () => {
    const searchSpy = vi.fn().mockResolvedValue([]);
    const result = await processTickets(
      { 
        jira: { searchTickets: searchSpy, getIssue: vi.fn(), addComment: vi.fn(), transition: vi.fn() },
        researcher: { research: vi.fn() },
        notifier: { send: vi.fn() }
      }
    );

    expect(searchSpy).toHaveBeenCalledWith('To AI');
  });

  it('calls all dependencies in sequence', async () => {
    const mockJira = {
      searchTickets: vi.fn().mockResolvedValue([
        { key: 'TEST-1', fields: { summary: 'Test issue' } },
      ]),
      getIssue: vi.fn().mockResolvedValue({
        key: 'TEST-1',
        fields: { summary: 'Test issue', description: null },
      }),
      addComment: vi.fn().mockResolvedValue(undefined),
      transition: vi.fn().mockResolvedValue(undefined),
    };

    const mockResearcher = { research: vi.fn().mockResolvedValue({ summary: 'sum', details: '', sources: [] }) };
    const mockNotifier = { send: vi.fn().mockResolvedValue(undefined) };

    await processTickets(
      { jira: mockJira, researcher: mockResearcher, notifier: mockNotifier }
    );

    expect(mockJira.searchTickets).toHaveBeenCalled();
    expect(mockJira.getIssue).toHaveBeenCalledWith('TEST-1');
    expect(mockResearcher.research).toHaveBeenCalled();
    expect(mockJira.addComment).toHaveBeenCalled();
    expect(mockJira.transition).toHaveBeenCalledWith('TEST-1', 'To Human');
    // Single notification at the end
    expect(mockNotifier.send).toHaveBeenCalledTimes(1);
  });

  it('sends notification per ticket after processing each', async () => {
    vi.stubEnv('JIRA_DOMAIN', 'test.atlassian.net');
    
    const mockJira = {
      searchTickets: vi.fn().mockResolvedValue([
        { key: 'COR-1', fields: { summary: 'Issue 1' } },
        { key: 'COR-2', fields: { summary: 'Issue 2' } },
      ]),
      getIssue: vi.fn().mockResolvedValue({
        key: 'COR-1',
        fields: { summary: 'Issue 1', description: null },
      }),
      addComment: vi.fn().mockResolvedValue(undefined),
      transition: vi.fn().mockResolvedValue(undefined),
    };

    const mockNotifier = { send: vi.fn().mockResolvedValue(undefined) };

    await processTickets(
      { jira: mockJira, researcher: { research: vi.fn().mockResolvedValue({ summary: '', details: '', sources: [] }) }, notifier: mockNotifier }
    );

    // One notification per ticket
    expect(mockNotifier.send).toHaveBeenCalledTimes(2);
    
    const firstNotification = mockNotifier.send.mock.calls[0][0];
    expect(firstNotification).toContain('Ticket Processed');
    expect(firstNotification).toContain('COR-1');
    expect(firstNotification).toContain('https://test.atlassian.net/browse/COR-1');
  });

  it('does not send notification when no tickets processed', async () => {
    const mockJira = {
      searchTickets: vi.fn().mockResolvedValue([]),
    };

    const mockNotifier = { send: vi.fn().mockResolvedValue(undefined) };

    const result = await processTickets(
      { jira: mockJira, researcher: { research: vi.fn() }, notifier: mockNotifier }
    );

    expect(result.processed).toBe(0);
    expect(mockNotifier.send).not.toHaveBeenCalled();
  });
});

describe('AgentResearcher', () => {
  it('calls agent and extracts sources from URLs', async () => {
    const mockAgent = {
      invoke: vi.fn().mockResolvedValue('Found useful info at https://example.com and https://test.com. Here are the details...')
    };

    const researcher = new AgentResearcher(mockAgent);
    const result = await researcher.research('Apache services');

    expect(mockAgent.invoke).toHaveBeenCalled();
    expect(result.details).toContain('Found useful info');
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].url).toBe('https://example.com');
  });

  it('handles agent response without URLs', async () => {
    const mockAgent = {
      invoke: vi.fn().mockResolvedValue('Research complete. No external sources found. This is a detailed response about the topic with comprehensive information that exceeds the minimum length threshold.')
    };

    const researcher = new AgentResearcher(mockAgent);
    const result = await researcher.research('test query');

    expect(result.sources).toHaveLength(0);
    expect(result.summary).toContain('Research complete');
  });

  it('falls back to tool-based research when agent fails', async () => {
    const mockAgent = {
      invoke: vi.fn().mockRejectedValue(new Error('Agent unavailable'))
    };

    const fallbackResearcher = {
      research: vi.fn().mockResolvedValue({ summary: 'Fallback result', details: '', sources: [] })
    };

    const researcher = new AgentResearcher(mockAgent, fallbackResearcher as any);
    const result = await researcher.research('test query');

    expect(fallbackResearcher.research).toHaveBeenCalledWith('test query');
    expect(result.summary).toBe('Fallback result');
  });
});