# Repository Guidelines

## Project Structure & Module Organization
Core server code lives in `src/`. `src/index.ts` hosts the MCP Express server, `src/config.ts` normalizes environment variables, `src/logger.ts` wires Pino logging, and `src/lib/` contains reusable helpers alongside colocated tests such as `utils.test.ts`. Build artifacts land in `dist/`; configuration files (`vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `Dockerfile`) sit at the repository root.

## Build, Test, and Development Commands
Use `npm run dev` for a live TypeScript dev loop with native type stripping (enabled by default in Node.js 22.18+). `npm run build` compiles to ES modules via Vite, while `npm start` serves the compiled output from `dist/`. Run `npm run test` for the interactive Vitest runner or `npm run test:ci` to emit JSON results into `test-results.json`. Quality gates include `npm run lint`, `npm run lint:fix`, `npm run format`, and `npm run format:check`.

## Coding Style & Naming Conventions
TypeScript files use ES module syntax (`import/export`) and live under `src/`. Follow the default Prettier style (two-space indent, double quotes, trailing commas) enforced by the formatting scripts. ESLint runs with `@typescript-eslint`; unused variables must be prefixed with `_` if intentional, and `any` is discouraged. Prefer `camelCase` for functions and variables, `PascalCase` for types, and descriptive filenames like `logger.ts` or `utils.ts`.

## Testing Guidelines
Vitest powers unit tests. Name specs `*.test.ts` and keep them beside the code under test to mirror the existing `src/lib/utils.test.ts` pattern. Cover new tools, transports, and configuration logic with focused tests that exercise observable behaviour. Failing tests should reproduce regressions before fixes; wrap asynchronous tests with `async/await` to keep stack traces actionable.

## Commit & Pull Request Guidelines
Adopt Conventional Commits (`feat:`, `chore:`, `docs:`) as seen in the history to keep change logs readable. Each PR should summarize the user-facing impact, reference related issues, and list follow-up tasks if scope is deferred. Include testing evidence (`npm run test`, `npm run lint`) and call out new environment variables or configuration knobs so reviewers can verify runtime changes.

## Configuration & Operational Notes
Runtime configuration is sourced from environment variables parsed in `src/config.ts` (`PORT`, `SERVER_NAME`, `LOG_LEVEL`, etc.). Document defaults when introducing new flags and avoid hard-coding secrets. Pino logging is structured; keep contextual metadata small and redact user-provided content where necessary.
