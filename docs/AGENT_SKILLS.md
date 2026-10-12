# Agent Skills over MCP

This template publishes Agent Skills through the stable MCP Skills extension (`io.modelcontextprotocol/skills`). The shipped example is [skills/example-server/SKILL.md](../skills/example-server/SKILL.md). Replace it, or add sibling directories under `skills/`, when the server has its own workflow guidance.

Repository-local coding skills under `.agents/skills/` and `.claude/skills/` are for agents editing this repository. The running server publishes only the directories in `skills/`.

## Discovery and retrieval

For protocol revision `2026-07-28` or later, `server/discover` includes:

```json
{
  "capabilities": {
    "resources": {},
    "extensions": {
      "io.modelcontextprotocol/skills": {}
    }
  }
}
```

The empty extension object is intentional: this server implements the required `skills/list` and `skills/get` methods and does not implement optional `resources/directory/read`.

`skills/list` returns one complete entry per immediate child of `skills/`. The example entry is `skill://example-server/SKILL.md`. `skills/get` returns that entry when given its `SKILL.md` URI, and returns `Invalid params` (`-32602`) for any other URI. Both results include `resultType: "complete"`, `ttlMs`, and `cacheScope`. Each entry's `resources` array covers every file in that skill directory, with a `sha256:{hex}` digest and raw byte size. Hidden files (names starting with `.`) are skipped.

The `skills/list` handler does not accept a `cursor`. It always returns the full catalog in a single page with no `nextCursor`, and a request that supplies a defined `cursor` is rejected with `Invalid params` (`-32602`). Real cursor pagination is future work for when the catalog no longer fits in one response. An entry stays atomic: a skill's `resources` set is never split across pages.

Skill files are ordinary MCP resources and are read with `resources/read`. `SKILL.md` is `text/markdown`. Other files use a MIME type derived from their extension, or `application/octet-stream`. The server instructions include the skill URIs as a fallback for clients that do not implement the Skills extension.

## Security and trust

The manifest and the resource bytes come from the same server. A matching digest proves only that the bytes are consistent with that server's current manifest. It is a consistency check, and the host still decides whether the server is trusted. Hosts should treat remote skill content as untrusted input, preserve the originating server identity with the URI, apply their normal approval policy, and activate a skill only through a supported skill-loading path. A `resources/read` call returns bytes to the caller. Activation is a separate host decision.

The example skill is advisory. It describes the template's example tools and how to replace this package. It does not change tool behavior, grant access, or install itself.

## Versioning, packaging, and caching

Skills ship with the server source and container image. There is no independent public skill SemVer in this repository. A content change ships with the server revision that contains it.

`npm pack` includes `skills/`, and the container copies the same source into `/app/skills/`. `npm run verify:skill-package` compares those packaged bytes with the repository. The Docker build fails when `skills/` contains no `SKILL.md`. `ttlMs` and `cacheScope: "public"` are freshness hints for the static catalog. They are hints about when to re-check, and integrity still comes from comparing bytes with the manifest. Clients should refresh `skills/get` when the hint expires or when a user asks for a recheck.

## Adding a skill

1. Create `skills/<name>/SKILL.md`.
2. Set frontmatter `name` to `<name>`: 1–64 characters, lowercase letters, digits, and single hyphens, matching the directory name.
3. Set `description` to 1–1024 characters that say what the skill does and when to use it.
4. Put supporting files in that directory when the workflow needs them.
5. Remove `skills/example-server/` when it no longer describes the server.

Startup reads `skills/` once and fails if a directory is missing `SKILL.md`, the frontmatter is invalid, `name` disagrees with the directory, or the skill exceeds 512 files or 16 MiB. The catalog is static for the life of the process. Publish a new build to change it.

## Client compatibility

Tests cover the installed TypeScript MCP SDK's modern HTTP handler. Extension support is a property of the client's capabilities, independent of the client name. A client that understands `server/discover`, custom extension methods, and `resources/read` can discover and fetch a skill. A client that only supports ordinary resources can still read a URI it was given. A client with neither resource nor extension support needs the standalone `SKILL.md` installed through its own mechanism. This server leaves installation to the host.
