import jira from './jira.js';

export interface TicketResearcher {
  research(query: string): Promise<ResearchResult>;
}

export interface ResearchAgentTool {
  invoke(prompt: string): Promise<string>;
}

export interface ResearchResult {
  summary: string;
  details: string;
  sources: { title: string; url: string }[];
}

export class AgentResearcher implements TicketResearcher {
  private agent: ResearchAgentTool;

  constructor(agent: ResearchAgentTool) {
    this.agent = agent;
  }

  async research(query: string): Promise<ResearchResult> {
    const result = await this.agent.invoke(`Research the following topic and provide detailed findings with sources:\n\n${query}`);
    
    const sources: { title: string; url: string }[] = [];
    const urlMatch = result.match(/https?:\/\/[^\s]+/g);
    if (urlMatch) {
      urlMatch.forEach(url => {
        sources.push({ title: url, url });
      });
    }

    return {
      summary: result.slice(0, 2000),
      details: result,
      sources,
    };
  }
}

export interface WebSearchTool {
  search(query: string, numResults?: number): Promise<{ results?: { title: string; url: string }[] }>;
}

export interface CodeSearchTool {
  search(query: string, tokensNum?: number): Promise<string | null>;
}

export interface NewsTool {
  getNews(options?: { perPage?: number }): Promise<{ results?: { title: string }[] }>;
}

export interface JiraAdapter {
  searchTickets(status: string): Promise<JiraIssue[]>;
  getIssue(key: string): Promise<JiraIssueDetail>;
  addComment(key: string, comment: string): Promise<void>;
  transition(key: string, status: string): Promise<void>;
}

export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description?: { content?: { content?: { text?: string }[] }[] };
  };
}

export interface JiraIssueDetail {
  key: string;
  fields: {
    summary: string;
    description?: { content?: { content?: { text?: string }[] }[] };
  };
}

export interface Notifier {
  send(message: string): Promise<void>;
}

export interface AiWorkerDeps {
  jira: JiraAdapter;
  researcher: TicketResearcher;
  notifier: Notifier;
}

export function extractTextFromDoc(doc: any): string {
  if (!doc?.content) return '';
  return doc.content
    .map((block: any) => block.content?.map((c: any) => c.text).join(''))
    .join('\n');
}

export class TicketResearcherImpl implements TicketResearcher {
  private webSearch: WebSearchTool;
  private codeSearch: CodeSearchTool;
  private newsTool: NewsTool;

  constructor(webSearch?: WebSearchTool, codeSearch?: CodeSearchTool, newsTool?: NewsTool) {
    this.webSearch = webSearch || { search: () => Promise.resolve({ results: [] }) };
    this.codeSearch = codeSearch || { search: () => Promise.resolve(null) };
    this.newsTool = newsTool || { getNews: () => Promise.resolve({ results: [] }) };
  }

  async research(query: string): Promise<ResearchResult> {
    const sources: { title: string; url: string }[] = [];
    let summary = '';
    let details = '';

    try {
      const webResults = await this.webSearch.search(query, 5);
      if (webResults?.results?.length) {
        sources.push(...webResults.results.map((r: any) => ({ title: r.title, url: r.url })));
      }
    } catch (e) { /* ignore */ }

    try {
      const codeResults = await this.codeSearch.search(query, 3000);
      if (codeResults) {
        details += '\n\n## Code References\n' + codeResults;
      }
    } catch (e) { /* ignore */ }

    try {
      const newsResults = await this.newsTool.getNews({ perPage: 3 });
      if (newsResults?.results?.length) {
        summary += '\n\n## Latest News\n' + newsResults.results.map((n: any) => n.title).join('\n');
      }
    } catch (e) { /* ignore */ }

    return { summary, details, sources };
  }
}

export class JiraAdapterImpl implements JiraAdapter {
  async searchTickets(status: string): Promise<JiraIssue[]> {
    const result = await jira.searchJira(`status = "${status}" ORDER BY created ASC`, { maxResults: 20 });
    return result.issues || [];
  }

  async getIssue(key: string): Promise<JiraIssueDetail> {
    const result = await jira.searchJira(`key = ${key}`, { maxResults: 1, fields: ['summary', 'description'] });
    return result.issues?.[0] as JiraIssueDetail;
  }

  async addComment(key: string, comment: string): Promise<void> {
    await jira.addComment(key, { body: comment });
  }

  async transition(key: string, status: string): Promise<void> {
    const transitions = await jira.listTransitions(key);
    const transition = transitions.transitions.find((t: any) => t.name.toLowerCase() === status.toLowerCase());
    if (transition) {
      await jira.transitionIssue(key, { id: transition.id });
    }
  }
}

export class DiscordNotifier implements Notifier {
  private webhookUrl: string;
  
  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl || process.env.DISCORD_WEBHOOK_URL || '';
  }

  async send(message: string): Promise<void> {
    if (!this.webhookUrl) {
      console.log('[Discord notification]:', message);
      return;
    }
    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
  }
}

export async function processTickets(deps: AiWorkerDeps, options: { fromStatus?: string; toStatus?: string } = {}): Promise<ProcessedResult> {
  const fromStatus = options.fromStatus || 'To AI';
  const toStatus = options.toStatus || 'To Human';
  
  const tickets = await deps.jira.searchTickets(fromStatus);
  const results: ProcessedTicket[] = [];

  for (const ticket of tickets) {
    const detail = await deps.jira.getIssue(ticket.key);
    const query = detail.fields.summary + ' ' + extractTextFromDoc(detail.fields.description);
    
    const research = await deps.researcher.research(query);
    
    const researchContent = [
      '## Research Results',
      research.summary,
      research.details,
      '',
      '### Sources',
      ...research.sources.map(s => `- [${s.title}](${s.url})`),
    ].join('\n');

    await deps.jira.addComment(ticket.key, researchContent);
    await deps.jira.transition(ticket.key, toStatus);
    
    await deps.notifier.send(`Processed ticket ${ticket.key}: ${ticket.fields.summary}`);
    
    results.push({ key: ticket.key, success: true });
  }

  return { processed: results.length, tickets: results };
}

export interface ProcessedTicket {
  key: string;
  success: boolean;
}

export interface ProcessedResult {
  processed: number;
  tickets: ProcessedTicket[];
}