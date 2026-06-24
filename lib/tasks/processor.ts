import { Sandbox } from "@vercel/sandbox";
import { createSandbox } from "../sandbox/creation.js";
import { executeAgentInSandbox } from "../sandbox/agents/index.js";
import { pushChangesToBranch, shutdownSandbox } from "../sandbox/git.js";
import { unregisterSandbox } from "../sandbox/sandbox-registry.js";
import { detectPortFromRepo } from "../sandbox/port-detection.js";
import { getSandboxCredentials, getGitHubToken } from "../sandbox/credentials.js";
import { createTaskLogger } from "./logger.js";
import {
  appendMessage,
  getTask,
  updateTask,
} from "./store.js";
import type { AgentType, CodingTask } from "./types.js";
import { generateId } from "../utils/id.js";

function sanitizePrompt(prompt: string): string {
  return prompt
    .replace(/`/g, "'")
    .replace(/\$/g, "")
    .replace(/\\/g, "")
    .replace(/^-/gm, " -");
}

function createCommitMessage(prompt: string): string {
  const summary = prompt.trim().replace(/\s+/g, " ").slice(0, 72);
  return `feat: ${summary}`;
}

async function isTaskStopped(taskId: string): Promise<boolean> {
  const task = await getTask(taskId);
  return task?.status === "stopped";
}

async function runAgentCycle(options: {
  task: CodingTask;
  prompt: string;
  sandbox: Sandbox;
  isResumed: boolean;
  sessionId?: string;
  includeHistory?: boolean;
}) {
  const { task, sandbox, isResumed, sessionId, includeHistory } = options;
  const logger = createTaskLogger(task.id);
  let prompt = options.prompt;

  if (includeHistory && task.messages.length > 0) {
    const history = task.messages
      .slice(-5)
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n\n");
    prompt = `Previous conversation:\n${history}\n\nNew instruction:\n${prompt}`;
  }

  const agentMessageId = generateId(12);
  const agentResult = await executeAgentInSandbox(
    sandbox,
    sanitizePrompt(prompt),
    task.selectedAgent as AgentType,
    logger,
    task.selectedModel,
    undefined,
    async () => isTaskStopped(task.id),
    undefined,
    isResumed,
    sessionId,
    task.id,
    agentMessageId,
  );

  if (agentResult.sessionId) {
    await updateTask(task.id, { agentSessionId: agentResult.sessionId });
  }

  if (!agentResult.success) {
    await logger.updateStatus("error", agentResult.error ?? "Agent execution failed");
    throw new Error(agentResult.error ?? "Agent execution failed");
  }

  if (agentResult.agentResponse) {
    await appendMessage(task.id, "agent", agentResult.agentResponse);
  }

  const pushResult = await pushChangesToBranch(
    sandbox,
    task.branchName!,
    createCommitMessage(prompt),
    logger,
  );

  if (pushResult.pushFailed) {
    await logger.updateStatus(
      "error",
      "Changes were committed locally but could not be pushed. Check GITHUB_TOKEN permissions.",
    );
    throw new Error("Failed to push changes to repository");
  }

  return agentResult;
}

export async function processTask(taskId: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  const logger = createTaskLogger(taskId);
  const githubToken = getGitHubToken();

  try {
    await logger.updateStatus("processing", "Preparing coding sandbox...");
    await appendMessage(taskId, "user", task.prompt);

    const port = await detectPortFromRepo(task.repoUrl, githubToken);
    const sandboxResult = await createSandbox(
      {
        taskId,
        repoUrl: task.repoUrl,
        githubToken,
        gitAuthorName: "Product Forge Agent",
        gitAuthorEmail: "agent@users.noreply.github.com",
        timeout: `${task.maxDuration}m`,
        ports: [port, 3000, 5173],
        runtime: "node22",
        resources: { vcpus: 4 },
        taskPrompt: task.prompt,
        selectedAgent: task.selectedAgent,
        selectedModel: task.selectedModel,
        installDependencies: task.installDependencies,
        keepAlive: task.keepAlive,
        enableBrowser: task.enableBrowser,
        preDeterminedBranchName: task.branchName,
        onProgress: async (progress, message) => logger.updateProgress(progress, message),
        onCancellationCheck: async () => isTaskStopped(taskId),
      },
      logger,
    );

    if (!sandboxResult.success || !sandboxResult.sandbox) {
      throw new Error(sandboxResult.error ?? "Failed to create sandbox");
    }

    const sandbox = sandboxResult.sandbox;
    await updateTask(taskId, {
      sandboxName: sandbox.name,
      sandboxUrl: sandboxResult.domain,
      branchName: sandboxResult.branchName ?? task.branchName,
    });

    await logger.updateProgress(50, "Running coding agent in sandbox...");
    await runAgentCycle({
      task: {
        ...task,
        branchName: sandboxResult.branchName ?? task.branchName,
      },
      prompt: task.prompt,
      sandbox,
      isResumed: false,
    });

    if (task.keepAlive) {
      await logger.info("Sandbox kept alive for follow-up instructions.");
    } else {
      unregisterSandbox(taskId);
      await shutdownSandbox(sandbox);
    }

    await logger.updateStatus("completed", "Task completed. Changes pushed to branch.");
    await logger.updateProgress(100, "Ready for review and pull request.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logger.updateStatus("error", message);
    throw error;
  }
}

export async function continueTask(taskId: string, message: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }
  if (!task.branchName) {
    throw new Error("Task does not have a branch to continue from");
  }

  const logger = createTaskLogger(taskId);
  const githubToken = getGitHubToken();
  let sandbox: Sandbox | null = null;
  let isResumedSandbox = false;

  try {
    await logger.updateStatus("processing", "Processing follow-up instruction...");
    await appendMessage(taskId, "user", message);

    if (task.sandboxName && task.keepAlive) {
      try {
        await logger.info("Reconnecting to existing sandbox...");
        sandbox = await Sandbox.get({
          name: task.sandboxName,
          ...getSandboxCredentials(),
        });
        isResumedSandbox = true;
      } catch {
        await logger.info("Could not reconnect to sandbox. Creating a new one.");
      }
    }

    if (!sandbox) {
      const port = await detectPortFromRepo(task.repoUrl, githubToken);
      const sandboxResult = await createSandbox(
        {
          taskId,
          repoUrl: task.repoUrl,
          githubToken,
          gitAuthorName: "Product Forge Agent",
          gitAuthorEmail: "agent@users.noreply.github.com",
          timeout: `${task.maxDuration}m`,
          ports: [port, 3000, 5173],
          runtime: "node22",
          resources: { vcpus: 4 },
          taskPrompt: message,
          selectedAgent: task.selectedAgent,
          selectedModel: task.selectedModel,
          installDependencies: task.installDependencies,
          keepAlive: task.keepAlive,
          enableBrowser: task.enableBrowser,
          preDeterminedBranchName: task.branchName,
          onProgress: async (progress, statusMessage) =>
            logger.updateProgress(progress, statusMessage),
          onCancellationCheck: async () => isTaskStopped(taskId),
        },
        logger,
      );

      if (!sandboxResult.success || !sandboxResult.sandbox) {
        throw new Error(sandboxResult.error ?? "Failed to create sandbox");
      }

      sandbox = sandboxResult.sandbox;
      await updateTask(taskId, {
        sandboxName: sandbox.name,
        sandboxUrl: sandboxResult.domain,
      });
    }

    await runAgentCycle({
      task,
      prompt: message,
      sandbox,
      isResumed: isResumedSandbox,
      sessionId: task.agentSessionId,
      includeHistory: !isResumedSandbox,
    });

    if (!task.keepAlive) {
      unregisterSandbox(taskId);
      await shutdownSandbox(sandbox);
    }

    await logger.updateStatus("completed", "Follow-up completed and changes pushed.");
    await logger.updateProgress(100, "Ready for review and pull request.");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logger.updateStatus("error", errorMessage);
    throw error;
  }
}
