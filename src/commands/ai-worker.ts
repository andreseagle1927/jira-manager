import { Command } from 'commander';
import { processTickets, JiraAdapterImpl, TicketResearcherImpl, AgentResearcher, DiscordNotifier, TicketResearcher, ResearchAgentTool } from '../lib/ai-worker.js';

const hasTaskFunction = typeof (globalThis as any).task === 'function';

export const processCmd = new Command()
  .name('process')
  .description('Process tickets in "To AI" status')
  .option('-f, --from-status <status>', 'Status to search', 'To AI')
  .option('-t, --to-status <status>', 'Status to transition to', 'To Human')
  .option('-d, --dry-run', 'Preview without making changes', false)
  .option('-m, --mode <mode>', 'Research mode: tools|agent', hasTaskFunction ? 'agent' : 'tools')
  .action(async (opts) => {
    let researcher: TicketResearcher;

    if (opts.mode === 'agent' && hasTaskFunction) {
      const agentTool: ResearchAgentTool = {
        invoke: async (prompt: string): Promise<string> => {
          console.log('[AI-Worker] 🔍 Invoking web-content-harvester agent...');
          
          if (!(globalThis as any).task) {
            throw new Error('task function not available');
          }
          
          const taskResult = await (globalThis as any).task({ 
            command: '', 
            description: 'Research with web-content-harvester agent ONLY - use web search, web fetch, codesearch, news',
            prompt,
            subagent_type: 'web-content-harvester'
          });
          
          if (!taskResult || typeof taskResult !== 'string') {
            throw new Error('Invalid response from web-content-harvester agent');
          }
          
          console.log('[AI-Worker] ✅ web-content-harvester responded, length:', taskResult.length);
          return taskResult;
        }
      };
      researcher = new AgentResearcher(agentTool, new TicketResearcherImpl());
    } else if (opts.mode === 'agent' && !hasTaskFunction) {
      console.warn('Agent mode requires opencode runtime. Falling back to tools mode.');
      researcher = new TicketResearcherImpl();
    } else {
      researcher = new TicketResearcherImpl();
    }

    const deps = {
      jira: new JiraAdapterImpl(),
      researcher,
      notifier: new DiscordNotifier(),
    };

    const result = await processTickets(deps, {
      fromStatus: opts.fromStatus,
      toStatus: opts.toStatus,
    });

    console.log(`Processed ${result.processed} tickets`);
    console.log(JSON.stringify(result, null, 2));
  });

export default processCmd;