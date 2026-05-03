const { spawnSync } = require("child_process");

const DEFAULT_MESSAGE = "Add new Circadia post";
const ALLOWED_PREFIXES = ["_posts/", "images/", "videos/"];

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  if (result.error) {
    console.error(`Failed to run git ${args.join(" ")}: ${result.error.message}`);
    process.exit(1);
  }

  return result;
}

function exitWithGitError(action, result) {
  console.error(`Unable to ${action}.`);

  if (result.stdout && result.stdout.trim()) {
    console.error(result.stdout.trim());
  }

  if (result.stderr && result.stderr.trim()) {
    console.error(result.stderr.trim());
  }

  process.exit(1);
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").trim();
}

function isAllowedPath(filePath) {
  const normalized = normalizePath(filePath);
  return ALLOWED_PREFIXES.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix));
}

function parseStatusPaths(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const pathPart = line.slice(3);
      const renamedParts = pathPart.split(" -> ");
      return normalizePath(renamedParts[renamedParts.length - 1]);
    });
}

const message = process.argv.slice(2).join(" ").trim() || DEFAULT_MESSAGE;

const repoCheck = runGit(["rev-parse", "--is-inside-work-tree"]);
if (repoCheck.status !== 0 || repoCheck.stdout.trim() !== "true") {
  exitWithGitError("verify that the current directory is a git repository", repoCheck);
}

const allChanges = runGit(["status", "--porcelain=v1", "--untracked-files=all"]);
if (allChanges.status !== 0) {
  exitWithGitError("check for changed files", allChanges);
}

const changedLines = allChanges.stdout.trim();
if (!changedLines) {
  console.error("No changed files found. Nothing to publish.");
  process.exit(1);
}

const publishableChanges = runGit([
  "status",
  "--porcelain=v1",
  "--untracked-files=all",
  "--",
  "_posts",
  "images",
  "videos"
]);

if (publishableChanges.status !== 0) {
  exitWithGitError("check for post, image, and video changes", publishableChanges);
}

const publishablePaths = parseStatusPaths(publishableChanges.stdout);
if (publishablePaths.length === 0) {
  console.error("No changes found in _posts/, images/, or videos/. Nothing to publish.");
  process.exit(1);
}

const stagedFiles = runGit(["diff", "--cached", "--name-only"]);
if (stagedFiles.status !== 0) {
  exitWithGitError("inspect staged files", stagedFiles);
}

const blockedStagedFiles = stagedFiles.stdout
  .split(/\r?\n/)
  .map(normalizePath)
  .filter(Boolean)
  .filter((filePath) => !isAllowedPath(filePath));

if (blockedStagedFiles.length > 0) {
  console.error("Refusing to commit because unrelated files are already staged:");
  for (const filePath of blockedStagedFiles) {
    console.error(`- ${filePath}`);
  }
  console.error("Unstage or commit those files separately, then run publishpost again.");
  process.exit(1);
}

console.log("Publishing the following changed paths:");
for (const filePath of publishablePaths) {
  console.log(`- ${filePath}`);
}

const addResult = runGit(["add", "_posts", "images", "videos"]);
if (addResult.status !== 0) {
  exitWithGitError("stage _posts/, images/, and videos/", addResult);
}

const commitResult = runGit(["commit", "-m", message]);
if (commitResult.status !== 0) {
  exitWithGitError("create the commit", commitResult);
}

console.log(`Created commit with message: "${message}"`);
if (commitResult.stdout && commitResult.stdout.trim()) {
  console.log(commitResult.stdout.trim());
}
