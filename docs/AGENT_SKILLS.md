# Agent Skills over MCP

This template publishes one sample Agent Skill: `example-skill`. It plays the same role as the `echo` tool. The canonical source is [skills/example-skill/SKILL.md](../skills/example-skill/SKILL.md), and the server exposes the same file through the MCP Skills extension. Replace the directory and `src/skills.ts` when the server needs its own guidance.

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

`skills/list` returns a complete manifest for `skill://example-skill/SKILL.md`. `skills/get` returns the same entry when given that URI. Both results include `resultType: "complete"`, `ttlMs`, and `cacheScope`. The resource manifest covers every file in the skill directory, with a `sha256:{hex}` digest and raw byte size for each file. The `skills/list` handler does not currently accept a `cursor` parameter: it always returns the full one-skill catalog in a single page with no `nextCursor`, and a request that supplies a defined `cursor` is rejected with an `InvalidParams` error.

All skill files are ordinary MCP resources and are read with `resources/read`. The required file is `text/markdown`; supporting files use a MIME type derived from their extension or `application/octet-stream`. The server instructions include the skill URI as a fallback for clients without Skills extension support.

## Security and trust

The manifest and the resource bytes come from the same server. A matching digest proves only that the bytes are consistent with that server's current manifest; it is not a signature or trust anchor. Hosts should treat remote skill content as untrusted input, preserve the originating server identity with the URI, apply their normal approval policy, and activate a skill only through a supported skill-loading path. A `resources/read` call alone is not activation.

The sample skill is advisory. It does not change tool behavior.

## Versioning, packaging, and caching

The skill is released with the MCP server's package and container image. There is no independent public skill SemVer in this repository. A content change is therefore shipped under the MCP release version whose source contains it.

The package includes `skills/`, and the container copies the same source into `/app/skills/`. `npm run verify:skill-package` compares the packaged bytes with the repository source, and the Docker build fails if the runtime file is absent. `ttlMs` and `cacheScope: "public"` are freshness hints for the static catalog, not integrity guarantees.

## Client compatibility

The server's implementation is tested against the installed TypeScript MCP SDK's modern HTTP handler. Extension support is not inferred from a client name. A client that understands `server/discover`, custom extension methods, and `resources/read` can discover and fetch the skill. A client that only supports ordinary resources can still read the URI if it is given explicitly. A client with no resource or extension support needs the standalone file installed through its own documented mechanism; this server does not auto-install it.
