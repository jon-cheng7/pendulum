// Physics checks

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DT, canFlip, energy, flipped, rest, rk4, wrap } from './physics.ts';

test('energy holds over 100 time units', () => {
    let s = rest(2, -1.5);
    const start = energy(s);
    for (let i = 0; i < 100 / DT; i++) s = rk4(s, DT);
    assert.ok(Math.abs(energy(s) - start) < 1e-4);
});

test('small swings stay small', () => {
    let s = rest(0.05, 0.05);
    for (let i = 0; i < 2000; i++) {
        s = rk4(s, DT);
        assert.ok(Math.abs(s.t1) < 0.2 && Math.abs(s.t2) < 0.2);
    }
});

test('nothing in the calm region flips', () => {
    for (const [a, b] of [
        [0.9, 1.7],
        [1.2, 0.5],
        [-0.4, -2],
    ] as const) {
        assert.equal(canFlip(a, b), false);
        let s = rest(a, b);
        for (let i = 0; i < 20000; i++) {
            s = rk4(s, DT);
            assert.equal(flipped(s), false);
        }
    }
});

test('upside down top arm flips fast', () => {
    assert.ok(canFlip(3, 0));
    let s = rest(3, 0);
    let t = 0;
    while (!flipped(s) && t < 100) {
        s = rk4(s, DT);
        t += DT;
    }
    assert.ok(t < 20);
});

test('wrap', () => {
    assert.ok(Math.abs(wrap(3 * Math.PI) - -Math.PI) < 1e-12);
    assert.ok(Math.abs(wrap(-0.5) - -0.5) < 1e-12);
});
