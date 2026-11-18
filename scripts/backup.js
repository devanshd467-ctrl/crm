import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync, existsSync, chmodSync } from "node:fs";
import path from "node:path";
const from = process.argv[2] || process.env.CRM_DB;
if (!from || !existsSync(from)) {
  console.error(
    "Usage: npm run db:backup -- /path/to/workspace.sqlite [backup-directory]",
  );
  process.exit(1);
}
const dir = process.argv[3] || ".crm-data/backups";
mkdirSync(dir, { recursive: true, mode: 0o700 });
const dest = path.join(
  dir,
  path.basename(from, ".sqlite") +
    "-" +
    new Date().toISOString().replaceAll(":", "-") +
    ".sqlite",
);
const db = new DatabaseSync(from, { readOnly: true });
try {
  await backup(db, dest);
} finally {
  db.close();
}
chmodSync(dest, 0o600);
const check = new DatabaseSync(dest, { readOnly: true });
try {
  if (
    check.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" ||
    check.prepare("PRAGMA foreign_key_check").all().length
  )
    throw Error(
      "Backup failed integrity verification. Do not use this snapshot.",
    );
  console.log("Verified database backup:", dest);
} finally {
  check.close();
}
