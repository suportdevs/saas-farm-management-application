#!/usr/bin/env node
import { run } from '../src/index.mjs';

run(process.argv.slice(2)).catch((err) => {
  console.error(`\n✖ ${err?.message ?? err}`);
  process.exit(1);
});
