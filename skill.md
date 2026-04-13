# Jira Manager CLI

CLI to manage your Jira projects, issues, and search.

## Setup

```bash
cd jira-manager
npm install
npm run build
```

Configure `.env`:
```
JIRA_EMAIL=your@email.com
JIRA_API_TOKEN=your_api_token
JIRA_DOMAIN=yourcompany.atlassian.net
```

## Commands

### Issues

```bash
# List issues (minimal tokens)
jira issue list -p PROJECT_KEY
jira issue list -p COR -l 10

# Specific fields only
jira issue list -p COR -f key,summary,status

# By status
jira issue list -p COR -s "To Do"

# Create issue
jira issue create -p COR -s "Summary" -d "Description"

# Update issue
jira issue update -k COR-1 -s "New summary"

# Transition status
jira issue update -k COR-1 -S "Done"

# Add comment
jira issue comment -k COR-1 -m "Comment text"
```

### Projects

```bash
# List projects (minimal)
jira project list -m
jira project list
```

### Search

```bash
# JQL search
jira search -q "assignee = currentUser() AND status = Open"
jira search -q "project = COR ORDER BY created DESC" -l 50
```

## Options

| Flag | Description |
|------|-------------|
| `-p, --project` | Project key |
| `-s, --status` | Status |
| `-S, --status` | Set status (transition) |
| `-l, --limit` | Max results |
| `-f, --fields` | Fields to return (key,summary,status,assignee,created) |
| `-m, --minimal` | Minimal output |