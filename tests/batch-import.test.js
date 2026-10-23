'use strict';
const assert = require('assert').strict;
const { pairFiles } = require('../batch-import');
const file = name => ({ name });
const result = pairFiles(['Card-10_back.png', 'Card-2_FRONT.jpg', 'Card-10_front.webp', 'card-2_back.PNG',
  '孤岛_front.png', '孤岛_back.png', 'Missing_front.png', 'Conflict_front.png', 'conflict_FRONT.jpg',
  'Conflict_back.png', 'unknown.png', '_front.png'].map(file));
assert.deepEqual(result.pairs.map(p => p.name), ['Card-2', 'Card-10', '孤岛']);
assert.equal(result.pairs[0].front.name, 'Card-2_FRONT.jpg');
assert.equal(result.pairs[0].back.name, 'card-2_back.PNG');
assert.equal(result.issues.length, 4);
assert.equal(result.issues.find(p => p.name === 'Missing').issue, 'Missing back');
assert.equal(result.issues.find(p => p.name === 'Conflict').issue, 'Multiple front images');
assert.equal(pairFiles(['a_front_back.png', 'a_front_front.png'].map(file)).pairs[0].name, 'a_front');
assert.equal(pairFiles(['Cafe\u0301_front.png', 'Café_back.png'].map(file)).pairs.length, 1);
assert.deepEqual(pairFiles(['10-Forest_back.png', '02-Beach_front.png', '10-Forest_front.png', '02-Beach_back.png'].map(file)).pairs.map(p => p.name), ['02-Beach', '10-Forest']);
assert.deepEqual(pairFiles([]), { pairs: [], issues: [] });
console.log('PASS: batch pairing, natural order, case, Unicode, missing and ambiguous faces');
