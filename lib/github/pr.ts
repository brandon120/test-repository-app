function parseGitHubRepo(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const url = new URL(repoUrl);
    const [owner, repo] = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

export async function createPullRequest(options: {
  repoUrl: string;
  branchName: string;
  title: string;
  body: string;
}): Promise<{ url: string; number: number }> {
  const token = process.env.GITHUB_TOKEN;
  const parsed = parseGitHubRepo(options.repoUrl);

  if (!token) {
    throw new Error("GITHUB_TOKEN is required to create a pull request");
  }
  if (!parsed) {
    throw new Error("Invalid GitHub repository URL");
  }

  const response = await fetch(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: options.title,
        body: options.body,
        head: options.branchName,
        base: "main",
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to create pull request: ${errorBody}`);
  }

  const payload = (await response.json()) as { html_url: string; number: number };
  return { url: payload.html_url, number: payload.number };
}
