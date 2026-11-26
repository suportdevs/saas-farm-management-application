/**
 * Lists every English phrase the interface can translate, and which ones a
 * language file is missing:
 *
 *   npx tsx scripts/i18n-phrases.ts          → all phrases (JSON)
 *   npx tsx scripts/i18n-phrases.ts bn       → phrases missing from messages/bn.ts
 *
 * Sources: t('…') / t("…") calls in src, the shared catalog definitions
 * (names, columns, hints, choices), menus and the shared choice lists.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ANIMAL_SEXES,
  ANIMAL_TYPES,
  CATALOG,
  CATALOG_RESOURCES,
  FINISH_RECEIVE_STATUSES,
  PURCHASE_SOURCE_TYPES,
  STATUS_OPTIONS,
} from '@kit/shared';
import { ALL_MODULES } from '../src/modules/farms/navigation';
import { EXPORT_FORMATS } from '../src/lib/table-export';
import { COLORS, FONTS, SIZES } from '../src/lib/preferences';
import { bn } from '../src/i18n/messages/bn';
import { hi } from '../src/i18n/messages/hi';

const phrases = new Set<string>();
const add = (text?: string | null) => {
  if (text && /[A-Za-z]/.test(text)) phrases.add(text);
};

// 1. t('…') calls in the source.
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.(tsx?|ts)$/.test(name) ? [path] : [];
  });
for (const file of walk(join(__dirname, '../src'))) {
  if (file.includes(join('i18n', 'messages'))) continue;
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) add(m[2]!.replace(/\\(['"])/g, '$1'));
}

// 2. Catalog definitions.
for (const r of CATALOG_RESOURCES) {
  const def = CATALOG[r];
  add(def.label);
  add(def.plural);
  add(def.description);
  add(def.eyebrow);
  for (const c of def.columns) {
    add(c.label);
    add(c.hint);
    for (const o of c.options ?? []) add(o.label);
  }
}

// 3. Menus and modules.
for (const m of ALL_MODULES) {
  add(m.label);
  add(m.summary);
  m.highlights.forEach(add);
  m.children?.forEach((c) => add(c.label));
}
['Operations', 'Business', 'Farm', 'You', 'Overview', 'Team', 'Roles', 'Roles & permissions', 'Activity', 'Plan & billing', 'Farm settings', 'Organizations', 'Account', 'Platform admin'].forEach(add);

// 4. Shared choice lists and settings.
[...STATUS_OPTIONS, ...ANIMAL_SEXES, ...ANIMAL_TYPES, ...PURCHASE_SOURCE_TYPES, ...FINISH_RECEIVE_STATUSES].forEach((o) => add(o.label));
EXPORT_FORMATS.forEach((f) => {
  add(f.label);
  add(f.hint);
});
[...COLORS, ...FONTS, ...SIZES].forEach((o) => add(o.label));
['Light', 'Dark', 'System', 'Left', 'Right', 'Top', 'Bottom', 'Active', 'Inactive', 'Download', 'Processed', 'Pending'].forEach(add);

const all = [...phrases].sort();
const lang = process.argv[2];
const files: Record<string, Record<string, string>> = { bn, hi };
if (lang) {
  const missing = all.filter((p) => !(p in (files[lang] ?? {})));
  console.log(JSON.stringify(missing, null, 1));
  console.error(`${missing.length} of ${all.length} phrases missing in ${lang}`);
} else {
  console.log(JSON.stringify(all, null, 1));
  console.error(`${all.length} phrases`);
}
