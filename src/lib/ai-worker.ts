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
  private fallback: TicketResearcher;

  constructor(agent: ResearchAgentTool, fallback?: TicketResearcher) {
    this.agent = agent;
    this.fallback = fallback || new TicketResearcherImpl();
  }

  async research(query: string): Promise<ResearchResult> {
    try {
      const result = await this.agent.invoke(
        `You are a research specialist with access to web search, content fetching, code search, and news tools. Thoroughly research the following topic and provide comprehensive findings with detailed information, examples, and sources.\n\n${query}\n\nProvide a detailed response with:` +
        `\n- Summary of findings` +
        `\n- Detailed information` +
        `\n- Configuration examples if applicable` +
        `\n- Links to sources`
      );
      
      if (!result || result.length < 50) {
        console.warn('[AgentResearcher] ⚠️ web-content-harvester returned empty result, using fallback');
        return this.fallback.research(query);
      }
      
      const sources: { title: string; url: string }[] = [];
      const urlMatch = result.match(/https?:\/\/[^\s<>\)]+/g);
      if (urlMatch) {
        const seen = new Set<string>();
        urlMatch.forEach(url => {
          const cleanUrl = url.replace(/[.,;:!?]+$/, '');
          if (!seen.has(cleanUrl)) {
            seen.add(cleanUrl);
            sources.push({ title: cleanUrl, url: cleanUrl });
          }
        });
      }

      const summaryEnd = result.indexOf('\n## ');
      const summary = summaryEnd > 0 ? result.slice(0, summaryEnd).trim() : result.slice(0, 500);
      const details = result;

      return { summary, details, sources };
    } catch (error) {
      console.error('[AgentResearcher] Agent failed:', error);
      console.log('[AgentResearcher] Falling back to tool-based research');
      return this.fallback.research(query);
    }
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
    // Use injected tools if provided, otherwise try globalThis (opencode runtime), otherwise fallback
    const globalAny = globalThis as any;
    
    this.webSearch = webSearch 
      || (globalAny.websearch ? { search: async (q: string, n?: number) => globalAny.websearch({ query: q, numResults: n || 5 }) } : null)
      || { search: () => Promise.resolve({ results: [] }) };
    
    this.codeSearch = codeSearch 
      || (globalAny.codesearch ? { search: async (q: string, t?: number) => globalAny.codesearch({ query: q, tokensNum: t || 3000 }) } : null)
      || { search: () => Promise.resolve(null) };
    
    this.newsTool = newsTool 
      || (globalAny.newsmcp_get_news ? { getNews: async (opts?: any) => globalAny.newsmcp_get_news({ perPage: opts?.perPage || 3 }) } : null)
      || { getNews: () => Promise.resolve({ results: [] }) };
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
  const jiraDomain = process.env.JIRA_DOMAIN || '';
  
  const tickets = await deps.jira.searchTickets(fromStatus);
  const results: ProcessedTicket[] = [];

  for (const ticket of tickets) {
    const detail = await deps.jira.getIssue(ticket.key);
    const description = extractTextFromDoc(detail.fields.description);
    const query = description 
      ? `${detail.fields.summary}\n\nDescription: ${description}`
      : detail.fields.summary;
    
    const research = await deps.researcher.research(query);
    
    const researchContent = [
      '## 📊 Research Results',
      '',
      research.summary,
      research.details,
      '',
      '### 📚 Sources',
      ...research.sources.map(s => `- [${s.title}](${s.url})`),
    ].join('\n');

    await deps.jira.addComment(ticket.key, researchContent);
    await deps.jira.transition(ticket.key, toStatus);
    
    // Send notification after ticket is fully processed
    const ticketLink = `https://${jiraDomain}/browse/${ticket.key}`;
    const message = [
      '## ✅ Ticket Processed',
      '',
      `**Ticket:** ${ticket.key}`,
      `**Summary:** ${ticket.fields.summary}`,
      '',
      `[🔗 View in Jira](${ticketLink})`
    ].join('\n');
    
    await deps.notifier.send(message);
    
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