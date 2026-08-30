import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const { REGULATORY_SOURCES } = await vite.ssrLoadModule("/lib/regulatory-sources.ts");

test("KFS registry points to the intended RBI circular", () => {
  const rule = REGULATORY_SOURCES.find((item) => item.id === "rbi-kfs-2024");
  assert.equal(rule.authority, "Reserve Bank of India");
  assert.match(rule.title, /Key Facts Statement/);
  assert.match(rule.reference, /RBI\/2024-25\/18/);
  assert.match(rule.reference, /DOR\.STR\.REC\.13/);
  assert.equal(rule.publicationDate, "15 Apr 2024");
  assert.equal(rule.effectiveDate, "01 Oct 2024");
  assert.match(rule.source, /Id=12663/);
});

test("prepayment registry points to the 2025 RBI Directions", () => {
  const rule = REGULATORY_SOURCES.find((item) => item.id === "rbi-prepayment-2025");
  assert.match(rule.title, /Pre-payment Charges on Loans/);
  assert.match(rule.reference, /RBI\/2025-26\/64/);
  assert.match(rule.reference, /DoR\.MCS\.REC\.38/);
  assert.equal(rule.publicationDate, "02 Jul 2025");
  assert.equal(rule.effectiveDate, "01 Jan 2026");
  assert.match(rule.source, /Id=12878/);
  assert.equal(rule.status, "IN FORCE");
});

test("official rules contain complete evidence metadata", () => {
  for (const rule of REGULATORY_SOURCES.filter((item) => item.authority === "Reserve Bank of India")) {
    for (const key of ["reference", "publicationDate", "effectiveDate", "applicability", "source", "lastChecked", "explanation"]) assert.ok(rule[key], `${rule.id} missing ${key}`);
    assert.equal(rule.superseded, false);
  }
});
