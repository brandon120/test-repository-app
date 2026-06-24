import { kv } from "@vercel/kv";
import { Redis } from "ioredis";
import { generateId } from "../utils/id.js";
const TASK_INDEX_KEY = "coding-tasks:index";
const taskKey = (id) => `coding-tasks:${id}`;
const memoryTasks = new Map();
const memoryIndex = [];
let redisClient = null;
function hasKv() {
    return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}
function hasRedisUrl() {
    return Boolean(process.env.REDIS_URL);
}
function getRedis() {
    if (!redisClient) {
        redisClient = new Redis(process.env.REDIS_URL, {
            maxRetriesPerRequest: 3,
            lazyConnect: true,
        });
    }
    return redisClient;
}
function storageBackend() {
    if (hasKv())
        return "kv";
    if (hasRedisUrl())
        return "redis";
    return "memory";
}
function defaultRepoUrl() {
    return (process.env.DEFAULT_REPO_URL ??
        process.env.PRODUCT_FORGE_REPO_URL ??
        "https://github.com/brandon120/test-repository-app");
}
export function createBranchName(taskId, prompt) {
    const slug = prompt
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);
    return `agent/${slug || "task"}-${taskId.slice(0, 6)}`;
}
export function createFallbackTitle(prompt) {
    const trimmed = prompt.trim();
    return trimmed.length > 72 ? `${trimmed.slice(0, 69)}...` : trimmed;
}
async function readIndex() {
    const backend = storageBackend();
    if (backend === "memory")
        return [...memoryIndex];
    if (backend === "redis") {
        const raw = await getRedis().get(TASK_INDEX_KEY);
        return raw ? JSON.parse(raw) : [];
    }
    const ids = await kv.get(TASK_INDEX_KEY);
    return ids ?? [];
}
async function writeIndex(ids) {
    const backend = storageBackend();
    if (backend === "memory") {
        memoryIndex.splice(0, memoryIndex.length, ...ids);
        return;
    }
    if (backend === "redis") {
        await getRedis().set(TASK_INDEX_KEY, JSON.stringify(ids));
        return;
    }
    await kv.set(TASK_INDEX_KEY, ids);
}
export async function createTask(input) {
    const id = generateId(12);
    const now = new Date().toISOString();
    const task = {
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
    const backend = storageBackend();
    if (backend === "kv") {
        await kv.set(taskKey(id), task);
        const ids = await readIndex();
        await writeIndex([id, ...ids.filter((existing) => existing !== id)]);
    }
    else if (backend === "redis") {
        await getRedis().set(taskKey(id), JSON.stringify(task));
        const ids = await readIndex();
        await writeIndex([id, ...ids.filter((existing) => existing !== id)]);
    }
    else {
        memoryTasks.set(id, task);
        memoryIndex.unshift(id);
    }
    return task;
}
export async function getTask(id) {
    const backend = storageBackend();
    if (backend === "kv") {
        return (await kv.get(taskKey(id))) ?? null;
    }
    if (backend === "redis") {
        const raw = await getRedis().get(taskKey(id));
        return raw ? JSON.parse(raw) : null;
    }
    return memoryTasks.get(id) ?? null;
}
export async function listTasks() {
    const ids = await readIndex();
    const tasks = await Promise.all(ids.map((id) => getTask(id)));
    return tasks.filter((task) => task !== null);
}
export async function updateTask(id, patch) {
    const current = await getTask(id);
    if (!current)
        return null;
    const next = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    const backend = storageBackend();
    if (backend === "kv") {
        await kv.set(taskKey(id), next);
    }
    else if (backend === "redis") {
        await getRedis().set(taskKey(id), JSON.stringify(next));
    }
    else {
        memoryTasks.set(id, next);
    }
    return next;
}
export async function appendLog(id, entry) {
    const task = await getTask(id);
    if (!task)
        return;
    await updateTask(id, { logs: [...task.logs, entry] });
}
export async function appendMessage(taskId, role, content, messageId = generateId(12)) {
    const task = await getTask(taskId);
    if (!task) {
        throw new Error(`Task ${taskId} not found`);
    }
    const message = {
        id: messageId,
        role,
        content,
        createdAt: new Date().toISOString(),
    };
    await updateTask(taskId, { messages: [...task.messages, message] });
    return message;
}
export async function updateMessage(taskId, messageId, content) {
    const task = await getTask(taskId);
    if (!task)
        return;
    const messages = task.messages.map((message) => message.id === messageId ? { ...message, content } : message);
    await updateTask(taskId, { messages });
}
