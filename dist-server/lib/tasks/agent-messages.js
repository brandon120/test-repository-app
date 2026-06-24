import { appendMessage, updateMessage } from "./store.js";
export async function initAgentMessage(taskId, messageId) {
    await appendMessage(taskId, "agent", "", messageId);
}
export async function setAgentMessage(taskId, messageId, content) {
    await updateMessage(taskId, messageId, content).catch((error) => {
        console.error("Failed to update agent message:", error);
    });
}
