#!/usr/bin/env node
import { NodeClient, validateConfig, VERSION, SPEC_VERSION } from '../dist/index.js';
import { readFileSync } from 'fs';
import { parseArgs } from 'util';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    version: { type: 'boolean', short: 'v' },
    file: { type: 'string', short: 'f' },
  },
  allowPositionals: true,
});

if (values.version) {
  console.log(`rcan-validate (ts) ${VERSION} (RCAN spec ${SPEC_VERSION})`);
  process.exit(0);
}

const [subcommand, target] = positionals;

if (subcommand === 'node') {
  if (!target) {
    console.error('Usage: rcan-validate node <url>');
    process.exit(1);
  }

  const client = new NodeClient();
  console.log(`Validating node manifest: ${target}`);

  try {
    const manifest = await client.getNodeManifest(target);
    const valid = client.verifyNode(manifest);

    const checks = [
      ['node_type', manifest.node_type, ['root','authoritative','resolver','cache'].includes(manifest.node_type)],
      ['operator', manifest.operator, !!manifest.operator],
      ['namespace_prefix', manifest.namespace_prefix, !!manifest.namespace_prefix],
      ['public_key', manifest.public_key?.substring(0, 20) + '...', manifest.public_key?.startsWith('ed25519:')],
      ['api_base', manifest.api_base, manifest.api_base?.startsWith('https://')],
    ];

    for (const [name, value, pass] of checks) {
      console.log(`  ${pass ? '✓' : '✗'} ${name}: ${value}`);
    }

    const passed = checks.filter(([,,p]) => p).length;
    console.log(`\n${valid ? 'PASS' : 'FAIL'} (${passed}/${checks.length} checks)`);
    process.exit(valid ? 0 : 1);
  } catch (e) {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
  }
}

if (subcommand === 'config') {
  const filePath = target || values.file;
  if (!filePath) {
    console.error('Usage: rcan-validate config <file>');
    process.exit(1);
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const config = JSON.parse(raw);
    const result = validateConfig(config);
    if (result.ok) {
      console.log('✓ Config valid');
      if (result.warnings?.length) {
        result.warnings.forEach(w => console.warn(`  ⚠️  ${w}`));
      }
      process.exit(0);
    } else {
      console.error('✗ Config invalid:');
      result.issues?.forEach(i => console.error(`  ❌ ${i}`));
      process.exit(1);
    }
  } catch (e) {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
  }
}

console.error(`Unknown subcommand: ${subcommand}`);
console.error('Usage: rcan-validate node <url> | rcan-validate config <file> | rcan-validate --version');
process.exit(1);
