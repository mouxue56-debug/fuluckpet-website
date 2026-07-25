'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const syncKoneko = import('../tools/sync-koneko.js');

test('inSaleMissingPedigree reports available/reserved kittens missing papa or mama', async () => {
  const { inSaleMissingPedigree } = await syncKoneko;
  const cases = [
    [
      [{ breederId: 'A', status: 'available', papa: '', mama: '' }],
      [{ breederId: 'A', missing: '両方' }],
    ],
    [
      [{ breederId: 'B', status: 'available', papa: 'X', mama: '' }],
      [{ breederId: 'B', missing: '母' }],
    ],
    [
      [{ breederId: 'C', status: 'reserved', papa: '', mama: 'Y' }],
      [{ breederId: 'C', missing: '父' }],
    ],
    [
      [{ breederId: 'D', status: 'available', papa: 'X', mama: 'Y' }],
      [],
    ],
    [
      [{ breederId: 'E', status: 'sold', papa: '', mama: '' }],
      [],
    ],
    [
      [],
      [],
    ],
    [
      undefined,
      [],
    ],
  ];

  for (const [input, expected] of cases) {
    assert.deepEqual(inSaleMissingPedigree(input), expected);
  }
});
