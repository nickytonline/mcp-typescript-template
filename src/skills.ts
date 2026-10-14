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
import { Either, ParseResult, Schema } from "effect";
import { parse as parseYaml } from "yaml";
import { JsonObjectSchema, type JsonValue } from "./lib/json.ts";
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

const FrontmatterName = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(64),
  Schema.pattern(SKILL_NAME_PATTERN),
);

const FrontmatterDescription = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(1024),
);

const MissingDirectory = Schema.Struct({
  code: Schema.Literal("ENOENT"),
});

type SkillFrontmatter = {
  readonly name: string;
  readonly description: string;
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

function requireFrontmatterField(
  value: JsonValue | undefined,
  schema: Schema.Schema<string>,
  message: string,
): string {
  const decoded = ParseResult.decodeUnknownEither(schema)(value);

  if (Either.isLeft(decoded)) {
    throw new Error(message);
  }

  return decoded.right;
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

  const parsed = ParseResult.decodeUnknownEither(JsonObjectSchema)(
    parseYaml(body.slice(0, closing.index)),
  );

  if (Either.isLeft(parsed)) {
    throw new Error("Skill frontmatter must be a YAML mapping");
  }

  const name = requireFrontmatterField(
    parsed.right.name,
    FrontmatterName,
    "Skill frontmatter name must be 1-64 characters of lowercase letters, digits, and single hyphens",
  );

  const description = requireFrontmatterField(
    parsed.right.description,
    FrontmatterDescription,
    "Skill frontmatter must include a 1-1024 character description",
  );

  return { ...parsed.right, name, description };
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
    const mimeType = mimeTypeFor(relativePath);
    const text = bytes.toString("utf8");

    if (
      mimeType !== "application/octet-stream" &&
      !Buffer.from(text, "utf8").equals(bytes)
    ) {
      throw new Error(
        `Skill file ${skillName}/${relativePath} is not valid UTF-8`,
      );
    }

    files.push({
      skillName,
      relativePath,
      uri: skillUri(skillName, relativePath),
      bytes,
      text,
      mimeType,
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

function isMissingDirectory(cause: unknown): boolean {
  return ParseResult.is(MissingDirectory, { onExcessProperty: "ignore" })(
    cause,
  );
}

/** Reads `skills/`. A missing or empty directory means the server publishes no skills. */
export function loadSkillCatalog(root: string): SkillCatalog {
  let directoryEntries;

  try {
    directoryEntries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if (isMissingDirectory(error)) {
      return { entries: [], files: new Map() };
    }

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
export function getSkillsInstructions(
  skillCatalog: SkillCatalog = catalog,
): string {
  const uris = skillCatalog.entries.map((entry) => entry.uri);

  if (uris.length === 0) return "";

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
export function registerSkills(
  server: McpServer,
  skillCatalog: SkillCatalog = catalog,
): void {
  if (skillCatalog.entries.length === 0) return;

  const entriesByUri = new Map(
    skillCatalog.entries.map((entry) => [entry.uri, entry]),
  );

  server.server.registerCapabilities({
    resources: {},
    extensions: { "io.modelcontextprotocol/skills": {} },
  });

  for (const file of skillCatalog.files.values()) {
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
      // The catalog fits in one page. Reject a defined cursor until real pagination exists.
      if (cursor !== undefined) {
        throw invalidParams("Unknown skills/list cursor");
      }

      return {
        resultType: "complete",
        skills: skillCatalog.entries,
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
