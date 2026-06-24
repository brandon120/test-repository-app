/**
 * Detect the dev server port from a GitHub repository.
 * Defaults to 5173 for Vite projects and 3000 otherwise.
 */
export async function detectPortFromRepo(repoUrl, githubToken) {
    try {
        const match = repoUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(\.git)?$/);
        if (!match) {
            return 3000;
        }
        const [, owner, repo] = match;
        const parsePackageJson = async (response) => {
            const packageJson = JSON.parse(await response.text());
            return packageJson.dependencies?.vite || packageJson.devDependencies?.vite
                ? 5173
                : 3000;
        };
        const response = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/main/package.json`);
        if (!response.ok) {
            const masterResponse = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/master/package.json`);
            if (!masterResponse.ok) {
                return 3000;
            }
            return parsePackageJson(masterResponse);
        }
        return parsePackageJson(response);
    }
    catch {
        return 3000;
    }
}
