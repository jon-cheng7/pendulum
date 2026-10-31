// On-demand rAF loop with frame timing

export type Tick = (dt: number, now: number, frameMs: number | null) => void;

export interface Loop {
    request(): void;
    setVisible(visible: boolean): void;
}

const MAX_DT = 0.05;

export function createLoop(tick: Tick): Loop {
    let raf = 0;
    let last = 0;
    let visible = true;
    let missed = false;
    let inTick = false;
    let chained = false;

    function frame(now: number): void {
        raf = 0;
        const gap = now - last;
        last = now;
        // idle gap isn't render cost
        const frameMs = chained ? gap : null;
        chained = false;

        inTick = true;
        tick(Math.min(gap / 1000, MAX_DT), now, frameMs);
        inTick = false;
    }

    function request(): void {
        if (!visible) {
            missed = true;
            return;
        }
        if (raf !== 0) return;
        chained = inTick;
        raf = requestAnimationFrame(frame);
    }

    function setVisible(next: boolean): void {
        visible = next;
        if (!next && raf !== 0) {
            cancelAnimationFrame(raf);
            raf = 0;
            missed = true;
        }
        if (next && missed) {
            missed = false;
            request();
        }
    }

    return { request, setVisible };
}
