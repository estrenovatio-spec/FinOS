const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const cmd = process.argv.slice(2).join(" ");
if (!cmd) {
  console.error("Usage: node scripts/with-env-local.cjs <command>");
  process.exit(1);
}

const result = spawnSync(cmd, { stdio: "inherit", shell: true, env: process.env });
process.exit(result.status ?? 1);
