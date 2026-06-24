/**
 * Fire-and-forget helper for long-running work outside the request lifecycle.
 * Replaces Vercel's waitUntil when running as a persistent Node server.
 */
export function runInBackground(promise: Promise<unknown>): void {
  promise.catch((error) => {
    console.error("Background task failed:", error);
  });
}
