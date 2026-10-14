import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  determineImageTags,
  formatGitHubOutput,
  type ImageTagPlan,
} from "./image-tags.mts";

function git(repository: string, args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
  }).trim();
}

function splitLines(value: string): string[] {
  if (value.length === 0) return [];

  return value.split("\n");
}

function versionPointedAt(tags: readonly string[]): string {
  for (const tag of tags) {
    if (tag.startsWith("v")) return tag.slice(1);
  }

  return "";
}

function latestReleaseVersion(tags: readonly string[]): string {
  for (const tag of tags) {
    if (/^v[0-9]/.test(tag)) return tag.slice(1);
  }

  return "";
}

function readExactTag(repository: string): string {
  try {
    return git(repository, ["describe", "--tags", "--exact-match", "HEAD"]);
  } catch {
    return "";
  }
}

export function selectImageTagsFromGit(
  repository: string,
  image: string,
  expectedSha: string,
  versionInput: string,
): ImageTagPlan {
  const headSha = git(repository, ["rev-parse", "HEAD"]);
  const exactTag = versionInput.length > 0 ? readExactTag(repository) : "";
  const pointedAt = git(repository, ["tag", "--points-at", headSha]);
  const sortedTags = git(repository, ["tag", "--sort=-version:refname"]);

  return determineImageTags({
    image,
    headSha,
    expectedSha,
    versionInput,
    exactTag,
    versionFromTags: versionPointedAt(splitLines(pointedAt)),
    latestVersion: latestReleaseVersion(splitLines(sortedTags)),
  });
}

function envOrEmpty(name: string): string {
  return process.env[name] ?? "";
}

function requireEnv(name: string): string {
  const value = envOrEmpty(name);

  if (value.length === 0) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function main(): void {
  try {
    const plan = selectImageTagsFromGit(
      process.cwd(),
      requireEnv("IMAGE"),
      envOrEmpty("EXPECTED_SHA"),
      envOrEmpty("VERSION_INPUT"),
    );

    appendFileSync(requireEnv("GITHUB_OUTPUT"), formatGitHubOutput(plan));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];

  if (entry === undefined) return false;

  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isDirectRun()) {
  main();
}
