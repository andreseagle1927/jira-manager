#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as issue from './commands/issue.js';
import * as project from './commands/project.js';
import * as search from './commands/search.js';
import * as board from './commands/board.js';
import * as user from './commands/user.js';
import * as aiWorker from './commands/ai-worker.js';

const program = new Command();

program
  .name('jira')
  .description('Manage Jira from CLI')
  .version('1.0.0');

program
  .command('issue')
  .description('Issue operations')
  .addCommand(issue.list)
  .addCommand(issue.create)
  .addCommand(issue.update)
  .addCommand(issue.comment)
  .addCommand(issue.attach);

program
  .command('project')
  .description('Project operations')
  .addCommand(project.list)
  .addCommand(project.listVersions)
  .addCommand(project.listComponents);

program.addCommand(search.search);
const boardCmd = program.command('board').description('Board operations');
boardCmd.addCommand(board.listBoards);
boardCmd.addCommand(board.move);
boardCmd.addCommand(board.stats);
boardCmd.addCommand(board.watch);
program.addCommand(user.listUsers);
program.addCommand(aiWorker.processCmd);

program.parse();