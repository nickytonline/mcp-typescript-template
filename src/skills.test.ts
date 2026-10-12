import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import {
  getSkillsInstructions,
  parseFrontmatter,
  registerSkills,
  SKILL_URI,
} from "./skills.ts";

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
): Promise<JsonRpcResponse> {
  if (!handler) throw new Error("test handler is not initialized");

  const response = await handler.fetch(
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
    expect(response.result?.instructions).toContain(SKILL_URI);
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
    expect(skill.uri).toBe(SKILL_URI);
    expect(skill.frontmatter.name).toBe("example-skill");
    expect(skill.frontmatter.description).toContain("sample Agent Skill");
    expect(skill.resources).toHaveLength(1);
    expect(skill.resources[0]).toMatchObject({ uri: SKILL_URI });

    const getResponse = await request("skills/get", { uri: SKILL_URI });
    expect(getResponse.result).toMatchObject({
      resultType: "complete",
      skill,
      ttlMs: 300_000,
      cacheScope: "public",
    });

    const readResponse = await request("resources/read", { uri: SKILL_URI });
    expect(readResponse.result).toMatchObject({
      ttlMs: 300_000,
      cacheScope: "public",
    });
    const contents = (
      readResponse.result?.contents as Array<{
        text: string;
      }>
    )[0];
    const bytes = Buffer.from(contents.text, "utf8");
    expect(contents.text).toContain("# Example skill");
    expect(skill.resources[0].size).toBe(bytes.byteLength);
    expect(skill.resources[0].digest).toBe(
      `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    );
  });

  it("returns invalid params for an unknown skill URI", async () => {
    const response = await request("skills/get", {
      uri: "skill://missing/SKILL.md",
    });
    expect(response.error?.code).toBe(-32602);
  });

  it("returns invalid params when skills/list is given a cursor", async () => {
    const response = await request("skills/list", { cursor: "next" });
    expect(response.error?.code).toBe(-32602);
  });
});

describe("parseFrontmatter", () => {
  it("parses a standard LF frontmatter block", () => {
    const frontmatter = parseFrontmatter(
      "---\nname: example\ndescription: An example skill.\n---\nBody text.",
    );
    expect(frontmatter).toMatchObject({
      name: "example",
      description: "An example skill.",
    });
  });

  it("tolerates trailing whitespace on the closing fence line", () => {
    const frontmatter = parseFrontmatter(
      "---\nname: example\ndescription: An example skill.\n---   \nBody text.",
    );
    expect(frontmatter).toMatchObject({
      name: "example",
      description: "An example skill.",
    });
  });

  it("tolerates CRLF line endings throughout the document", () => {
    const frontmatter = parseFrontmatter(
      "---\r\nname: example\r\ndescription: An example skill.\r\n---\r\nBody text.",
    );
    expect(frontmatter).toMatchObject({
      name: "example",
      description: "An example skill.",
    });
  });

  it("tolerates CRLF with trailing whitespace on the closing fence line", () => {
    const frontmatter = parseFrontmatter(
      "---\r\nname: example\r\ndescription: An example skill.\r\n---  \r\nBody text.",
    );
    expect(frontmatter).toMatchObject({
      name: "example",
      description: "An example skill.",
    });
  });

  it("still throws when there is no opening frontmatter marker", () => {
    expect(() => parseFrontmatter("name: example\n---\n")).toThrow(
      "Skill SKILL.md must start with YAML frontmatter",
    );
  });

  it("still throws when there is no closing frontmatter marker", () => {
    expect(() => parseFrontmatter("---\nname: example\n")).toThrow(
      "Skill SKILL.md has no closing YAML frontmatter marker",
    );
  });
});
