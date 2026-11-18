import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import express from "express";
import { database, initialize } from "../server/db.js";
import { api } from "../server/api.js";

test("large jobs run in a separate worker, reconcile every row, and survive reopening the database", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "brg-test-")),
    file = path.join(dir, "qa.sqlite");
  let db = database(file);
  initialize(db, true);
  const app = express();
  app.use("/api", api(db, true));
  const srv = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const url = "http://127.0.0.1:" + srv.address().port + "/api",
    auth = await (
      await fetch(url + "/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).json(),
    headers = {
      Authorization: "Bearer " + auth.token,
      "Content-Type": "application/json",
    };
  try {
    const rows = Array.from({ length: 217 }, (_, i) => ({
      name: "Batch customer " + i,
      phone: "97" + String(i + 1).padStart(8, "0"),
      project_id: (i % 3) + 1,
      source: "Import",
    }));
    rows.push(
      { ...rows[0] },
      { name: "Invalid", phone: "invalid", project_id: 1 },
    );
    const preview = await (
      await fetch(url + "/imports/preview", {
        method: "POST",
        headers,
        body: JSON.stringify({ rows }),
      })
    ).json();
    assert.equal(preview.imported, 217);
    assert.equal(preview.linked, 1);
    assert.equal(preview.invalid, 1);
    const submitted = await fetch(url + "/imports", {
      method: "POST",
      headers,
      body: JSON.stringify({ rows, filename: "worker-fixture.xlsx" }),
    });
    assert.equal(submitted.status, 202);
    const batch = await submitted.json();
    let result = batch;
    for (let i = 0; i < 100 && result.status === "Processing"; i++) {
      await delay(50);
      result = await (
        await fetch(url + "/imports/" + batch.id, { headers })
      ).json();
    }
    assert.equal(result.status, "Completed");
    assert.equal(
      result.total,
      result.imported + result.linked + result.failures.length,
    );
    assert.equal(result.imported, 217);
    assert.equal(result.linked, 1);
    assert.equal(result.failures[0].row, 220);
    const id = db
      .prepare("SELECT id FROM leads WHERE batch_id=? LIMIT 1")
      .get(batch.id).id;
    await fetch(url + "/leads/" + id + "/notes", {
      method: "POST",
      headers,
      body: JSON.stringify({ note: "A manager has reviewed this lead." }),
    });
    const rejected = await fetch(url + "/imports/" + batch.id + "/rollback", {
      method: "POST",
      headers,
      body: "{}",
    });
    assert.equal(rejected.status, 409);
    assert.equal(db.prepare("SELECT count(*) n FROM import_jobs").get().n, 0);
    db.close();
    db = database(file);
    assert.equal(
      db
        .prepare("SELECT count(*) n FROM leads WHERE batch_id=? AND archived=0")
        .get(batch.id).n,
      217,
    );
    assert.equal(
      db.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("private workspace starts empty, uses a password hash, and never imports demonstration history", () => {
  const prevEmail = process.env.CRM_ADMIN_EMAIL,
    prevPw = process.env.CRM_ADMIN_PASSWORD;
  process.env.CRM_ADMIN_EMAIL = "admin@company.example";
  process.env.CRM_ADMIN_PASSWORD = "local-qa-only-strong-password";
  const db = database(":memory:");
  try {
    initialize(db, false);
    assert.equal(db.prepare("SELECT count(*) n FROM users").get().n, 1);
    assert.equal(db.prepare("SELECT count(*) n FROM leads").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) n FROM contacts").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) n FROM opportunities").get().n, 0);
    assert.notEqual(
      db.prepare("SELECT password FROM users").get().password,
      process.env.CRM_ADMIN_PASSWORD,
    );
  } finally {
    db.close();
    if (prevEmail == null) delete process.env.CRM_ADMIN_EMAIL;
    else process.env.CRM_ADMIN_EMAIL = prevEmail;
    if (prevPw == null) delete process.env.CRM_ADMIN_PASSWORD;
    else process.env.CRM_ADMIN_PASSWORD = prevPw;
  }
});
