import { useState } from "react";

type StepEvent = {
  step: string;
  status: "running" | "done" | "error";
  elapsed?: number;
};

type BrowseAction = "screenshot" | "snapshot";

type BrowseResult =
  | { ok: true; title: string; screenshot?: string; snapshot?: string }
  | { ok: false; error: string };

export default function SandboxBrowser() {
  const [url, setUrl] = useState("https://example.com");
  const [action, setAction] = useState<BrowseAction>("screenshot");
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [result, setResult] = useState<BrowseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleBrowse(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setSteps([]);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, action, fullPage: false }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Request failed (${response.status})`);
      }

      if (!response.body) {
        throw new Error("No response stream from sandbox API");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const rawEvent of events) {
          const lines = rawEvent.split("\n");
          const eventType = lines.find((line) => line.startsWith("event: "))?.slice(7);
          const dataLine = lines.find((line) => line.startsWith("data: "))?.slice(6);
          if (!eventType || !dataLine) continue;

          const data = JSON.parse(dataLine) as StepEvent | BrowseResult;

          if (eventType === "step") {
            const step = data as StepEvent;
            setSteps((prev) => {
              const existing = prev.findIndex((item) => item.step === step.step);
              if (existing >= 0) {
                const next = [...prev];
                next[existing] = step;
                return next;
              }
              return [...prev, step];
            });
          }

          if (eventType === "result") {
            const browseResult = data as BrowseResult;
            if (!browseResult.ok) {
              setError(browseResult.error);
            } else {
              setResult(browseResult);
            }
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="sandbox">
      <header className="sandbox__header">
        <h1>Vercel Sandbox Browser</h1>
        <p>
          Run headless Chrome inside an ephemeral Vercel Sandbox microVM via
          agent-browser. Deploy this app to Vercel to use the API.
        </p>
      </header>

      <form className="sandbox__form" onSubmit={handleBrowse}>
        <label className="sandbox__field">
          <span>URL</span>
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com"
            required
          />
        </label>

        <fieldset className="sandbox__actions">
          <legend>Action</legend>
          <label>
            <input
              type="radio"
              name="action"
              value="screenshot"
              checked={action === "screenshot"}
              onChange={() => setAction("screenshot")}
            />
            Screenshot
          </label>
          <label>
            <input
              type="radio"
              name="action"
              value="snapshot"
              checked={action === "snapshot"}
              onChange={() => setAction("snapshot")}
            />
            Accessibility snapshot
          </label>
        </fieldset>

        <button type="submit" disabled={loading}>
          {loading ? "Running in sandbox…" : "Run in sandbox"}
        </button>
      </form>

      {steps.length > 0 && (
        <ol className="sandbox__steps">
          {steps.map((step) => (
            <li key={step.step} data-status={step.status}>
              <span>{step.step}</span>
              {step.elapsed != null && <em>{step.elapsed}ms</em>}
            </li>
          ))}
        </ol>
      )}

      {error && <p className="sandbox__error">{error}</p>}

      {result?.ok && result.screenshot && (
        <figure className="sandbox__result">
          <figcaption>{result.title}</figcaption>
          <img
            src={`data:image/png;base64,${result.screenshot}`}
            alt={`Screenshot of ${result.title}`}
          />
        </figure>
      )}

      {result?.ok && result.snapshot && (
        <div className="sandbox__result">
          <h2>{result.title}</h2>
          <pre>{result.snapshot}</pre>
        </div>
      )}
    </section>
  );
}
