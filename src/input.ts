// Map pointer + wheel → pan, zoom, pick

import type { Point } from './view.ts';

export interface MapInput {
    pan(dx: number, dy: number): void;
    zoom(factor: number, px: number, py: number): void;
    pinchStart(): void;
    /** spread relative to pinch start, anchored at start midpoint */
    pinch(px: number, py: number, spread: number): void;
    tap(px: number, py: number): void;
    doubleTap(px: number, py: number): void;
    hover(px: number, py: number): void;
    leave(): void;
}

const WHEEL_RATE = 0.0015;
// trackpad pinch = ctrl+wheel, small deltas
const PINCH_RATE = 0.01;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 30;

const distance = (a: Point, b: Point): number =>
    Math.hypot(a.x - b.x, a.y - b.y);

export function attachMapInput(el: HTMLElement, on: MapInput): void {
    const pointers = new Map<number, Point>();
    let press: (Point & { t: number }) | null = null;
    let moved = false;
    let lastTap: (Point & { t: number }) | null = null;
    let pinched = false;
    let spread = 0;
    let anchor: Point = { x: 0, y: 0 };

    const local = (e: MouseEvent): Point => {
        const box = el.getBoundingClientRect();
        return { x: e.clientX - box.left, y: e.clientY - box.top };
    };
    const onUi = (e: Event): boolean =>
        e.target instanceof Element &&
        e.target.closest('[data-pd-ui]') !== null;

    el.addEventListener('pointerdown', (e) => {
        if (onUi(e)) return;
        const at = local(e);
        press = pointers.size === 0 ? { ...at, t: performance.now() } : null;
        moved = false;
        el.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, at);
        if (pointers.size === 2) {
            pinched = true;
            spread = 0;
        }
    });

    el.addEventListener('pointermove', (e) => {
        const before = pointers.get(e.pointerId);
        const after = local(e);
        if (!before) {
            if (pointers.size === 0 && !onUi(e)) on.hover(after.x, after.y);
            return;
        }
        pointers.set(e.pointerId, after);
        const slop = e.pointerType === 'touch' ? 12 : 4;
        if (press && distance(after, press) > slop) moved = true;
        if (pointers.size === 1 && !pinched && moved) {
            on.pan(after.x - before.x, after.y - before.y);
        } else if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            if (!a || !b) return;
            const d = distance(a, b);
            // from pinch start: per-event deltas drift
            if (spread === 0) {
                spread = d;
                anchor = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                on.pinchStart();
            }
            if (spread > 0 && d > 0) on.pinch(anchor.x, anchor.y, d / spread);
        }
    });

    const end = (e: PointerEvent): void => {
        pointers.delete(e.pointerId);
        spread = 0;
        if (pointers.size > 0) return;
        if (pinched) {
            pinched = false;
            press = null;
            return;
        }
        const at = local(e);
        if (
            e.type === 'pointerup' &&
            press &&
            !moved &&
            performance.now() - press.t < 400
        ) {
            const now = performance.now();
            if (
                lastTap &&
                now - lastTap.t < DOUBLE_TAP_MS &&
                distance(at, lastTap) < DOUBLE_TAP_PX
            ) {
                lastTap = null;
                on.doubleTap(at.x, at.y);
            } else {
                lastTap = { ...at, t: now };
                on.tap(at.x, at.y);
            }
        }
        press = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', () => {
        if (pointers.size === 0) on.leave();
    });

    el.addEventListener(
        'wheel',
        (e) => {
            if (onUi(e)) return;
            e.preventDefault();
            const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
            const at = local(e);
            on.zoom(
                Math.exp(
                    e.deltaY * unit * (e.ctrlKey ? PINCH_RATE : WHEEL_RATE),
                ),
                at.x,
                at.y,
            );
        },
        { passive: false },
    );
}
