# Jira Manager CLI

A powerful CLI tool for managing Jira projects and automating ticket processing with AI research capabilities.

![Node.js](https://img.shields.io/badge/Node.js-20.x-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Vitest](https://img.shields.io/badge/Vitest-tested-brightgreen)

## Overview

Jira Manager provides two main capabilities:

1. **CLI Operations** - Full control over Jira issues, projects, boards, and searches from the command line
2. **AI Worker** - Automated workflow that processes tickets in "To AI" status, researches them using AI agents, and moves them to "To Human" for review

## Architecture

```
jira-manager/
├── src/
│   ├── index.ts              # CLI entry point with Commander.js
│   ├── commands/             # Command modules
│   │   ├── issue.ts          # Issue CRUD operations
│   │   ├── project.ts        # Project operations
│   │   ├── search.ts         # JQL search
│   │   ├── board.ts          # Board operations
│   │   ├── user.ts           # User management
│   │   └── ai-worker.ts      # AI worker process command
│   ├── lib/
│   │   ├── jira.ts           # Jira REST API client
│   │   ├── ai-worker.ts      # Core AI worker logic
│   │   └── notify.ts         # Desktop notifications
│   └── types/
│       └── jira-client.d.ts  # TypeScript definitions
├── tests/
│   └── ai-worker.test.ts     # Comprehensive test suite
└── vitest.config.ts          # Test configuration
```

## Core Components

### 1. Jira API Client (`src/lib/jira.ts`)
- Handles all communication with Jira REST API v3
- Manages authentication via Basic auth (email + API token)
- Provides methods for: search, create, update, transition, comment, attachments

### 2. AI Worker (`src/lib/ai-worker.ts`)
The AI worker is designed with **dependency injection** for maximum testability:

```typescript
interface AiWorkerDeps {
  jira: JiraAdapter;        // Jira operations interface
  researcher: TicketResearcher;  // Research logic interface
  notifier: Notifier;       // Notification interface
}
```

**Key Interfaces:**
- `JiraAdapter` - Abstracts Jira operations (search, get, addComment, transition)
- `TicketResearcher` - Abstracts research logic
- `Notifier` - Abstracts notification delivery

**Implementations:**
- `JiraAdapterImpl` - Real Jira API calls
- `TicketResearcherImpl` - Tool-based research (web search, code search, news)
- `AgentResearcher` - Agent-based research using `web-content-harvester`
- `DiscordNotifier` - Discord webhook notifications

### 3. CLI Commands (`src/commands/`)
- **Issue**: list, create, update, comment, attach
- **Project**: list, listVersions, listComponents
- **Search**: JQL search with configurable fields
- **Board**: listBoards, move, stats, watch
- **User**: listUsers
- **Process**: Run AI worker workflow

## Setup

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/andreseagle1927/jira-manager.git
cd jira-manager

# Install dependencies
npm install

# Build TypeScript
npm run build
```

### Configuration

Create a `.env` file in the project root:

```env
JIRA_EMAIL=your@email.com
JIRA_API_TOKEN=your_jira_api_token
JIRA_DOMAIN=yourcompany.atlassian.net
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

**Getting Jira API Token:**
1. Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Create a new API token
3. Use the token in your `.env`

## CLI Usage

### Issue Commands

```bash
# List issues in a project
jira issue list -p COR

# List with filters
jira issue list -p COR -s "In Progress" -l 10

# List specific fields
jira issue list -p COR -f key,summary,status,assignee

# Create an issue
jira issue create -p COR -s "Bug: Login fails" -d "Steps to reproduce..."

# Update issue
jira issue update -k COR-1 -s "New summary"

# Transition status
jira issue update -k COR-1 -S "Done"

# Add comment
jira issue comment -k COR-1 -m "Working on this"
```

### Project Commands

```bash
# List projects
jira project list

# List versions
jira project listVersions -p COR

# List components
jira project listComponents -p COR
```

### Search

```bash
# JQL search
jira search -q "project = COR AND status = 'To Do'"
jira search -q "assignee = currentUser() ORDER BY created DESC"
```

### Board & User

```bash
jira board listBoards -p COR
jira user listUsers
```

## AI Worker Workflow

The AI Worker automates processing tickets that need research:

```
[Ticket in "To AI"] → [Research] → [Add Comment] → [Transition] → [Notify]
```

### How It Works

1. **Find Tickets**: Search for tickets in "To AI" status
2. **Get Details**: Fetch ticket summary and description
3. **Research**: Use AI agent to research the topic
4. **Add Comment**: Post research results as a comment
5. **Transition**: Move ticket to "To Human" status
6. **Notify**: Send Discord notification

### Usage

```bash
# Process tickets (default: To AI → To Human)
jira process

# Custom statuses
jira process -f "In Progress" -t "Done"

# Use tool-based research (fallback when not in opencode)
jira process -m tools

# Dry run (preview without changes)
jira process -d
```

### Integration with opencode

The AI Worker automatically detects when running in opencode's runtime and uses the `web-content-harvester` agent for comprehensive research. When running standalone, it falls back to tool-based research.

```typescript
// In opencode context, use agent-based researcher
if (typeof globalThis.task === 'function') {
  researcher = new AgentResearcher(agentTool);
} else {
  researcher = new TicketResearcherImpl();
}
```

## Testing

### Test Framework
This project uses [Vitest](https://vitest.dev/) - a blazing fast unit testing framework.

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

### Test Coverage

The test suite (`tests/ai-worker.test.ts`) covers **15 tests** across these areas:

#### 1. Text Extraction (`extractTextFromDoc`)
- Extracts text from Atlassian Document Format (ADF)
- Handles null/undefined inputs

```typescript
it('extracts text from doc structure', () => {
  const doc = { content: [{ content: [{ text: 'Line 1' }] }] };
  expect(extractTextFromDoc(doc)).toBe('Line 1');
});
```

#### 2. TicketResearcherImpl
- Returns result when no results found
- Aggregates sources from web search
- Includes code search results in details
- Includes news in summary

#### 3. DiscordNotifier
- Logs to console when no webhook configured
- Sends to webhook when configured

#### 4. processTickets (Integration)
- Processes tickets and returns results
- Handles empty ticket queue
- Uses default statuses
- Calls all dependencies in sequence

#### 5. AgentResearcher
- Calls agent and extracts URLs as sources
- Handles responses without URLs

### Why Dependency Injection?

The AI Worker uses interfaces and constructor injection to make testing easy:

```typescript
// Production - real implementations
const deps = {
  jira: new JiraAdapterImpl(),
  researcher: new AgentResearcher(agentTool),
  notifier: new DiscordNotifier(),
};

// Test - mock implementations
const deps = {
  jira: { searchTickets: vi.fn().mockResolvedValue([...]) },
  researcher: { research: vi.fn().mockResolvedValue({...}) },
  notifier: { send: vi.fn() },
};
```

This allows testing the entire workflow without calling real APIs or external services.

## Development

### Commands

```bash
npm run dev     # Run with tsx (development)
npm run build  # Build TypeScript
npm start      # Run compiled JavaScript
npm test       # Run tests
```

### Adding New Commands

1. Create a new file in `src/commands/`
2. Export Commander command(s)
3. Import and add to `src/index.ts`

```typescript
// src/commands/example.ts
import { Command } from 'commander';

export const example = new Command()
  .name('example')
  .description('Example command')
  .action(() => console.log('Hello!'));
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JIRA_EMAIL` | Yes | Your Jira account email |
| `JIRA_API_TOKEN` | Yes | Jira API token |
| `JIRA_DOMAIN` | Yes | Your Atlassian domain (e.g., `company.atlassian.net`) |
| `DISCORD_WEBHOOK_URL` | No | Discord webhook for notifications |

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## Support

For issues, please open a GitHub issue.