import { waitUntil } from "@vercel/functions";
import { createTask, listTasks } from "../../lib/tasks/store.js";
import { processTask } from "../../lib/tasks/processor.js";
import type { AgentType, CreateTaskInput } from "../../lib/tasks/types.js";

const AGENTS: AgentType[] = ["claude", "cursor", "codex", "gemini", "opencode"];

function isAgentType(value: string): value is AgentType {
  return AGENTS.includes(value as AgentType);
}

export async function GET() {
  const tasks = await listTasks();
  return Response.json({ tasks });
}

export async function POST(req: Request) {
  let body: Partial<CreateTaskInput>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.prompt?.trim()) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  if (!body.selectedAgent || !isAgentType(body.selectedAgent)) {
    return Response.json(
      { error: `selectedAgent must be one of: ${AGENTS.join(", ")}` },
      { status: 400 },
    );
  }

  const task = await createTask({
    prompt: body.prompt.trim(),
    repoUrl: body.repoUrl?.trim() ?? "",
    selectedAgent: body.selectedAgent,
    selectedModel: body.selectedModel,
    keepAlive: body.keepAlive ?? true,
    installDependencies: body.installDependencies ?? true,
    enableBrowser: body.enableBrowser ?? false,
    maxDuration: body.maxDuration,
  });

  waitUntil(
    processTask(task.id).catch((error) => {
      console.error(`Task ${task.id} failed:`, error);
    }),
  );

  return Response.json({ task }, { status: 201 });
}
