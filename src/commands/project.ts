import { Command } from 'commander';
import jira from '../lib/jira.js';

export const list = new Command()
  .name('list')
  .description('List projects')
  .option('-m, --minimal', 'Return only key and name', false)
  .action(async (opts) => {
    const projects = await jira.listProjects();
    if (opts.minimal) {
      const minimal = projects.map((p: any) => ({ key: p.key, name: p.name }));
      console.log(JSON.stringify(minimal, null, 2));
    } else {
      console.log(JSON.stringify(projects, null, 2));
    }
  });

export const listVersions = new Command()
  .name('versions')
  .description('List project versions')
  .requiredOption('-p, --project <key>', 'Project key')
  .action(async (opts) => {
    const versions = await jira.getVersions(opts.project);
    console.log(JSON.stringify(versions, null, 2));
  });

export const listComponents = new Command()
  .name('components')
  .description('List project components')
  .requiredOption('-p, --project <key>', 'Project key')
  .action(async (opts) => {
    const components = await jira.getProjectComponents(opts.project);
    console.log(JSON.stringify(components, null, 2));
  });