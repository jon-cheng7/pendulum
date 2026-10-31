// Hash round trip

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatHash, parseHash } from './hash.ts';

test('round trip', () => {
    const s = {
        view: { cx: 1.5, cy: -0.25, zoom: 40 },
        pick: [0.9, 1.7] as [number, number],
        twin: true,
    };
    assert.deepEqual(parseHash(`#${formatHash(s)}`), s);
});

test('junk is ignored', () => {
    assert.deepEqual(parseHash('#v=1,x,3&p=2'), {
        view: null,
        pick: null,
        twin: false,
    });
    assert.deepEqual(parseHash(''), { view: null, pick: null, twin: false });
});
