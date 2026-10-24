import test from 'node:test';
import assert from 'node:assert/strict';
import { money, pct, perPerson, cents, monthly } from '../site/format.js';

test('money', () => {
  assert.equal(money(118), '$118M');
  assert.equal(money(2256.7), '$2.26B');
  assert.equal(money(0.5), '$500K');
  assert.equal(money(6.8), '$6.8M');
  assert.equal(money(2000), '$2B');
  assert.equal(money(-118), '-$118M');
  assert.equal(money(6486.9), '$6.49B');
  assert.equal(money(23.1), '$23.1M');
  assert.equal(money(80.1), '$80.1M');
  assert.equal(money(30), '$30M');
  assert.equal(money(181.4), '$181M');
});
test('money rounds before choosing the unit', () => {
  assert.equal(money(999.6), '$1B');
  assert.equal(money(0.9996), '$1M');
  assert.equal(money(99.96), '$100M');
  assert.equal(money(-0.0001), '$0');
  assert.equal(money(0), '$0');
});
test('pct', () => {
  assert.equal(pct(0.0694), '7%');
  assert.equal(pct(0.0694, 1), '6.9%');
});
test('perPerson', () => {
  assert.equal(perPerson(118, 1419531), '$83 per person per year');
  assert.equal(perPerson(119.2, 1419531), '$84 per person per year');
});
test('cents', () => {
  assert.equal(cents(118, 386.7), 'about 0.3¢ on each dollar');
  assert.equal(cents(23.1, 386.7), 'about 0.06¢ on each dollar');
  assert.equal(cents(103.2, 386.7), 'about 0.3¢ on each dollar');
});
test('monthly shows cents under $10', () => {
  assert.equal(monthly((23.1e6 / 549999) / 12), '$3.50 a month');
  assert.equal(monthly(17.88), '$18 a month');
  assert.equal(monthly(9.996), '$10 a month');
  assert.equal(monthly(9.994), '$9.99 a month');
});
