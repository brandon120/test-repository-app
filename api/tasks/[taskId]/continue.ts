import { waitUntil } from "@vercel/functions";
import { getTask } from "../../../lib/tasks/store.js";
import { continueTask } from "../../../lib/tasks/processor.js";

export async function POST(
  req: Request,
  context: { params: { taskId: string } },
) {
  const taskId = context.params.taskId;
  const task = await getTask(taskId);

  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.message?.trim()) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  waitUntil(
    continueTask(taskId, body.message.trim()).catch((error) => {
      console.error(`Follow-up for task ${taskId} failed:`, error);
    }),
  );

  return Response.json({ success: true });
}
