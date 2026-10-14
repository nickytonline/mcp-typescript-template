export interface ImageTagFacts {
  image: string;
  headSha: string;
  expectedSha: string;
  versionInput: string;
  exactTag: string;
  versionFromTags: string;
  latestVersion: string;
}

export interface ImageTagPlan {
  tags: readonly string[];
  sourceSha: string;
  updateLatest: boolean;
}

/**
 * Selects GHCR tags for the commit a release workflow validated.
 *
 * Automatic publishes omit `:latest` from the build. The workflow applies it
 * after the push, and only while this commit is still the tip of main, so an
 * older in-flight build cannot move `:latest` backward.
 */
export function determineImageTags(facts: ImageTagFacts): ImageTagPlan {
  if (facts.expectedSha.length > 0 && facts.headSha !== facts.expectedSha) {
    throw new Error(
      `checked out ${facts.headSha}, expected ${facts.expectedSha}`,
    );
  }

  const version =
    facts.versionInput.length > 0 ? facts.versionInput : facts.versionFromTags;

  if (
    facts.versionInput.length > 0 &&
    facts.exactTag !== `v${facts.versionInput}`
  ) {
    const actual =
      facts.exactTag.length > 0 ? facts.exactTag : "an untagged commit";

    throw new Error(`checked out ${actual}, expected v${facts.versionInput}`);
  }

  const qualifiesForLatest =
    version.length === 0 || version === facts.latestVersion;

  const automatic = facts.expectedSha.length > 0;
  const tags: string[] = [];
  let updateLatest = false;

  if (automatic) {
    updateLatest = qualifiesForLatest;
  } else if (qualifiesForLatest) {
    tags.push(`${facts.image}:latest`);
  }

  tags.push(`${facts.image}:sha-${facts.headSha}`);

  if (version.length > 0) {
    tags.push(`${facts.image}:${version}`);
  }

  return {
    tags,
    sourceSha: facts.headSha,
    updateLatest,
  };
}

export function formatGitHubOutput(plan: ImageTagPlan): string {
  const lines = ["tags<<EOF"];

  for (const tag of plan.tags) {
    lines.push(tag);
  }

  lines.push("EOF");
  lines.push(`source_sha=${plan.sourceSha}`);
  lines.push(`update_latest=${plan.updateLatest ? "true" : "false"}`);
  lines.push("");

  return lines.join("\n");
}
