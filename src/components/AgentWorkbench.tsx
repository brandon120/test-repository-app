import { useEffect, useMemo, useState } from "react";
import type { AgentType, CodingTask } from "../types/tasks";

const AGENTS: { id: AgentType; label: string }[] = [
  { id: "cursor", label: "Cursor" },
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "gemini", label: "Gemini" },
  { id: "opencode", label: "OpenCode" },
];

const DEFAULT_REPO = "https://github.com/brandon120/test-repository-app";

export default function AgentWorkbench() {
  const [tasks, setTasks] = useState<CodingTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [repoUrl, setRepoUrl] = useState(DEFAULT_REPO);
  const [selectedAgent, setSelectedAgent] = useState<AgentType>("cursor");
  const [keepAlive, setKeepAlive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  async function refreshTasks(selectId?: string) {
    const response = await fetch("/api/tasks");
    if (!response.ok) {
      throw new Error("Failed to load tasks");
    }
    const payload = (await response.json()) as { tasks: CodingTask[] };
    setTasks(payload.tasks);
    if (selectId) {
      setSelectedTaskId(selectId);
    } else if (!selectedTaskId && payload.tasks[0]) {
      setSelectedTaskId(payload.tasks[0].id);
    }
  }

  useEffect(() => {
    refreshTasks().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    });

    const interval = window.setInterval(() => {
      refreshTasks().catch(() => undefined);
    }, 4000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedTaskId) return;
    const interval = window.setInterval(() => {
      fetch(`/api/tasks/${selectedTaskId}`)
        .then((response) => response.json())
        .then((payload: { task: CodingTask }) => {
          setTasks((current) =>
            current.map((task) => (task.id === payload.task.id ? payload.task : task)),
          );
        })
        .catch(() => undefined);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [selectedTaskId]);

  async function handleCreateTask(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          repoUrl,
          selectedAgent,
          keepAlive,
          installDependencies: true,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create task");
      }

      setPrompt("");
      await refreshTasks(payload.task.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFollowUp(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedTask) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/tasks/${selectedTask.id}/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: followUp }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to send follow-up");
      }

      setFollowUp("");
      await refreshTasks(selectedTask.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePr() {
    if (!selectedTask) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/tasks/${selectedTask.id}/pr`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create pull request");
      }
      await refreshTasks(selectedTask.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="workbench">
      <header className="workbench__header">
        <h1>Product Forge Coding Agents</h1>
        <p>
          Spin up Vercel Sandbox workspaces for Cursor, Claude Code, Codex, Gemini,
          and OpenCode. Agents clone your GitHub repo, implement your instructions,
          push a merge-ready branch, and accept follow-ups.
        </p>
      </header>

      <div className="workbench__layout">
        <section className="workbench__panel">
          <h2>New agent task</h2>
          <form className="workbench__form" onSubmit={handleCreateTask}>
            <label>
              <span>Repository URL</span>
              <input
                type="url"
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                required
              />
            </label>

            <label>
              <span>What should the agent build?</span>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={5}
                placeholder="Add a settings page with profile editing and connect it to the API..."
                required
              />
            </label>

            <label>
              <span>Agent</span>
              <select
                value={selectedAgent}
                onChange={(event) => setSelectedAgent(event.target.value as AgentType)}
              >
                {AGENTS.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="workbench__checkbox">
              <input
                type="checkbox"
                checked={keepAlive}
                onChange={(event) => setKeepAlive(event.target.checked)}
              />
              Keep sandbox alive for follow-up instructions
            </label>

            <button type="submit" disabled={loading}>
              {loading ? "Starting..." : "Start coding agent"}
            </button>
          </form>
        </section>

        <section className="workbench__panel">
          <h2>Tasks</h2>
          <div className="workbench__task-list">
            {tasks.length === 0 && <p className="workbench__muted">No tasks yet.</p>}
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className={`workbench__task-card${
                  selectedTaskId === task.id ? " is-active" : ""
                }`}
                onClick={() => setSelectedTaskId(task.id)}
              >
                <strong>{task.title}</strong>
                <span>{task.selectedAgent}</span>
                <em data-status={task.status}>{task.status}</em>
              </button>
            ))}
          </div>
        </section>
      </div>

      {error && <p className="workbench__error">{error}</p>}

      {selectedTask && (
        <section className="workbench__panel workbench__detail">
          <div className="workbench__detail-header">
            <div>
              <h2>{selectedTask.title}</h2>
              <p className="workbench__muted">
                Branch <code>{selectedTask.branchName}</code> · {selectedTask.progress}%
              </p>
            </div>
            <div className="workbench__detail-actions">
              {selectedTask.sandboxUrl && (
                <a href={selectedTask.sandboxUrl} target="_blank" rel="noreferrer">
                  Open sandbox preview
                </a>
              )}
              {selectedTask.status === "completed" && !selectedTask.prUrl && (
                <button type="button" onClick={handleCreatePr} disabled={loading}>
                  Create pull request
                </button>
              )}
              {selectedTask.prUrl && (
                <a href={selectedTask.prUrl} target="_blank" rel="noreferrer">
                  View pull request
                </a>
              )}
            </div>
          </div>

          <div className="workbench__columns">
            <div>
              <h3>Conversation</h3>
              <div className="workbench__messages">
                {selectedTask.messages.map((message) => (
                  <article key={message.id} data-role={message.role}>
                    <strong>{message.role}</strong>
                    <pre>{message.content || "..."}</pre>
                  </article>
                ))}
              </div>

              <form className="workbench__form" onSubmit={handleFollowUp}>
                <label>
                  <span>Follow-up instruction</span>
                  <textarea
                    value={followUp}
                    onChange={(event) => setFollowUp(event.target.value)}
                    rows={4}
                    placeholder="Also add tests and make the form accessible."
                  />
                </label>
                <button type="submit" disabled={loading || selectedTask.status === "processing"}>
                  Send follow-up
                </button>
              </form>
            </div>

            <div>
              <h3>Logs</h3>
              <ol className="workbench__logs">
                {selectedTask.logs.map((log, index) => (
                  <li key={`${log.timestamp}-${index}`} data-type={log.type}>
                    <span>{log.message}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
