# Product Forge Coding Agent Platform

Product Forge is a Vercel-deployable web app that runs coding agents in isolated [Vercel Sandbox](https://vercel.com/docs/sandbox) microVMs.

From the UI or API, users can:

1. Start a coding task against a GitHub repository
2. Choose an agent (`cursor`, `claude`, `codex`, `gemini`, `opencode`)
3. Watch logs and streamed agent output
4. Send follow-up instructions
5. Create a merge-ready pull request

---

## How this codebase works

### High-level architecture

- **Frontend (Vite + React)**: `src/components/AgentWorkbench.tsx`
  - Task creation form
  - Task list and detail view
  - Conversation + follow-up UI
  - Log viewer and PR actions
- **API layer (Vercel Functions)**: `api/tasks/**`
  - Creates/list tasks
  - Runs async task processing with `waitUntil`
  - Handles follow-up execution
  - Creates GitHub PRs
- **Task orchestration**: `lib/tasks/processor.ts`
  - Creates/reconnects sandboxes
  - Runs selected agent
  - Commits + pushes changes
  - Updates task status/logs/progress
- **Sandbox runtime**: `lib/sandbox/**`
  - Sandbox creation and bootstrap
  - Agent-specific runners
  - Git operations
  - Package manager detection and dependency install
- **Persistence**: `lib/tasks/store.ts`
  - Uses `@vercel/kv` when configured
  - Falls back to in-memory state for local/no-KV scenarios

---

## Task lifecycle

### 1) Create task

`POST /api/tasks`:

- Validates payload
- Creates a `CodingTask` object in storage
- Starts async execution (`waitUntil(processTask(task.id))`)

### 2) Sandbox setup

`processTask(taskId)` in `lib/tasks/processor.ts`:

- Detects likely project port (Vite -> 5173, else 3000)
- Creates a named sandbox (`task-${taskId}`)
- Clones repository into `/vercel/sandbox/project`
- Optionally installs dependencies
- Creates/switches to generated task branch

### 3) Agent execution

`executeAgentInSandbox(...)` dispatches to an agent runner:

- `lib/sandbox/agents/cursor.ts`
- `lib/sandbox/agents/claude.ts`
- `lib/sandbox/agents/codex.ts`
- `lib/sandbox/agents/gemini.ts`
- `lib/sandbox/agents/opencode.ts`

Agent output is logged and appended to task messages.

### 4) Git push + completion

`pushChangesToBranch(...)`:

- `git add .`
- `git commit -m "<generated message>"`
- `git push origin <branch>`

Task is marked `completed` or `error`.

### 5) Follow-up

`POST /api/tasks/:taskId/continue`:

- Appends user follow-up message
- Reconnects to existing sandbox by **sandbox name** if `keepAlive = true`
- Otherwise creates a new sandbox on the same branch
- Runs another agent cycle and pushes new commits

### 6) Pull request creation

`POST /api/tasks/:taskId/pr`:

- Validates task is complete and has a branch
- Creates PR via GitHub REST API (`lib/github/pr.ts`)
- Saves PR URL to task record

---

## Key directories

```txt
api/
  tasks/
    index.ts                # GET list, POST create task
    [taskId].ts             # GET single task
    [taskId]/continue.ts    # POST follow-up
    [taskId]/pr.ts          # POST create PR

lib/
  tasks/
    types.ts                # Task model/types
    store.ts                # KV/in-memory persistence
    logger.ts               # Structured task logs
    processor.ts            # Main task/follow-up orchestration
    agent-messages.ts       # Agent message helpers
  sandbox/
    creation.ts             # Create/configure sandbox + clone repo
    credentials.ts          # Sandbox + GitHub credential helpers
    agents/                 # Per-agent execution logic
    git.ts                  # Commit/push + shutdown helpers
    commands.ts             # Command wrappers
  github/
    pr.ts                   # PR creation helper

src/
  components/AgentWorkbench.tsx
  types/tasks.ts
```

---

## Environment variables

See `.env.example`. Core variables:

### Required for real end-to-end usage

- `GITHUB_TOKEN`
  - Required to clone private repos, push branches, and create PRs
  - Needs repo write permissions for target repositories
- Agent API keys (depending on selected agent):
  - `CURSOR_API_KEY`
  - `AI_GATEWAY_API_KEY` (Claude/Codex path)
  - `GEMINI_API_KEY`
  - `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`

### Sandbox auth

On Vercel, OIDC is preferred. For explicit credentials/local:

- `SANDBOX_VERCEL_TOKEN`
- `SANDBOX_VERCEL_TEAM_ID`
- `SANDBOX_VERCEL_PROJECT_ID`

### Persistence

Recommended:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

If KV is not set, tasks are in-memory only (not durable across cold starts/redeploys).

### Optional

- `DEFAULT_REPO_URL`
- `MAX_SANDBOX_DURATION` (minutes, default is 60)

---

## API reference

### Create task

`POST /api/tasks`

```json
{
  "prompt": "Add user profile settings page and tests",
  "repoUrl": "https://github.com/your-org/your-repo",
  "selectedAgent": "cursor",
  "selectedModel": "optional-model",
  "keepAlive": true,
  "installDependencies": true,
  "enableBrowser": false,
  "maxDuration": 60
}
```

### List tasks

`GET /api/tasks`

### Get task

`GET /api/tasks/:taskId`

### Continue task

`POST /api/tasks/:taskId/continue`

```json
{
  "message": "Also add accessibility improvements and update docs"
}
```

### Create pull request

`POST /api/tasks/:taskId/pr`

---

## Local development

```bash
npm install
npm run typecheck
npm run build
```

Run frontend only:

```bash
npm run dev
```

Run with Vercel Functions locally:

```bash
npx vercel link
npx vercel env pull .env.local
npm run vercel:dev
```

---

## Deploy on Vercel

1. Connect this GitHub repo to a Vercel project
2. Configure required environment variables
3. Add KV/Redis integration for durable tasks
4. Deploy

`vercel.json` is configured to:

- Build with `npm run build`
- Serve SPA output from `dist`
- Rewrite non-API routes to `index.html`
- Configure `api/**/*.ts` with long max duration and `lib/**` inclusion

---

## Current behavior and limitations

- No user auth/tenancy is implemented yet (single shared task space).
- PR creation currently targets base branch `main`.
- Task persistence is durable only when KV is configured.
- Agent behavior depends on external CLI/tool availability and API key validity.

