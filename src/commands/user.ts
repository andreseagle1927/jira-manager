import { Command } from 'commander';
import jira from '../lib/jira.js';

export const listUsers = new Command()
  .name('list')
  .description('List users')
  .option('-q, --query <text>', 'Search query')
  .option('-l, --limit <number>', 'Max results', '50')
  .action(async (opts) => {
    if (opts.query) {
      const users = await jira.searchUsers(opts.query, parseInt(opts.limit));
      console.log(JSON.stringify(users, null, 2));
    } else {
      console.log('Use --query to search users');
    }
  });