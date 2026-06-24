import { createCommandLog, createErrorLog, createInfoLog, createSuccessLog, } from "../utils/logging.js";
import { appendLog, updateTask } from "./store.js";
export class TaskLogger {
    constructor(taskId) {
        Object.defineProperty(this, "taskId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: taskId
        });
    }
    async append(type, message) {
        const entry = type === "info"
            ? createInfoLog(message)
            : type === "command"
                ? createCommandLog(message)
                : type === "error"
                    ? createErrorLog(message)
                    : createSuccessLog(message);
        await appendLog(this.taskId, {
            type: entry.type,
            message: entry.message,
            timestamp: entry.timestamp.toISOString(),
        });
    }
    async info(message) {
        await this.append("info", message);
    }
    async command(message) {
        await this.append("command", message);
    }
    async error(message) {
        await this.append("error", message);
    }
    async success(message) {
        await this.append("success", message);
    }
    async updateProgress(progress, message) {
        await this.info(message);
        await updateTask(this.taskId, { progress });
    }
    async updateStatus(status, message) {
        if (message) {
            await this.info(message);
        }
        await updateTask(this.taskId, {
            status,
            errorMessage: status === "error" ? message : undefined,
        });
    }
}
export function createTaskLogger(taskId) {
    return new TaskLogger(taskId);
}
