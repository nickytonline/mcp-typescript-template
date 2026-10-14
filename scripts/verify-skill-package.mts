import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  type Dirent,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { Schema } from "effect";

const NpmPackEntry = Schema.Struct({
  filename: Schema.String,
});

const MissingDirectory = Schema.Struct({
  code: Schema.Literal("ENOENT"),
});

function collectFiles(directory: string, files: string[] = []): string[] {
  const entries: Dirent[] = readdirSync(directory, { withFileTypes: true });

  for (const entry of entries.sort((left: Dirent, right: Dirent) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      collectFiles(path, files);
      continue;
    }

    if (entry.isFile()) files.push(path);
  }

  return files;
}

function readPackFilename(output: string): string {
  const metadata = Schema.decodeUnknownSync(Schema.Array(NpmPackEntry), {
    onExcessProperty: "ignore",
  })(JSON.parse(output));

  const entry = metadata[0];

  if (!entry) {
    throw new Error("npm pack did not return a tarball filename");
  }

  return entry.filename;
}

function isMissingDirectory(cause: unknown): boolean {
  return Schema.is(MissingDirectory)(cause);
}

function bundledSkillFiles(directory: string): string[] {
  try {
    return collectFiles(directory);
  } catch (error) {
    if (isMissingDirectory(error)) return [];
    throw error;
  }
}

const sourceRoot = resolve("skills");
const sourceFiles = bundledSkillFiles(sourceRoot);

if (sourceFiles.length === 0) {
  process.stdout.write("no bundled skills to verify\n");
  process.exit(0);
}

const destination = mkdtempSync(join(tmpdir(), "mcp-template-package-"));

try {
  const output = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", destination],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_cache: destination,
        npm_config_logs_dir: destination,
      },
    },
  );

  const filename = readPackFilename(output);

  for (const sourcePath of sourceFiles) {
    const skillPath = relative(resolve("."), sourcePath).split("\\").join("/");

    const packaged: Buffer = execFileSync("tar", [
      "-xOf",
      join(destination, filename),
      `package/${skillPath}`,
    ]);

    const sourceBytes: Buffer = readFileSync(sourcePath);

    if (!sourceBytes.equals(packaged)) {
      throw new Error(`${skillPath} differs between source and npm package`);
    }

    process.stdout.write(`verified ${skillPath} in ${filename}\n`);
  }
} finally {
  rmSync(destination, { recursive: true, force: true });
}
