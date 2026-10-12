import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import {
  getSkillsInstructions,
  loadSkillCatalog,
  parseFrontmatter,
  registerSkills,
} from "./skills.ts";

const EXAMPLE_SKILL_URI = "skill://example-server/SKILL.md";

type JsonRpcResponse = {
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
};

let handler: ReturnType<typeof createMcpHandler> | undefined;

beforeEach(() => {
  handler = createMcpHandler(() => {
    const server = new McpServer(
      { name: "test", version: "0.0.0" },
      { instructions: getSkillsInstructions() },
    );
    registerSkills(server);
    return server;
  });
});

afterEach(async () => {
  await handler?.close();
  handler = undefined;
});

async function request(
  method: string,
  params: Record<string, unknown> = {},
  target: NonNullable<typeof handler> | undefined = handler,
): Promise<JsonRpcResponse> {
  if (!target) throw new Error("test handler is not initialized");

  const response = await target.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-method": method,
        "mcp-protocol-version": "2026-07-28",
        ...(typeof params.uri === "string" ? { "mcp-name": params.uri } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params: {
          ...params,
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
            "io.modelcontextprotocol/clientInfo": {
              name: "skills-test",
              version: "0.0.0",
            },
          },
        },
      }),
    }),
  );

  const body = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const dataLine = body.split("\n").find((line) => line.startsWith("data:"));
    if (!dataLine) throw new Error(`Missing SSE data in ${body}`);
    return JSON.parse(dataLine.slice("data:".length).trim()) as JsonRpcResponse;
  }
  return JSON.parse(body) as JsonRpcResponse;
}

describe("example skill extension", () => {
  it("advertises the extension and instructions through server/discover", async () => {
    const response = await request("server/discover");
    expect(response.error).toBeUndefined();
    expect(response.result).toMatchObject({
      resultType: "complete",
      capabilities: {
        resources: {},
        extensions: { "io.modelcontextprotocol/skills": {} },
      },
    });
    expect(response.result?.instructions).toContain(EXAMPLE_SKILL_URI);
  });

  it("lists a complete manifest, gets it by URI, and reads the skill resource", async () => {
    const listResponse = await request("skills/list");
    const listResult = listResponse.result as {
      resultType: string;
      skills: Array<{
        uri: string;
        frontmatter: { name: string; description: string };
        resources: Array<{ uri: string; digest: string; size: number }>;
      }>;
      ttlMs: number;
      cacheScope: string;
    };

    expect(listResult.resultType).toBe("complete");
    expect(listResult.ttlMs).toBe(300_000);
    expect(listResult.cacheScope).toBe("public");
    expect(listResult.skills).toHaveLength(1);

    const skill = listResult.skills[0];
    expect(skill.uri).toBe(EXAMPLE_SKILL_URI);
    expect(skill.frontmatter.name).toBe("example-server");
    expect(skill.frontmatter.description).toContain("echo and elicit_echo");
    expect(skill.resources).toHaveLength(1);
    expect(skill.resources[0]).toMatchObject({ uri: EXAMPLE_SKILL_URI });

    const getResponse = await request("skills/get", { uri: EXAMPLE_SKILL_URI });
    expect(getResponse.result).toMatchObject({
      resultType: "complete",
      skill,
      ttlMs: 300_000,
      cacheScope: "public",
    });

    const readResponse = await request("resources/read", {
      uri: EXAMPLE_SKILL_URI,
    });
    expect(readResponse.result).toMatchObject({
      ttlMs: 300_000,
      cacheScope: "public",
    });
    const contents = (
      readResponse.result?.contents as Array<{ text: string }>
    )[0];
    const bytes = Buffer.from(contents.text, "utf8");
    expect(contents.text).toContain("# Example MCP server");
    expect(skill.resources[0].size).toBe(bytes.byteLength);
    expect(skill.resources[0].digest).toBe(
      `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    );
  });

  it("rejects a skills/list cursor until pagination exists", async () => {
    const response = await request("skills/list", { cursor: "1" });
    expect(response.error?.code).toBe(-32602);
  });

  it("returns invalid params for an unknown skill URI", async () => {
    const response = await request("skills/get", {
      uri: "skill://missing/SKILL.md",
    });
    expect(response.error?.code).toBe(-32602);
  });
});

describe("parseFrontmatter", () => {
  it("parses a standard LF frontmatter block", () => {
    const frontmatter = parseFrontmatter(
      "---\nname: example-server\ndescription: An example skill.\n---\nBody text.",
    );
    expect(frontmatter).toMatchObject({
      name: "example-server",
      description: "An example skill.",
    });
  });

  it("tolerates trailing whitespace on the closing fence line", () => {
    const frontmatter = parseFrontmatter(
      "---\nname: example-server\ndescription: An example skill.\n---   \nBody text.",
    );
    expect(frontmatter).toMatchObject({
      name: "example-server",
      description: "An example skill.",
    });
  });

  it("tolerates CRLF line endings throughout the document", () => {
    const frontmatter = parseFrontmatter(
      "---\r\nname: example-server\r\ndescription: An example skill.\r\n---\r\nBody text.",
    );
    expect(frontmatter).toMatchObject({
      name: "example-server",
      description: "An example skill.",
    });
  });

  it("tolerates CRLF with trailing whitespace on the closing fence line", () => {
    const frontmatter = parseFrontmatter(
      "---\r\nname: example-server\r\ndescription: An example skill.\r\n---  \r\nBody text.",
    );
    expect(frontmatter).toMatchObject({
      name: "example-server",
      description: "An example skill.",
    });
  });

  it("still throws when there is no opening frontmatter marker", () => {
    expect(() => parseFrontmatter("name: example-server\n---\n")).toThrow(
      "Skill SKILL.md must start with YAML frontmatter",
    );
  });

  it("still throws when there is no closing frontmatter marker", () => {
    expect(() => parseFrontmatter("---\nname: example-server\n")).toThrow(
      "Skill SKILL.md has no closing YAML frontmatter marker",
    );
  });
});

describe("skills directory opt-out", () => {
  it("treats a missing or empty skills directory as no published skills", () => {
    const missing = loadSkillCatalog(join(tmpdir(), "skills-do-not-exist"));
    expect(missing.entries).toEqual([]);
    expect(getSkillsInstructions(missing)).toBe("");

    const empty = mkdtempSync(join(tmpdir(), "empty-skills-"));
    try {
      const catalog = loadSkillCatalog(empty);
      expect(catalog.entries).toEqual([]);
      expect(getSkillsInstructions(catalog)).toBe("");
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("rejects a text skill file that is not valid UTF-8", () => {
    const root = mkdtempSync(join(tmpdir(), "bad-utf8-skill-"));
    const skillDir = join(root, "example-server");
    mkdirSync(skillDir);
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: example-server\ndescription: An example skill.\n---\nBody\n",
    );
    writeFileSync(join(skillDir, "notes.md"), Buffer.from([0xff, 0xfe]));
    try {
      expect(() => loadSkillCatalog(root)).toThrow(
        "Skill file example-server/notes.md is not valid UTF-8",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("publishes a non-text file that is not UTF-8", () => {
    const root = mkdtempSync(join(tmpdir(), "binary-skill-"));
    const skillDir = join(root, "example-server");
    mkdirSync(skillDir);
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: example-server\ndescription: An example skill.\n---\nBody\n",
    );
    writeFileSync(join(skillDir, "blob.bin"), Buffer.from([0xff, 0xfe]));
    try {
      expect(loadSkillCatalog(root).entries).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not advertise the extension when no skill directories exist", async () => {
    const empty = loadSkillCatalog(join(tmpdir(), "skills-do-not-exist"));
    const optedOut = createMcpHandler(() => {
      const server = new McpServer({ name: "test", version: "0.0.0" });
      registerSkills(server, empty);
      return server;
    });

    try {
      const payload = await request("server/discover", {}, optedOut);
      expect(payload.error).toBeUndefined();
      expect(payload.result?.instructions).toBeUndefined();
      expect(payload.result?.capabilities).not.toMatchObject({
        extensions: { "io.modelcontextprotocol/skills": {} },
      });
    } finally {
      await optedOut.close();
    }
  });
});
