#!/usr/bin/env node
/**
 * rcan-validate — RCAN config, message, URI, and audit chain validator
 *
 * Usage:
 *   npx rcan-validate config   <file.rcan.yaml>
 *   npx rcan-validate message  <file.json>
 *   npx rcan-validate uri      <rcan://...>
 *   npx rcan-validate audit    <file.jsonl>
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { validateConfig, validateMessage, validateURI, type ValidationResult } from "../validate.js";
import { AuditChain } from "../audit.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function printResult(result: ValidationResult, label: string): void {
  const status = result.ok ? "\x1b[32m✅ PASS\x1b[0m" : "\x1b[31m❌ FAIL\x1b[0m";
  console.log(`\n${status}  ${label}\n`);

  for (const issue of result.issues) {
    console.log(`  \x1b[31m✗ ${issue}\x1b[0m`);
  }
  for (const warn of result.warnings) {
    console.log(`  \x1b[33m⚠ ${warn}\x1b[0m`);
  }
  for (const note of result.info) {
    console.log(`  ${note}`);
  }
  console.log();
}

function readFile(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  return fs.readFileSync(resolved, "utf-8");
}

function parseYAML(text: string): unknown {
  // Minimal YAML parser for flat/nested objects (no external deps)
  // Falls back to JSON if it looks like JSON
  text = text.trim();
  if (text.startsWith("{") || text.startsWith("[")) {
    return JSON.parse(text);
  }
  // Use dynamic import for yaml if available, otherwise basic parse
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yaml = require("js-yaml");
    return yaml.load(text);
  } catch {
    // js-yaml not available — try JSON fallback
    try {
      return JSON.parse(text);
    } catch {
      console.error("Error: Could not parse file as YAML or JSON. Install js-yaml for YAML support: npm install js-yaml");
      process.exit(1);
    }
  }
}

// ── Subcommands ───────────────────────────────────────────────────────────────

function cmdConfig(filePath: string): void {
  const text = readFile(filePath);
  const config = parseYAML(text) as Record<string, unknown>;
  const result = validateConfig(config as Parameters<typeof validateConfig>[0]);
  printResult(result, `Config: ${filePath}`);
  process.exit(result.ok ? 0 : 1);
}

function cmdMessage(filePath: string): void {
  const text = readFile(filePath);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("Error: Message file must be valid JSON");
    process.exit(1);
  }
  const result = validateMessage(data);
  printResult(result, `Message: ${filePath}`);
  process.exit(result.ok ? 0 : 1);
}

function cmdURI(uri: string): void {
  const result = validateURI(uri);
  printResult(result, `URI: ${uri}`);
  process.exit(result.ok ? 0 : 1);
}

function cmdAudit(filePath: string, secret = ""): void {
  const text = readFile(filePath);
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length === 0) {
    console.error("Error: Audit file is empty");
    process.exit(1);
  }

  try {
    const chain = AuditChain.fromJSONL(text, secret);
    const verifyResult = chain.verifyAll();
    const label = `Audit chain: ${filePath} (${verifyResult.count} records)`;
    if (verifyResult.valid) {
      console.log(`\n\x1b[32m✅ PASS\x1b[0m  ${label}`);
      console.log(`  Chain is tamper-evident and intact.\n`);
      process.exit(0);
    } else {
      console.log(`\n\x1b[31m❌ FAIL\x1b[0m  ${label}`);
      for (const e of verifyResult.errors) {
        console.log(`  \x1b[31m✗ ${e}\x1b[0m`);
      }
      console.log();
      process.exit(1);
    }
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}

// ── Usage ─────────────────────────────────────────────────────────────────────

function usage(): void {
  console.log(`
rcan-validate — validate RCAN configs, messages, URIs, and audit chains

Usage:
  rcan-validate config  <file.rcan.yaml>    Validate RCAN config (L1/L2/L3 conformance)
  rcan-validate message <file.json>         Validate a RCAN message
  rcan-validate uri     <rcan://...>        Validate a Robot URI
  rcan-validate audit   <file.jsonl> [secret]  Verify an audit chain (HMAC)

Examples:
  rcan-validate config  myrobot.rcan.yaml
  rcan-validate message command.json
  rcan-validate uri     'rcan://registry.rcan.dev/acme/arm/v2/unit-001'
  rcan-validate audit   audit.jsonl
`);
  process.exit(0);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const [, , subcmd, arg, secretArg] = process.argv;

if (!subcmd || subcmd === "--help" || subcmd === "-h") {
  usage();
}

switch (subcmd) {
  case "config":
    if (!arg) { console.error("Error: missing <file>"); process.exit(1); }
    cmdConfig(arg);
    break;
  case "message":
    if (!arg) { console.error("Error: missing <file>"); process.exit(1); }
    cmdMessage(arg);
    break;
  case "uri":
    if (!arg) { console.error("Error: missing <uri>"); process.exit(1); }
    cmdURI(arg);
    break;
  case "audit":
    if (!arg) { console.error("Error: missing <file>"); process.exit(1); }
    cmdAudit(arg, secretArg ?? "");
    break;
  default:
    console.error(`Error: unknown subcommand '${subcmd}'`);
    usage();
}
