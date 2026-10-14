import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { selectImageTagsFromGit } from "./determine-image-tags.mts";
import {
  determineImageTags,
  formatGitHubOutput,
  type ImageTagFacts,
} from "./image-tags.mts";

const image = "ghcr.io/example/app";
const repositories: string[] = [];

afterEach(() => {
  for (const repository of repositories.splice(0)) {
    rmSync(repository, { recursive: true, force: true });
  }
});

function facts(overrides: Partial<ImageTagFacts>): ImageTagFacts {
  return {
    image,
    headSha: "aaa",
    expectedSha: "",
    versionInput: "",
    exactTag: "",
    versionFromTags: "",
    latestVersion: "",
    ...overrides,
  };
}

function git(repository: string, args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  }).trim();
}

function initRepository(): string {
  const repository = mkdtempSync(join(tmpdir(), "image-tags-"));

  repositories.push(repository);
  git(repository, ["init", "-b", "main"]);
  git(repository, ["commit", "--allow-empty", "-m", "init"]);

  return repository;
}

function commit(repository: string, message: string): string {
  git(repository, ["commit", "--allow-empty", "-m", message]);

  return git(repository, ["rev-parse", "HEAD"]);
}

describe("determineImageTags", () => {
  it("rejects a checkout that is not the release commit", () => {
    expect(() =>
      determineImageTags(
        facts({
          headSha: "newer",
          expectedSha: "release",
        }),
      ),
    ).toThrow("checked out newer, expected release");
  });

  it("rejects a manual version that is not the checked-out tag", () => {
    expect(() =>
      determineImageTags(
        facts({
          versionInput: "1.2.3",
          exactTag: "v9.9.9",
        }),
      ),
    ).toThrow("checked out v9.9.9, expected v1.2.3");
  });

  it("publishes the release commit after main has moved", () => {
    const plan = determineImageTags(
      facts({
        headSha: "release",
        expectedSha: "release",
        versionFromTags: "2.0.0",
        latestVersion: "2.0.0",
      }),
    );

    expect(plan.tags).toEqual([`${image}:sha-release`, `${image}:2.0.0`]);
    expect(plan.updateLatest).toBe(true);
    expect(plan.sourceSha).toBe("release");
  });

  it("does not move latest for an automatic publish of an older version", () => {
    const plan = determineImageTags(
      facts({
        headSha: "old",
        expectedSha: "old",
        versionFromTags: "1.0.0",
        latestVersion: "2.0.0",
      }),
    );

    expect(plan.tags).toEqual([`${image}:sha-old`, `${image}:1.0.0`]);
    expect(plan.updateLatest).toBe(false);
  });

  it("asks for a latest update when an untagged commit is published automatically", () => {
    const plan = determineImageTags(
      facts({
        headSha: "deps",
        expectedSha: "deps",
        latestVersion: "2.0.0",
      }),
    );

    expect(plan.tags).toEqual([`${image}:sha-deps`]);
    expect(plan.updateLatest).toBe(true);
  });

  it("includes latest while manually publishing the newest version", () => {
    const plan = determineImageTags(
      facts({
        headSha: "release",
        versionInput: "2.0.0",
        exactTag: "v2.0.0",
        latestVersion: "2.0.0",
      }),
    );

    expect(plan.tags).toEqual([
      `${image}:latest`,
      `${image}:sha-release`,
      `${image}:2.0.0`,
    ]);
    expect(plan.updateLatest).toBe(false);
  });

  it("leaves latest unchanged while manually publishing an older version", () => {
    const plan = determineImageTags(
      facts({
        headSha: "old",
        versionInput: "1.0.0",
        exactTag: "v1.0.0",
        latestVersion: "2.0.0",
      }),
    );

    expect(plan.tags).toEqual([`${image}:sha-old`, `${image}:1.0.0`]);
    expect(plan.updateLatest).toBe(false);
  });

  it("includes latest for a manual publish of an untagged ref", () => {
    const plan = determineImageTags(
      facts({
        headSha: "main",
        latestVersion: "2.0.0",
      }),
    );

    expect(plan.tags).toEqual([`${image}:latest`, `${image}:sha-main`]);
    expect(plan.updateLatest).toBe(false);
  });

  it("writes multiline GitHub Actions output", () => {
    const output = formatGitHubOutput({
      tags: [`${image}:sha-abc`, `${image}:1.2.3`],
      sourceSha: "abc",
      updateLatest: true,
    });

    expect(output).toBe(
      [
        "tags<<EOF",
        `${image}:sha-abc`,
        `${image}:1.2.3`,
        "EOF",
        "source_sha=abc",
        "update_latest=true",
        "",
      ].join("\n"),
    );
  });
});

describe("selectImageTagsFromGit", () => {
  it("publishes an earlier commit after later commits land on main", () => {
    const repository = initRepository();
    const release = git(repository, ["rev-parse", "HEAD"]);

    git(repository, ["tag", "v1.9.0", release]);
    const dependabot = commit(repository, "chore: bump one dependency");

    git(repository, ["tag", "v1.10.0", dependabot]);
    commit(repository, "chore: bump another dependency");
    git(repository, ["checkout", "--detach", dependabot]);

    const plan = selectImageTagsFromGit(repository, image, dependabot, "");

    expect(plan.sourceSha).toBe(dependabot);
    expect(plan.tags).toEqual([
      `${image}:sha-${dependabot}`,
      `${image}:1.10.0`,
    ]);
    expect(plan.updateLatest).toBe(true);
    expect(git(repository, ["rev-parse", "main"])).not.toBe(dependabot);
  });

  it("rejects the moving main tip when the release commit was requested", () => {
    const repository = initRepository();
    const release = git(repository, ["rev-parse", "HEAD"]);
    const later = commit(repository, "chore: later");

    expect(() =>
      selectImageTagsFromGit(repository, image, release, ""),
    ).toThrow(`checked out ${later}, expected ${release}`);
  });

  it("writes the GitHub Actions output for the checked-out commit", () => {
    const repository = initRepository();
    const head = git(repository, ["rev-parse", "HEAD"]);
    const outputPath = join(repository, "github-output.txt");

    execFileSync(
      process.execPath,
      [resolve("scripts/determine-image-tags.mts")],
      {
        cwd: repository,
        env: {
          ...process.env,
          IMAGE: image,
          EXPECTED_SHA: head,
          VERSION_INPUT: "",
          GITHUB_OUTPUT: outputPath,
        },
      },
    );

    expect(readFileSync(outputPath, "utf8")).toBe(
      [
        "tags<<EOF",
        `${image}:sha-${head}`,
        "EOF",
        `source_sha=${head}`,
        "update_latest=true",
        "",
      ].join("\n"),
    );
  });
});
