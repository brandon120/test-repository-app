export function getSandboxCredentials():
  | { token: string; teamId: string; projectId: string }
  | Record<string, never> {
  const token = process.env.SANDBOX_VERCEL_TOKEN ?? process.env.VERCEL_TOKEN;
  const teamId = process.env.SANDBOX_VERCEL_TEAM_ID ?? process.env.VERCEL_TEAM_ID;
  const projectId =
    process.env.SANDBOX_VERCEL_PROJECT_ID ?? process.env.VERCEL_PROJECT_ID;

  if (token && teamId && projectId) {
    return { token, teamId, projectId };
  }

  return {};
}

export function getGitHubToken(explicit?: string | null): string | undefined {
  return explicit ?? process.env.GITHUB_TOKEN ?? undefined;
}
