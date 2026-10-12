import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  McpServer,
  ProtocolError,
  ProtocolErrorCode,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { Schema } from "effect";
import { parse as parseYaml } from "yaml";
import { toMcpSchema } from "./lib/mcp-schema.ts";

const CACHE_TTL_MS = 300_000;
const MAX_SKILL_RESOURCES = 512;
const MAX_SKILL_BYTES = 16_777_216;
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Matches a fence line consisting of only "---", tolerating trailing
// whitespace and CRLF line endings so minor formatting slips in a
// hand-edited SKILL.md don't crash catalog loading at startup.
const OPENING_FENCE = /^---[ \t]*\r?\n/;
const CLOSING_FENCE = /\r?\n---[ \t]*\r?\n/;

type SkillResource = {
  uri: string;
  digest: string;
  size: number;
};

type SkillFrontmatter = {
  name: string;
  description: string;
  [key: string]: unknown;
};

type SkillEntry = {
  uri: string;
  frontmatter: SkillFrontmatter;
  resources: SkillResource[];
};

type SkillFile = {
  skillName: string;
  relativePath: string;
  uri: string;
  bytes: Buffer;
  text: string;
  mimeType: string;
  description?: string;
};

type LoadedSkill = {
  entry: SkillEntry;
  files: SkillFile[];
};

type SkillCatalog = {
  entries: SkillEntry[];
  files: Map<string, SkillFile>;
};

const skillsRoot = fileURLToPath(new URL("../skills/", import.meta.url));

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseFrontmatter(document: string): SkillFrontmatter {
  const opening = OPENING_FENCE.exec(document);
  if (!opening) {
    throw new Error("Skill SKILL.md must start with YAML frontmatter");
  }

  const body = document.slice(opening[0].length);
  const closing = CLOSING_FENCE.exec(body);
  if (!closing) {
    throw new Error("Skill SKILL.md has no closing YAML frontmatter marker");
  }

  const parsed = parseYaml(body.slice(0, closing.index));
  if (!isMapping(parsed)) {
    throw new Error("Skill frontmatter must be a YAML mapping");
  }

  const { name, description } = parsed;
  if (
    typeof name !== "string" ||
    name.length < 1 ||
    name.length > 64 ||
    !SKILL_NAME_PATTERN.test(name)
  ) {
    throw new Error(
      "Skill frontmatter name must be 1-64 characters of lowercase letters, digits, and single hyphens",
    );
  }
  if (
    typeof description !== "string" ||
    description.length < 1 ||
    description.length > 1024
  ) {
    throw new Error(
      "Skill frontmatter must include a 1-1024 character description",
    );
  }

  return { ...parsed, name, description };
}

function mimeTypeFor(relativePath: string): string {
  if (relativePath.endsWith(".md")) return "text/markdown";
  if (relativePath.endsWith(".json")) return "application/json";
  if (relativePath.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

function skillUri(skillName: string, relativePath: string): string {
  return `skill://${skillName}/${relativePath}`;
}

function collectSkillFiles(
  directory: string,
  skillName: string,
  prefix = "",
  files: SkillFile[] = [],
): SkillFile[] {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    if (entry.name.startsWith(".")) continue;

    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSkillFiles(path, skillName, relativePath, files);
      continue;
    }
    if (!entry.isFile()) continue;

    const bytes = readFileSync(path);
    files.push({
      skillName,
      relativePath,
      uri: skillUri(skillName, relativePath),
      bytes,
      text: bytes.toString("utf8"),
      mimeType: mimeTypeFor(relativePath),
    });
  }
  return files;
}

function loadSkill(directoryName: string, directory: string): LoadedSkill {
  const files = collectSkillFiles(directory, directoryName);
  const skillFile = files.find((file) => file.relativePath === "SKILL.md");
  if (!skillFile) {
    throw new Error(`Skill directory ${directoryName} must contain SKILL.md`);
  }

  const frontmatter = parseFrontmatter(skillFile.text);
  if (frontmatter.name !== directoryName) {
    throw new Error(
      `Skill name ${frontmatter.name} must match its directory name ${directoryName}`,
    );
  }
  skillFile.description = frontmatter.description;

  if (files.length > MAX_SKILL_RESOURCES) {
    throw new Error(
      `Skill ${directoryName} has ${files.length} files, above the ${MAX_SKILL_RESOURCES} file limit`,
    );
  }

  const totalBytes = files.reduce(
    (sum, file) => sum + file.bytes.byteLength,
    0,
  );
  if (totalBytes > MAX_SKILL_BYTES) {
    throw new Error(
      `Skill ${directoryName} is ${totalBytes} bytes, above the ${MAX_SKILL_BYTES} byte limit`,
    );
  }

  const resources = files
    .slice()
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    .map((file) => ({
      uri: file.uri,
      digest: `sha256:${createHash("sha256").update(file.bytes).digest("hex")}`,
      size: file.bytes.byteLength,
    }));

  return {
    entry: {
      uri: skillUri(directoryName, "SKILL.md"),
      frontmatter,
      resources,
    },
    files,
  };
}

function loadSkillCatalog(root: string): SkillCatalog {
  let directoryEntries;
  try {
    directoryEntries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read skills directory ${root}: ${message}`);
  }

  const skills = directoryEntries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => loadSkill(entry.name, join(root, entry.name)));

  return {
    entries: skills.map((skill) => skill.entry),
    files: new Map(
      skills.flatMap((skill) => skill.files.map((file) => [file.uri, file])),
    ),
  };
}

const catalog = loadSkillCatalog(skillsRoot);
const entriesByUri = new Map(
  catalog.entries.map((entry) => [entry.uri, entry]),
);
const listSkillsParams = toMcpSchema(
  Schema.Struct({ cursor: Schema.optional(Schema.String) }),
);
const getSkillParams = toMcpSchema(Schema.Struct({ uri: Schema.String }));

function invalidParams(message: string): ProtocolError {
  return new ProtocolError(ProtocolErrorCode.InvalidParams, message);
}

function readResource(file: SkillFile, uri: URL) {
  if (file.mimeType === "application/octet-stream") {
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: file.mimeType,
          blob: file.bytes.toString("base64"),
        },
      ],
    };
  }
  return {
    contents: [{ uri: uri.href, mimeType: file.mimeType, text: file.text }],
  };
}

/**
 * Server instructions are a discovery fallback for clients that do not
 * implement the Skills extension. Reading a URI returns bytes; the host
 * decides whether to verify, approve, and load a skill.
 */
export function getSkillsInstructions(): string {
  const uris = catalog.entries.map((entry) => entry.uri);
  if (uris.length === 0) {
    return "This server supports the MCP Skills extension. Its skills directory is currently empty.";
  }

  const listed =
    uris.length === 1
      ? uris[0]
      : `${uris.slice(0, -1).join(", ")} and ${uris[uris.length - 1]}`;

  return `Optional agent guidance is available at ${listed}. Clients that support the MCP Skills extension can confirm a skill with skills/get and read it with resources/read. The host remains responsible for trust, approval, and integrity checks before it loads a skill.`;
}

/**
 * Publishes every skill directory under `skills/` and the stable Skills
 * extension methods. Directory reads are intentionally not advertised.
 */
export function registerSkills(server: McpServer): void {
  server.server.registerCapabilities({
    resources: {},
    extensions: { "io.modelcontextprotocol/skills": {} },
  });

  for (const file of catalog.files.values()) {
    const isSkillFile = file.relativePath === "SKILL.md";
    server.registerResource(
      isSkillFile ? file.skillName : `${file.skillName}/${file.relativePath}`,
      file.uri,
      {
        description: file.description,
        mimeType: file.mimeType,
        cacheHint: { ttlMs: CACHE_TTL_MS, cacheScope: "public" },
      },
      async (uri: URL, _ctx: ServerContext) => readResource(file, uri),
    );
  }

  server.server.setRequestHandler(
    "skills/list",
    { params: listSkillsParams },
    async ({ cursor }) => {
      if (cursor !== undefined) {
        throw invalidParams("Unknown skills/list cursor");
      }
      return {
        resultType: "complete",
        skills: catalog.entries,
        ttlMs: CACHE_TTL_MS,
        cacheScope: "public",
      };
    },
  );

  server.server.setRequestHandler(
    "skills/get",
    { params: getSkillParams },
    async ({ uri }) => {
      const skill = entriesByUri.get(uri);
      if (!skill) {
        throw invalidParams(`Unknown skill URI: ${uri}`);
      }
      return {
        resultType: "complete",
        skill,
        ttlMs: CACHE_TTL_MS,
        cacheScope: "public",
      };
    },
  );
}
