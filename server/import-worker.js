import { workerData } from "node:worker_threads";
import { setTimeout as pause } from "node:timers/promises";
import { database, audit } from "./db.js";
import { processChunk } from "./imports.js";
const db = database(workerData.file);
try {
  let job;
  while (
    (job = db
      .prepare(
        "SELECT j.batch_id FROM import_jobs j JOIN batches b ON b.id=j.batch_id WHERE b.status='Processing' ORDER BY j.batch_id LIMIT 1",
      )
      .get())
  ) {
    try {
      processChunk(db, job.batch_id);
    } catch (e) {
      db.prepare("UPDATE batches SET status='Needs review' WHERE id=?").run(
        job.batch_id,
      );
      audit(
        db,
        null,
        null,
        "Import interrupted",
        `Batch ${job.batch_id}: ${e.message}. Original rows and cursor retained.`,
      );
    }
    await pause(10);
  }
} finally {
  db.close();
}
