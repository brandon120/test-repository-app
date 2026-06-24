import * as sandbox from "../lib/agent-browser-sandbox";
import type { StepEvent } from "../lib/agent-browser-sandbox";

type BrowseAction = "screenshot" | "snapshot";

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  let body: { url?: string; action?: BrowseAction; fullPage?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url, action, fullPage } = body;

  if (!url) {
    return Response.json({ error: "Provide a 'url'" }, { status: 400 });
  }

  if (!isValidUrl(url)) {
    return Response.json({ error: "URL must be a valid http or https URL" }, { status: 400 });
  }

  if (action !== "screenshot" && action !== "snapshot") {
    return Response.json(
      { error: "Provide 'action' as 'screenshot' or 'snapshot'" },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      const onStep = (step: StepEvent) => {
        send("step", step);
      };

      try {
        if (action === "screenshot") {
          const result = await sandbox.screenshotUrl(url, { fullPage, onStep });
          send("result", { ok: true, ...result });
        } else {
          const result = await sandbox.snapshotUrl(url, {
            interactive: true,
            compact: true,
            onStep,
          });
          send("result", { ok: true, ...result });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Sandbox browse failed:", message);
        send("result", { ok: false, error: message });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
