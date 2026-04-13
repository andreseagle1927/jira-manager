import { Command } from 'commander';
import { processTickets, JiraAdapterImpl, TicketResearcherImpl, AgentResearcher, DiscordNotifier, TicketResearcher } from '../lib/ai-worker.js';

const hasTaskFunction = typeof (globalThis as any).task === 'function';

export const processCmd = new Command()
  .name('process')
  .description('Process tickets in "To AI" status')
  .option('-f, --from-status <status>', 'Status to search', 'To AI')
  .option('-t, --to-status <status>', 'Status to transition to', 'To Human')
  .option('-d, --dry-run', 'Preview without making changes', false)
  .action(async (opts) => {
    // Always use TicketResearcherImpl which uses websearch, codesearch, newsmcp_get_news tools
    // These are the SAME tools the web-content-harvester agent uses
    const researcher = new TicketResearcherImpl();

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