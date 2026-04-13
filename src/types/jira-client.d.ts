declare module 'jira-client' {
  interface JiraApiOptions {
    protocol: string;
    host: string;
    username: string;
    password: string;
    apiVersion: string;
    strictSSL?: boolean;
  }

  interface SearchOptions {
    maxResults?: number;
    startAt?: number;
    fields?: string[];
  }

  class JiraApi {
    constructor(options: JiraApiOptions);
    searchJira(jql: string, options?: SearchOptions): Promise<any>;
    createIssue(issue: any): Promise<any>;
    updateIssue(issueKey: string, issue: any): Promise<any>;
    listTransitions(issueKey: string): Promise<any>;
    transitionIssue(issueKey: string, transition: any): Promise<any>;
    addComment(issueKey: string, comment: any): Promise<any>;
    addAttachment(issueKey: string, file: Buffer, filename: string): Promise<any>;
    listProjects(): Promise<any>;
    getVersions(projectKey: string): Promise<any>;
    getProjectComponents(projectKey: string): Promise<any>;
    searchJql(jql: string, options?: SearchOptions): Promise<any>;
    getAllBoards(projectKeyOrOptions?: any): Promise<any>;
    getSprints(boardId: string, state?: string): Promise<any>;
    searchUsers(query: string, maxResults: number): Promise<any>;
  }

  export default JiraApi;
}