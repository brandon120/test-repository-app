export type AgentType = "claude" | "codex" | "cursor" | "gemini" | "opencode";

export type TaskStatus =
  | "pending"
  | "processing"
  | "completed"
  | "error"
  | "stopped";

export type LogEntry = {
  type: "info" | "command" | "error" | "success";
  message: string;
  timestamp: string;
};

export type TaskMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
  createdAt: string;
};

export type CodingTask = {
  id: string;
  title: string;
  prompt: string;
  repoUrl: string;
  selectedAgent: AgentType;
  selectedModel?: string;
  status: TaskStatus;
  progress: number;
  logs: LogEntry[];
  messages: TaskMessage[];
  branchName?: string;
  sandboxName?: string;
  sandboxUrl?: string;
  agentSessionId?: string;
  keepAlive: boolean;
  installDependencies: boolean;
  enableBrowser: boolean;
  maxDuration: number;
  prUrl?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateTaskInput = {
  prompt: string;
  repoUrl: string;
  selectedAgent: AgentType;
  selectedModel?: string;
  keepAlive?: boolean;
  installDependencies?: boolean;
  enableBrowser?: boolean;
  maxDuration?: number;
};

export type Connector = {
  id: string;
  name: string;
  baseUrl: string;
  status: string;
  type?: string;
  command?: string;
  env?: Record<string, string> | string | null;
  oauthClientSecret?: string | null;
  oauthClientId?: string | null;
};
