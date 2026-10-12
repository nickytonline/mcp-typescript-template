import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const skillPath = "skills/example-skill/SKILL.md";
const source = readFileSync(resolve(skillPath));
const destination = mkdtempSync(join(tmpdir(), "mcp-typescript-template-package-"));

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

  const packaged = execFileSync("tar", [
    "-xOf",
    join(destination, filename),
    `package/${skillPath}`,
  ]);
  if (!source.equals(packaged)) {
    throw new Error(`${skillPath} differs between source and npm package`);
  }
  process.stdout.write(`verified ${skillPath} in ${filename}\n`);
} finally {
  rmSync(destination, { recursive: true, force: true });
}
