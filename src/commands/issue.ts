import { Command } from 'commander';
import jira from '../lib/jira.js';

export const list = new Command()
  .name('list')
  .description('List issues')
  .option('-p, --project <key>', 'Project key')
  .option('-s, --status <status>', 'Status')
  .option('-a, --assignee <name>', 'Assignee')
  .option('-l, --limit <number>', 'Max results', '50')
  .option('-f, --fields <fields>', 'Fields to fetch (key,summary,status,assignee,created)', 'key,summary,status,assignee,created')
  .action(async (opts) => {
    let jql = '';
    if (opts.project) jql += `project = ${opts.project}`;
    if (opts.status) jql += `${jql ? ' AND ' : ''}status = "${opts.status}"`;
    if (opts.assignee) jql += `${jql ? ' AND ' : ''}assignee = "${opts.assignee}"`;
    if (!jql) jql = ' ORDER BY created DESC';
    
    const fields = opts.fields.split(',');
    const issues = await jira.searchJira(jql, { maxResults: parseInt(opts.limit), fields });
    
    const minimal = issues.issues.map((issue: any) => {
      const result: any = { key: issue.key };
      fields.forEach((field: string) => {
        if (field !== 'key' && issue.fields[field] !== undefined) {
          result[field] = typeof issue.fields[field] === 'object' ? issue.fields[field]?.name || issue.fields[field]?.value : issue.fields[field];
        }
      });
      return result;
    });
    console.log(JSON.stringify(minimal, null, 2));
  });

export const create = new Command()
  .name('create')
  .description('Create issue')
  .requiredOption('-p, --project <key>', 'Project key')
  .requiredOption('-s, --summary <text>', 'Summary')
  .option('-d, --description <text>', 'Description')
  .option('-t, --type <type>', 'Issue type', 'Task')
  .option('-P, --priority <priority>', 'Priority', 'Medium')
  .action(async (opts) => {
    const issue = await jira.createIssue({
      projectKey: opts.project,
      summary: opts.summary,
      description: opts.description || '',
      issueType: opts.type,
      priority: opts.priority,
    });
    console.log(`Created: ${issue.key}`);
  });

export const update = new Command()
  .name('update')
  .description('Update issue')
  .requiredOption('-k, --key <key>', 'Issue key')
  .option('-s, --summary <text>', 'Summary')
  .option('-d, --description <text>', 'Description')
  .option('-S, --status <status>', 'Status')
  .action(async (opts) => {
    const updates: any = {};
    if (opts.summary) updates.summary = opts.summary;
    if (opts.description) updates.description = opts.description;
    
    await jira.updateIssue(opts.key, { fields: updates });
    if (opts.status) {
      const transitions = await jira.listTransitions(opts.key);
      const transition = transitions.transitions.find((t: any) => t.name.toLowerCase() === opts.status.toLowerCase());
      if (transition) {
        await jira.transitionIssue(opts.key, { id: transition.id });
      }
    }
    console.log(`Updated: ${opts.key}`);
  });

export const comment = new Command()
  .name('comment')
  .description('Add comment')
  .requiredOption('-k, --key <key>', 'Issue key')
  .requiredOption('-m, --message <text>', 'Comment message')
  .action(async (opts) => {
    await jira.addComment(opts.key, { body: opts.message });
    console.log(`Comment added to: ${opts.key}`);
  });

export const attach = new Command()
  .name('attach')
  .description('Add attachment')
  .requiredOption('-k, --key <key>', 'Issue key')
  .requiredOption('-f, --file <path>', 'File path')
  .action(async (opts) => {
    const fs = await import('fs');
    const file = fs.readFileSync(opts.file);
    await jira.addAttachment(opts.key, file, opts.file);
    console.log(`Attachment added to: ${opts.key}`);
  });