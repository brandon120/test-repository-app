import type { LogEntry } from "../tasks/types.js";

export type { LogEntry };

export function redactSensitiveInfo(message: string): string {
  let redacted = message;

  const apiKeyPatterns = [
    /ANTHROPIC_API_KEY[=\s]*["']?(sk-ant-[a-zA-Z0-9_-]{20,})/gi,
    /OPENAI_API_KEY[=\s]*["']?([sk-][a-zA-Z0-9_-]{20,})/gi,
    /GITHUB_TOKEN[=\s]*["']?([gh][phosr]_[a-zA-Z0-9_]{20,})/gi,
    /https:\/\/(gh[phosr]_[a-zA-Z0-9_]{20,})(?::x-oauth-basic)?@github\.com/gi,
    /API_KEY[=\s]*["']?([a-zA-Z0-9_-]{20,})/gi,
    /Bearer\s+([a-zA-Z0-9_-]{20,})/gi,
    /TOKEN[=\s]*["']?([a-zA-Z0-9_-]{20,})/gi,
    /SANDBOX_VERCEL_TEAM_ID[=\s:]*["']?([a-zA-Z0-9_-]{8,})/gi,
    /SANDBOX_VERCEL_PROJECT_ID[=\s:]*["']?([a-zA-Z0-9_-]{8,})/gi,
    /SANDBOX_VERCEL_TOKEN[=\s:]*["']?([a-zA-Z0-9_-]{20,})/gi,
  ];

  apiKeyPatterns.forEach((pattern) => {
    redacted = redacted.replace(pattern, (match, key) => {
      if (match.includes("github.com")) {
        const redactedKey =
          key.length > 8
            ? `${key.substring(0, 4)}${"*".repeat(Math.max(8, key.length - 8))}${key.substring(key.length - 4)}`
            : "*".repeat(key.length);
        return match.replace(key, redactedKey);
      }

      const prefix = match.substring(0, match.indexOf(key));
      const redactedKey =
        key.length > 8
          ? `${key.substring(0, 4)}${"*".repeat(Math.max(8, key.length - 8))}${key.substring(key.length - 4)}`
          : "*".repeat(key.length);
      return `${prefix}${redactedKey}`;
    });
  });

  redacted = redacted.replace(/"(teamId|projectId)"[\s:]*"([^"]+)"/gi, (_match, fieldName) => {
    return `"${fieldName}": "[REDACTED]"`;
  });

  redacted = redacted.replace(
    /([A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD|TEAM_ID|PROJECT_ID)[A-Z_]*)[=\s:]*["']?([a-zA-Z0-9_-]{8,})["']?/gi,
    (_match, varName, value) => {
      const redactedValue =
        value.length > 8
          ? `${value.substring(0, 4)}${"*".repeat(Math.max(8, value.length - 8))}${value.substring(value.length - 4)}`
          : "*".repeat(value.length);
      return `${varName}="${redactedValue}"`;
    },
  );

  return redacted;
}

export function createLogEntry(
  type: LogEntry["type"],
  message: string,
  timestamp?: Date,
): { type: LogEntry["type"]; message: string; timestamp: Date } {
  return {
    type,
    message: redactSensitiveInfo(message),
    timestamp: timestamp ?? new Date(),
  };
}

export function createInfoLog(message: string) {
  return createLogEntry("info", message);
}

export function createCommandLog(command: string, args?: string[]) {
  const fullCommand = args ? `${command} ${args.join(" ")}` : command;
  return createLogEntry("command", `$ ${fullCommand}`);
}

export function createErrorLog(message: string) {
  return createLogEntry("error", message);
}

export function createSuccessLog(message: string) {
  return createLogEntry("success", message);
}
