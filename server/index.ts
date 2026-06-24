import express from "express";
import path from "node:path";
import {
  continueTaskHandler,
  createPullRequestHandler,
  createTaskHandler,
  getTaskHandler,
  listTasksHandler,
} from "./routes/tasks.js";

const distDir = path.join(process.cwd(), "dist");

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/tasks", listTasksHandler);
app.post("/api/tasks", createTaskHandler);
app.get("/api/tasks/:taskId", getTaskHandler);
app.post("/api/tasks/:taskId/continue", continueTaskHandler);
app.post("/api/tasks/:taskId/pr", createPullRequestHandler);

app.use(express.static(distDir));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.sendFile(path.join(distDir, "index.html"), (error) => {
    if (error) {
      res.status(500).json({ error: "Frontend build not found. Run npm run build." });
    }
  });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Request failed:", error);
  res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

app.listen(port, host, () => {
  console.log(`Product Forge listening on http://${host}:${port}`);
});
