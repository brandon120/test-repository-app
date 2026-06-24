import { kv } from "@vercel/kv";
import type { CodingTask, CreateTaskInput, LogEntry, TaskMessage } from "./types.js";
import { generateId } from "../utils/id.js";

const TASK_INDEX_KEY = "coding-tasks:index";
const taskKey = (id: string) => `coding-tasks:${id}`;

const memoryTasks = new Map<string, CodingTask>();
const memoryIndex: string[] = [];

function hasKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function defaultRepoUrl(): string {
  return (
    process.env.DEFAULT_REPO_URL ??
    process.env.PRODUCT_FORGE_REPO_URL ??
    "https://github.com/brandon120/test-repository-app"
  );
}

export function createBranchName(taskId: string, prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `agent/${slug || "task"}-${taskId.slice(0, 6)}`;
}

export function createFallbackTitle(prompt: string): string {
  const trimmed = prompt.trim();
  return trimmed.length > 72 ? `${trimmed.slice(0, 69)}...` : trimmed;
}

async function readIndex(): Promise<string[]> {
  if (!hasKv()) return [...memoryIndex];
  const ids = await kv.get<string[]>(TASK_INDEX_KEY);
  return ids ?? [];
}

async function writeIndex(ids: string[]): Promise<void> {
  if (!hasKv()) {
    memoryIndex.splice(0, memoryIndex.length, ...ids);
    return;
  }
  await kv.set(TASK_INDEX_KEY, ids);
}

export async function createTask(input: CreateTaskInput): Promise<CodingTask> {
  const id = generateId(12);
  const now = new Date().toISOString();
  const task: CodingTask = {
    id,
    title: createFallbackTitle(input.prompt),
    prompt: input.prompt,
    repoUrl: input.repoUrl || defaultRepoUrl(),
    selectedAgent: input.selectedAgent,
    selectedModel: input.selectedModel,
    status: "pending",
    progress: 0,
    logs: [],
    messages: [],
    branchName: createBranchName(id, input.prompt),
    keepAlive: input.keepAlive ?? true,
    installDependencies: input.installDependencies ?? true,
    enableBrowser: input.enableBrowser ?? false,
    maxDuration: input.maxDuration ?? Number(process.env.MAX_SANDBOX_DURATION ?? 60),
    createdAt: now,
    updatedAt: now,
  };

  if (hasKv()) {
    await kv.set(taskKey(id), task);
    const ids = await readIndex();
    await writeIndex([id, ...ids.filter((existing) => existing !== id)]);
  } else {
    memoryTasks.set(id, task);
    memoryIndex.unshift(id);
  }

  return task;
}

export async function getTask(id: string): Promise<CodingTask | null> {
  if (hasKv()) {
    return (await kv.get<CodingTask>(taskKey(id))) ?? null;
  }
  return memoryTasks.get(id) ?? null;
}

export async function listTasks(): Promise<CodingTask[]> {
  const ids = await readIndex();
  const tasks = await Promise.all(ids.map((id) => getTask(id)));
  return tasks.filter((task): task is CodingTask => task !== null);
}

export async function updateTask(
  id: string,
  patch: Partial<CodingTask>,
): Promise<CodingTask | null> {
  const current = await getTask(id);
  if (!current) return null;

  const next: CodingTask = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  if (hasKv()) {
    await kv.set(taskKey(id), next);
  } else {
    memoryTasks.set(id, next);
  }

  return next;
}

export async function appendLog(id: string, entry: LogEntry): Promise<void> {
  const task = await getTask(id);
  if (!task) return;
  await updateTask(id, { logs: [...task.logs, entry] });
}

export async function appendMessage(
  taskId: string,
  role: TaskMessage["role"],
  content: string,
  messageId = generateId(12),
): Promise<TaskMessage> {
  const task = await getTask(taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  const message: TaskMessage = {
    id: messageId,
    role,
    content,
    createdAt: new Date().toISOString(),
  };

  await updateTask(taskId, { messages: [...task.messages, message] });
  return message;
}

export async function updateMessage(
  taskId: string,
  messageId: string,
  content: string,
): Promise<void> {
  const task = await getTask(taskId);
  if (!task) return;

  const messages = task.messages.map((message) =>
    message.id === messageId ? { ...message, content } : message,
  );
  await updateTask(taskId, { messages });
}
