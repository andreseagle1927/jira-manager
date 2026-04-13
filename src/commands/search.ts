import { Command } from 'commander';
import jira from '../lib/jira.js';

export const search = new Command()
  .name('search')
  .description('Search with JQL')
  .requiredOption('-q, --query <jql>', 'JQL query')
  .option('-l, --limit <number>', 'Max results', '50')
  .action(async (opts) => {
    const results = await jira.searchJira(opts.query, { maxResults: parseInt(opts.limit) });
    console.log(JSON.stringify(results.issues, null, 2));
  });