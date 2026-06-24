/**
 * Create a Vercel Sandbox snapshot with agent-browser + Chromium pre-installed.
 *
 * Run once: npm run sandbox:snapshot
 * Then set: AGENT_BROWSER_SNAPSHOT_ID=<snapshot-id>
 */

import "dotenv/config";
import { createSnapshot, getSandboxCredentials } from "../lib/agent-browser-sandbox";

const hasExplicitCreds = !!(
  process.env.VERCEL_TOKEN &&
  process.env.VERCEL_TEAM_ID &&
  process.env.VERCEL_PROJECT_ID
);
const hasOidc = !!process.env.VERCEL_OIDC_TOKEN;

if (!hasExplicitCreds && !hasOidc) {
  console.error(
    "Missing sandbox credentials. Provide either:\n" +
      "  1. VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID\n" +
      "  2. VERCEL_OIDC_TOKEN (run via `vercel env pull` after linking the project)",
  );
  process.exit(1);
}

const creds = getSandboxCredentials();
console.log(
  creds.token
    ? `Authenticating with explicit credentials (team: ${creds.teamId})`
    : "Authenticating via VERCEL_OIDC_TOKEN",
);

async function main() {
  console.log("Creating Vercel Sandbox with agent-browser + Chromium...");
  console.log("This takes ~30-60 seconds on first run.\n");

  const snapshotId = await createSnapshot();

  console.log("\nSnapshot created successfully!");
  console.log(`\n  AGENT_BROWSER_SNAPSHOT_ID=${snapshotId}\n`);
  console.log("Add this to your .env.local or Vercel project environment variables.");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Failed to create snapshot:", message);
  process.exit(1);
});
