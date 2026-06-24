/**
 * Run agent-browser inside a Vercel Sandbox.
 *
 * A Linux microVM spins up on demand, runs agent-browser + headless Chrome,
 * and shuts down when done. Set AGENT_BROWSER_SNAPSHOT_ID for sub-second startup.
 */

import { Sandbox } from "@vercel/sandbox";

export type SandboxResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type StepEvent = {
  step: string;
  status: "running" | "done" | "error";
  elapsed?: number;
};

export type OnStep = (event: StepEvent) => void;

const SNAPSHOT_ID = process.env.AGENT_BROWSER_SNAPSHOT_ID;

const CHROMIUM_SYSTEM_DEPS = [
  "nss",
  "nspr",
  "libxkbcommon",
  "atk",
  "at-spi2-atk",
  "at-spi2-core",
  "libXcomposite",
  "libXdamage",
  "libXrandr",
  "libXfixes",
  "libXcursor",
  "libXi",
  "libXtst",
  "libXScrnSaver",
  "libXext",
  "mesa-libgbm",
  "libdrm",
  "mesa-libGL",
  "mesa-libEGL",
  "cups-libs",
  "alsa-lib",
  "pango",
  "cairo",
  "gtk3",
  "dbus-libs",
];

export function getSandboxCredentials():
  | { token: string; teamId: string; projectId: string }
  | Record<string, never> {
  if (
    process.env.VERCEL_TOKEN &&
    process.env.VERCEL_TEAM_ID &&
    process.env.VERCEL_PROJECT_ID
  ) {
    return {
      token: process.env.VERCEL_TOKEN,
      teamId: process.env.VERCEL_TEAM_ID,
      projectId: process.env.VERCEL_PROJECT_ID,
    };
  }
  return {};
}

async function runStep<T>(
  step: string,
  fn: () => Promise<T>,
  onStep?: OnStep,
): Promise<T> {
  const start = Date.now();
  onStep?.({ step, status: "running" });
  try {
    const result = await fn();
    onStep?.({ step, status: "done", elapsed: Date.now() - start });
    return result;
  } catch (err) {
    onStep?.({ step, status: "error", elapsed: Date.now() - start });
    throw err;
  }
}

async function bootstrapSandbox(
  sandbox: InstanceType<typeof Sandbox>,
  onStep?: OnStep,
): Promise<void> {
  await runStep("Installing system dependencies", async () => {
    await sandbox.runCommand("sh", [
      "-c",
      `sudo dnf clean all 2>&1 && sudo dnf install -y --skip-broken ${CHROMIUM_SYSTEM_DEPS.join(" ")} 2>&1 && sudo ldconfig 2>&1`,
    ]);
  }, onStep);

  await runStep("Installing agent-browser", async () => {
    await sandbox.runCommand("npm", ["install", "-g", "agent-browser"]);
    await sandbox.runCommand("npx", ["agent-browser", "install"]);
  }, onStep);
}

async function createSandbox(
  onStep?: OnStep,
): Promise<InstanceType<typeof Sandbox>> {
  const credentials = getSandboxCredentials();

  return runStep(
    SNAPSHOT_ID ? "Booting sandbox from snapshot" : "Creating sandbox",
    async () => {
      if (SNAPSHOT_ID) {
        return Sandbox.create({
          ...credentials,
          source: { type: "snapshot", snapshotId: SNAPSHOT_ID },
          timeout: 120_000,
        });
      }

      const sb = await Sandbox.create({
        ...credentials,
        runtime: "node24",
        timeout: 120_000,
      });
      await bootstrapSandbox(sb, onStep);
      return sb;
    },
    onStep,
  );
}

async function exec(
  sandbox: InstanceType<typeof Sandbox>,
  cmd: string,
  args: string[],
  onStep?: OnStep,
  stepLabel?: string,
): Promise<SandboxResult> {
  const label = stepLabel || `${cmd} ${args.join(" ")}`;

  return runStep(label, async () => {
    const result = await sandbox.runCommand(cmd, args);
    const stdout = await result.stdout();
    const stderr = await result.stderr();

    if (result.exitCode !== 0) {
      throw new Error(
        `Command "${cmd} ${args.join(" ")}" failed (exit ${result.exitCode}): ${stderr || stdout}`,
      );
    }

    return { exitCode: result.exitCode, stdout, stderr };
  }, onStep);
}

export async function screenshotUrl(
  url: string,
  opts: { fullPage?: boolean; onStep?: OnStep } = {},
): Promise<{ screenshot: string; title: string }> {
  const { onStep } = opts;
  const sandbox = await createSandbox(onStep);

  try {
    await exec(sandbox, "agent-browser", ["open", "about:blank"], onStep, "Starting browser");
    await exec(sandbox, "agent-browser", ["open", url], onStep, `Navigating to ${url}`);

    const titleResult = await exec(
      sandbox,
      "agent-browser",
      ["get", "title", "--json"],
      onStep,
      "Getting page title",
    );
    const title = tryParseJson(titleResult.stdout)?.data?.title || url;

    const screenshotArgs = ["screenshot", "--json"];
    if (opts.fullPage) screenshotArgs.push("--full");
    const ssResult = await exec(
      sandbox,
      "agent-browser",
      screenshotArgs,
      onStep,
      "Taking screenshot",
    );
    const ssData = tryParseJson(ssResult.stdout)?.data;
    const screenshotPath = ssData?.path;

    if (!screenshotPath) {
      throw new Error(
        `Screenshot returned no file path. Raw output: ${ssResult.stdout.slice(0, 500)}`,
      );
    }

    const b64Result = await exec(
      sandbox,
      "base64",
      ["-w", "0", screenshotPath],
      onStep,
      "Encoding screenshot",
    );
    const screenshot = b64Result.stdout.trim();

    if (!screenshot) {
      throw new Error("Failed to read screenshot file from sandbox");
    }

    await exec(sandbox, "agent-browser", ["close"], onStep, "Closing browser");

    return { screenshot, title };
  } finally {
    await runStep("Stopping sandbox", () => sandbox.stop(), onStep);
  }
}

export async function snapshotUrl(
  url: string,
  opts: { interactive?: boolean; compact?: boolean; onStep?: OnStep } = {},
): Promise<{ snapshot: string; title: string }> {
  const { onStep } = opts;
  const sandbox = await createSandbox(onStep);

  try {
    await exec(sandbox, "agent-browser", ["open", "about:blank"], onStep, "Starting browser");
    await exec(sandbox, "agent-browser", ["open", url], onStep, `Navigating to ${url}`);

    const titleResult = await exec(
      sandbox,
      "agent-browser",
      ["get", "title", "--json"],
      onStep,
      "Getting page title",
    );
    const title = tryParseJson(titleResult.stdout)?.data?.title || url;

    const snapshotArgs = ["snapshot"];
    if (opts.interactive) snapshotArgs.push("-i");
    if (opts.compact) snapshotArgs.push("-c");
    const snapResult = await exec(
      sandbox,
      "agent-browser",
      snapshotArgs,
      onStep,
      "Taking accessibility snapshot",
    );

    if (!snapResult.stdout.trim()) {
      throw new Error("Snapshot returned empty data");
    }

    await exec(sandbox, "agent-browser", ["close"], onStep, "Closing browser");

    return { snapshot: snapResult.stdout, title };
  } finally {
    await runStep("Stopping sandbox", () => sandbox.stop(), onStep);
  }
}

export async function runCommands(
  commands: string[][],
): Promise<SandboxResult[]> {
  const sandbox = await createSandbox();

  try {
    const results: SandboxResult[] = [];
    for (const args of commands) {
      const result = await exec(sandbox, "agent-browser", args);
      results.push(result);
    }
    return results;
  } finally {
    await sandbox.stop();
  }
}

export async function createSnapshot(): Promise<string> {
  const sandbox = await Sandbox.create({
    ...getSandboxCredentials(),
    runtime: "node24",
    timeout: 300_000,
  });

  await bootstrapSandbox(sandbox);

  const snapshot = await sandbox.snapshot();
  return snapshot.snapshotId;
}

function tryParseJson(str: string): { data?: { title?: string; path?: string } } | null {
  try {
    return JSON.parse(str) as { data?: { title?: string; path?: string } };
  } catch {
    return null;
  }
}
