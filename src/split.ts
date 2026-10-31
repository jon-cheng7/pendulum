// Phone layout: draggable divider between map and pendulum

const DEFAULT = 0.55;
const MIN = 0.12;
const MAX = 0.88;
const KEY_STEP = 0.05;
const STORE = 'pd-split';
const DOUBLE_TAP_MS = 320;

export function createSplit(root: HTMLElement): void {
    const handle = document.createElement('div');
    handle.className = 'pd-split';
    handle.dataset.pdUi = '';
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'horizontal');
    handle.setAttribute('aria-label', 'Resize map and pendulum');
    root.append(handle);

    let split = DEFAULT;
    try {
        const saved = Number(localStorage.getItem(STORE));
        if (saved >= MIN && saved <= MAX) split = saved;
    } catch {
        // storage blocked
    }

    function set(value: number, save: boolean): void {
        split = Math.min(MAX, Math.max(MIN, value));
        root.style.setProperty('--split', `${(split * 100).toFixed(2)}%`);
        handle.setAttribute('aria-valuenow', String(Math.round(split * 100)));
        if (!save) return;
        try {
            localStorage.setItem(STORE, String(split));
        } catch {
            // storage blocked
        }
    }
    set(split, false);

    let dragging = false;
    let pressY = 0;
    let moved = false;
    let lastTap = 0;
    const at = (e: PointerEvent): number => {
        const box = root.getBoundingClientRect();
        return (e.clientY - box.top) / box.height;
    };
    handle.addEventListener('pointerdown', (e) => {
        dragging = true;
        pressY = e.clientY;
        moved = false;
        handle.setPointerCapture(e.pointerId);
        handle.dataset.active = '';
        e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        if (Math.abs(e.clientY - pressY) > 6) moved = true;
        if (moved) set(at(e), false);
    });
    const end = (): void => {
        if (!dragging) return;
        dragging = false;
        delete handle.dataset.active;
        // double tap: back to the default
        const now = performance.now();
        if (!moved && now - lastTap < DOUBLE_TAP_MS) set(DEFAULT, true);
        else set(split, true);
        lastTap = moved ? 0 : now;
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') set(split - KEY_STEP, true);
        else if (e.key === 'ArrowDown') set(split + KEY_STEP, true);
        else return;
        e.preventDefault();
        e.stopPropagation();
    });
}
