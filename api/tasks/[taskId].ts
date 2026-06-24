import { getTask } from "../../lib/tasks/store.js";

export async function GET(
  _req: Request,
  context: { params: { taskId: string } },
) {
  const taskId = context.params.taskId;
  const task = await getTask(taskId);

  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  return Response.json({ task });
}
