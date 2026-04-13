import { Command } from 'commander';
import jira from '../lib/jira.js';
import { discordWebhook, desktopNotify } from '../lib/notify.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const STATE_FILE = '.state.json';
const statusMap: Record<string, string> = {
  todo: 'To Do',
  progress: 'In Progress',
  done: 'Done',
  ai: 'to AI',
  human: 'to Human',
};

function loadState(): Record<string, string[]> {
  if (!existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch { return {}; }
}

function saveState(state: Record<string, string[]>) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export const listBoards = new Command()
  .name('board')
  .description('Show board (issues by status)')
  .option('-p, --project <key>', 'Project key', 'COR')
  .option('-v, --view <view>', 'View: todo, progress, done, ai, human, all', 'all')
  .action(async (opts) => {
    let jql = `project = ${opts.project}`;
    if (opts.view !== 'all' && statusMap[opts.view]) {
      jql += ` AND status = "${statusMap[opts.view]}"`;
    }
    jql += ' ORDER BY created DESC';
    
    const result = await jira.searchJira(jql, { maxResults: 50 });
    
    if (opts.view === 'all') {
      const byStatus: Record<string, any[]> = {};
      result.issues.forEach((issue: any) => {
        const status = issue.fields.status.name;
        if (!byStatus[status]) byStatus[status] = [];
        byStatus[status].push({ key: issue.key, summary: issue.fields.summary });
      });
      
      console.log(`📋 BOARD: ${opts.project}`);
      console.log('═'.repeat(50));
      for (const [status, items] of Object.entries(byStatus)) {
        console.log(`\n📌 ${status} (${items.length})`);
        (items as any[]).forEach((item: any) => console.log(`  - ${item.key}: ${item.summary}`));
      }
    } else {
      console.log(JSON.stringify(result.issues.map((i: any) => ({
        key: i.key,
        summary: i.fields.summary,
        status: i.fields.status.name
      })), null, 2));
    }
  });

export const move = new Command()
  .name('move')
  .description('Move issue to status')
  .requiredOption('-k, --key <key>', 'Issue key')
  .requiredOption('-s, --status <status>', 'Target status')
  .action(async (opts) => {
    const transitions = await jira.listTransitions(opts.key);
    const target = statusMap[opts.status.toLowerCase()] || opts.status;
    const transition = transitions.transitions.find((t: any) => 
      t.name.toLowerCase() === target.toLowerCase()
    );
    
    if (!transition) {
      console.log(`Available: ${transitions.transitions.map((t: any) => t.name).join(', ')}`);
      return;
    }
    
    await jira.transitionIssue(opts.key, { id: transition.id });
    console.log(`✓ ${opts.key} → ${transition.name}`);
  });

export const stats = new Command()
  .name('stats')
  .description('Show project stats')
  .option('-p, --project <key>', 'Project key', 'COR')
  .action(async (opts) => {
    const result = await jira.searchJira(`project = ${opts.project}`, { maxResults: 100 });
    
    const counts: Record<string, number> = {};
    result.issues.forEach((issue: any) => {
      const status = issue.fields.status.name;
      counts[status] = (counts[status] || 0) + 1;
    });
    
    const total = result.issues.length;
    console.log(`📊 ${opts.project} - ${total} issues\n`);
    for (const [status, count] of Object.entries(counts)) {
      const pct = Math.round((count / total) * 100);
      console.log(`${status}: ${count} (${pct}%)`);
    }
  });

export const watch = new Command()
  .name('watch')
  .description('Watch for new tickets (runs continuously)')
  .option('-p, --project <key>', 'Project key', 'COR')
  .option('-v, --view <view>', 'Status to watch', 'ai')
  .option('-i, --interval <seconds>', 'Check interval', '60')
  .option('--discord', 'Send Discord notification')
  .option('--desktop', 'Send desktop notification')
  .option('--once', 'Check once and exit')
  .action(async (opts) => {
    const status = statusMap[opts.view] || opts.view;
    const interval = parseInt(opts.interval) * 1000;
    
    console.log(`👀 Watching for new "${status}" tickets in ${opts.project}`);
    console.log(`   Interval: ${opts.interval}s | Discord: ${opts.discord} | Desktop: ${opts.desktop}`);
    console.log(`   Press Ctrl+C to stop\n`);
    
    async function check() {
      const result = await jira.searchJira(`project = ${opts.project} AND status = "${status}"`, { maxResults: 50, fields: ['key', 'summary', 'created'] });
      const currentKeys = result.issues.map((i: any) => i.key);
      const state = loadState();
      const lastSeen = state[status] || [];
      const newKeys = currentKeys.filter((k: string) => !lastSeen.includes(k));
      
      if (newKeys.length > 0) {
        console.log(`🆕 New tickets found: ${newKeys.join(', ')}`);
        
        for (const key of newKeys) {
          const issue = result.issues.find((i: any) => i.key === key);
          const summary = issue?.fields?.summary || 'No description';
          const url = `https://${process.env.JIRA_DOMAIN}/browse/${key}`;
          
          const embed = {
            title: `🎫 ${key}: ${summary}`,
            color: 0x6366f1,
            fields: [
              { name: 'Project', value: opts.project, inline: true },
              { name: 'Status', value: status, inline: true },
              { name: 'Link', value: `[View in Jira](${url})` },
            ],
            timestamp: new Date().toISOString(),
          };
          
          if (opts.desktop) {
            desktopNotify('🤖 New "to AI" Ticket!', `${key}: ${summary}`);
          }
          
          if (opts.discord) {
            await discordWebhook(`🎉 New "${status}" ticket!`, embed);
          }
        }
      } else {
        console.log(`⏰ ${new Date().toISOString().slice(11,19)} - No new tickets`);
      }
      
      state[status] = currentKeys;
      saveState(state);
    }
    
    if (opts.once) {
      await check();
      return;
    }
    
    await check();
    setInterval(async () => {
      try {
        await check();
      } catch (e) {
        console.error('Error:', e);
      }
    }, interval);
  });