import dotenv from 'dotenv';
dotenv.config();

const baseUrl = `https://${process.env.JIRA_DOMAIN}/rest/api/3`;
const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');

async function request(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

export default {
  async searchJira(jql: string, options: { maxResults?: number; fields?: string[] } = {}) {
    const fields = options.fields?.join(',') || 'summary,status,assignee,created';
    const params = new URLSearchParams({
      jql,
      maxResults: String(options.maxResults || 50),
      fields,
    });
    return request(`/search/jql?${params}`);
  },

  async createIssue(data: { projectKey: string; summary: string; description?: string; issueType?: string; priority?: string }) {
    return request('/issue', {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          project: { key: data.projectKey },
          summary: data.summary,
          description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: data.description || '' }] }] },
          issuetype: { name: data.issueType || 'Task' },
          priority: { name: data.priority || 'Medium' },
        },
      }),
    });
  },

  async updateIssue(issueKey: string, data: { fields?: any; transition?: { id: string } }) {
    if (data.fields) {
      await request(`/issue/${issueKey}`, {
        method: 'PUT',
        body: JSON.stringify({ fields: data.fields }),
      });
    }
    if (data.transition) {
      await request(`/issue/${issueKey}/transitions`, {
        method: 'POST',
        body: JSON.stringify({ transition: data.transition }),
      });
    }
  },

  async listTransitions(issueKey: string) {
    return request(`/issue/${issueKey}/transitions`);
  },

  async transitionIssue(issueKey: string, transition: { id: string }) {
    return request(`/issue/${issueKey}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ transition }),
    });
  },

  async addComment(issueKey: string, comment: { body: string }) {
    return request(`/issue/${issueKey}/comment`, {
      method: 'POST',
      body: JSON.stringify({
        body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: comment.body }] }] },
      }),
    });
  },

  async addAttachment(issueKey: string, file: any, filename: string) {
    const formData = new FormData();
    formData.append('file', new Blob([file]), filename);
    return request(`/issue/${issueKey}/attachments`, {
      method: 'POST',
      body: formData as any,
    });
  },

  async listProjects() {
    return request('/project');
  },

  async getVersions(projectKey: string) {
    return request(`/project/${projectKey}/versions`);
  },

  async getProjectComponents(projectKey: string) {
    return request(`/project/${projectKey}/components`);
  },

  async getAllBoards(projectKey?: string) {
    const params = projectKey ? `?projectKeyOrId=${projectKey}` : '';
    return request(`/agrest/1.0/board${params}`);
  },

  async getSprints(boardId: string, state?: string) {
    const params = state ? `?state=${state}` : '';
    return request(`/agrest/1.0/board/${boardId}/sprint${params}`);
  },

  async searchUsers(query: string, maxResults: number = 50) {
    const params = new URLSearchParams({ query, maxResults: String(maxResults) });
    return request(`/users/search?${params}`);
  },
};