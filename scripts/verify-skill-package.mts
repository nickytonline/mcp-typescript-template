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

type NpmPackEntry = {
  filename: string;
};

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

function isNpmPackEntry(value: unknown): value is NpmPackEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    "filename" in value &&
    typeof value.filename === "string"
  );
}

function readPackFilename(output: string): string {
  const metadata: unknown = JSON.parse(output);
  if (!Array.isArray(metadata) || !isNpmPackEntry(metadata[0])) {
    throw new Error("npm pack did not return a tarball filename");
  }
  return metadata[0].filename;
}

const sourceRoot = resolve("skills");
const sourceFiles = collectFiles(sourceRoot);
if (sourceFiles.length === 0) {
  throw new Error("skills/ must contain the bundled Agent Skill files");
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
