import { appendMessage, updateMessage } from "./store.js";

export async function initAgentMessage(
  taskId: string,
  messageId: string,
): Promise<void> {
  await appendMessage(taskId, "agent", "", messageId);
}

export async function setAgentMessage(
  taskId: string,
  messageId: string,
  content: string,
): Promise<void> {
  await updateMessage(taskId, messageId, content).catch((error) => {
    console.error("Failed to update agent message:", error);
  });
}
