import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

function collectFiles(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name),
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
  const metadata = JSON.parse(output);
  const filename = metadata[0]?.filename;
  if (typeof filename !== "string") {
    throw new Error("npm pack did not return a tarball filename");
  }

  for (const sourcePath of sourceFiles) {
    const skillPath = relative(resolve("."), sourcePath).split("\\").join("/");
    const packaged = execFileSync("tar", [
      "-xOf",
      join(destination, filename),
      `package/${skillPath}`,
    ]);
    if (!readFileSync(sourcePath).equals(packaged)) {
      throw new Error(`${skillPath} differs between source and npm package`);
    }
    process.stdout.write(`verified ${skillPath} in ${filename}\n`);
  }
} finally {
  rmSync(destination, { recursive: true, force: true });
}
