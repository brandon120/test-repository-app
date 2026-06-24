import { getSandboxCredentials } from "./credentials.js";
export function validateEnvironmentVariables(selectedAgent = "claude", githubToken, apiKeys) {
    const errors = [];
    if (selectedAgent === "claude" &&
        !apiKeys?.AI_GATEWAY_API_KEY &&
        !process.env.AI_GATEWAY_API_KEY &&
        !process.env.ANTHROPIC_API_KEY) {
        errors.push("AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY is required for Claude Code.");
    }
    if (selectedAgent === "cursor" && !apiKeys?.CURSOR_API_KEY && !process.env.CURSOR_API_KEY) {
        errors.push("CURSOR_API_KEY is required for Cursor agent.");
    }
    if (selectedAgent === "codex" && !apiKeys?.AI_GATEWAY_API_KEY && !process.env.AI_GATEWAY_API_KEY) {
        errors.push("AI_GATEWAY_API_KEY is required for Codex CLI.");
    }
    if (selectedAgent === "gemini" && !apiKeys?.GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
        errors.push("GEMINI_API_KEY is required for Gemini CLI.");
    }
    if (selectedAgent === "opencode") {
        const hasAiGateway = apiKeys?.AI_GATEWAY_API_KEY || process.env.AI_GATEWAY_API_KEY;
        const hasAnthropic = apiKeys?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
        const hasOpenAi = apiKeys?.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
        if (!hasAiGateway && !hasAnthropic && !hasOpenAi) {
            errors.push("OpenCode requires AI_GATEWAY_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY.");
        }
    }
    const resolvedGithubToken = githubToken ?? process.env.GITHUB_TOKEN;
    if (!resolvedGithubToken) {
        errors.push("GITHUB_TOKEN is required for cloning and pushing repository changes.");
    }
    const credentials = getSandboxCredentials();
    const hasOidc = Boolean(process.env.VERCEL_OIDC_TOKEN);
    if (!credentials.token && !hasOidc) {
        errors.push("Sandbox credentials missing. Set SANDBOX_VERCEL_* vars or deploy on Vercel for OIDC.");
    }
    return {
        valid: errors.length === 0,
        error: errors.length > 0 ? errors.join(", ") : undefined,
    };
}
export function createAuthenticatedRepoUrl(repoUrl, githubToken) {
    const token = githubToken ?? process.env.GITHUB_TOKEN;
    if (!token) {
        return repoUrl;
    }
    try {
        const url = new URL(repoUrl);
        if (url.hostname === "github.com") {
            url.username = token;
            url.password = "x-oauth-basic";
        }
        return url.toString();
    }
    catch {
        return repoUrl;
    }
}
