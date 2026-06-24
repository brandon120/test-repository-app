import {
  createCommandLog,
  createErrorLog,
  createInfoLog,
  createSuccessLog,
} from "../utils/logging.js";
import { appendLog, updateTask } from "./store.js";
import type { TaskStatus } from "./types.js";

export class TaskLogger {
  constructor(private readonly taskId: string) {}

  async append(type: "info" | "command" | "error" | "success", message: string) {
    const entry =
      type === "info"
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

  async info(message: string) {
    await this.append("info", message);
  }

  async command(message: string) {
    await this.append("command", message);
  }

  async error(message: string) {
    await this.append("error", message);
  }

  async success(message: string) {
    await this.append("success", message);
  }

  async updateProgress(progress: number, message: string) {
    await this.info(message);
    await updateTask(this.taskId, { progress });
  }

  async updateStatus(status: TaskStatus, message?: string) {
    if (message) {
      await this.info(message);
    }
    await updateTask(this.taskId, {
      status,
      errorMessage: status === "error" ? message : undefined,
    });
  }
}

export function createTaskLogger(taskId: string) {
  return new TaskLogger(taskId);
}
