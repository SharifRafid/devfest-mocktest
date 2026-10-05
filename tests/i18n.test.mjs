import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, t } from '../js/i18n.js';

/** Flatten nested or dotted-key string tables into Map<'a.b', string>. */
function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}

const EN = flatten(STRINGS.en);
const BN = flatten(STRINGS.bn);

const ERROR_CODES = [
  'json_parse', 'root_not_object', 'building_invalid', 'nodes_not_array', 'nodes_count',
  'node_not_object', 'node_id_invalid', 'node_id_duplicate', 'node_label_invalid', 'node_type_invalid',
  'node_coord_invalid', 'need_room_or_junction', 'need_exit', 'edges_not_array', 'edges_count',
  'edge_not_object', 'edge_id_invalid', 'edge_id_duplicate', 'edge_endpoint_unknown', 'edge_self_loop',
  'edge_pair_duplicate', 'edge_cost_invalid', 'initial_state_invalid', 'state_array_invalid',
  'state_id_not_string', 'state_unknown_id', 'state_wrong_category',
];

const REQUIRED = {
  'status.no_route': ['No route available', 'কোনো পথ পাওয়া যায়নি'],
  'status.start_blocked': ['Starting location blocked', 'শুরুর স্থান অবরুদ্ধ'],
  'status.select_start': ['Select a starting location', 'একটি শুরুর স্থান নির্বাচন করুন'],
  'status.no_building': ['No building loaded — upload a JSON file', 'কোনো ভবন লোড হয়নি — একটি JSON ফাইল আপলোড করুন'],
  'err.file_protocol': [
    'Open via a local web server or the live site to auto-load the sample; upload still works.',
    'স্বয়ংক্রিয়ভাবে নমুনা লোড করতে লোকাল সার্ভার বা লাইভ সাইট ব্যবহার করুন; আপলোড কাজ করবে।',
  ],
};

describe('i18n tables', () => {
  test('en and bn have identical key sets', () => {
    const onlyEn = [...EN.keys()].filter((k) => !BN.has(k));
    const onlyBn = [...BN.keys()].filter((k) => !EN.has(k));
    assert.deepEqual(onlyEn, [], `missing in bn: ${onlyEn}`);
    assert.deepEqual(onlyBn, [], `missing in en: ${onlyBn}`);
  });

  test('no empty strings', () => {
    for (const [k, v] of [...EN, ...BN]) {
      assert.equal(typeof v, 'string', k);
      assert.ok(v.trim().length > 0, `empty string for ${k}`);
    }
  });

  for (const [key, [en, bn]] of Object.entries(REQUIRED)) {
    test(`exact string ${key}`, () => {
      assert.equal(EN.get(key), en);
      assert.equal(BN.get(key), bn);
      assert.equal(t(key, {}, 'en'), en);
      assert.equal(t(key, {}, 'bn'), bn);
    });
  }

  test('every validator error code has err.<code> in en and bn', () => {
    const missing = [];
    for (const code of ERROR_CODES) {
      if (!EN.has(`err.${code}`)) missing.push(`en:err.${code}`);
      if (!BN.has(`err.${code}`)) missing.push(`bn:err.${code}`);
    }
    assert.deepEqual(missing, []);
  });
});

describe('t()', () => {
  test('falls back to en for an unknown language', () => {
    assert.equal(t('status.no_route', {}, 'xx'), 'No route available');
  });
});
