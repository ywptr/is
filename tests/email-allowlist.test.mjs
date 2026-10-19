import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedEmails, isAllowedEmail } from "../src/lib/email-allowlist.ts";

test("empty or undefined allowlist always denies", () => {
  assert.equal(isAllowedEmail("a@example.com", undefined), false);
  assert.equal(isAllowedEmail("a@example.com", ""), false);
  assert.equal(isAllowedEmail("a@example.com", "  ,  "), false);
});

test("email matching is exact and case-insensitive", () => {
  assert.equal(isAllowedEmail("Alice@Example.com", "  alice@example.com, bob@example.com "), true);
  assert.equal(isAllowedEmail("notalice@example.com", "alice@example.com"), false);
  assert.equal(isAllowedEmail("alice@notexample.com", "alice@example.com"), false);
  assert.equal(isAllowedEmail("alice@example.com.evil.test", "alice@example.com"), false);
});

test("wildcards and domain rules are not supported", () => {
  assert.equal(isAllowedEmail("person@company.com", "*@company.com"), false);
  assert.equal(isAllowedEmail("person@company.com", "company.com"), false);
});

test("configuration whitespace and duplicate entries are normalized", () => {
  assert.deepEqual([...allowedEmails("a@example.com, A@example.com, b@example.com")], ["a@example.com", "b@example.com"]);
});
