// Map overlay: ticks, calm boundary, start marker, live paths

import type { Run } from './pendulum.ts';
import { boundary } from './physics.ts';
import { planeToScreen, type Size, type View } from './view.ts';

export interface OverlayScene {
    view: View;
    size: Size;
    curve: boolean;
    origin: [number, number] | null;
    runs: readonly Run[];
}

const TICK_PX = 110;
const LIME = '#c5fb45';
const CYAN = '#45f0fb';
const MUTED = 'rgba(229,229,229,0.55)';
const LINE = 'rgba(255,255,255,0.22)';
const CURVE = boundary(160);

/** 1, 2 or 5 × 10^n, in units of π */
function niceStep(raw: number): number {
    const power = 10 ** Math.floor(Math.log10(raw));
    const unit = raw / power;
    return power * (unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10);
}

function piLabel(k: number, step: number): string {
    const decimals = Math.max(0, -Math.floor(Math.log10(step)));
    const v = Number(k.toFixed(decimals));
    if (v === 0) return '0';
    if (Math.abs(v) === 1) return v > 0 ? 'π' : '−π';
    return `${String(v).replace('-', '−')}π`;
}

export function createOverlay(
    parent: HTMLElement,
): (scene: OverlayScene) => void {
    const canvas = document.createElement('canvas');
    canvas.className = 'pd-overlay';
    canvas.setAttribute('aria-hidden', 'true');
    parent.append(canvas);
    const ctx = canvas.getContext('2d');

    return ({ view, size, curve, origin, runs }) => {
        if (!ctx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.round(size.w * dpr);
        const h = Math.round(size.h * dpr);
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size.w, size.h);
        const at = (x: number, y: number) => planeToScreen(view, size, x, y);
        ctx.font = '10px "Geist Mono", ui-monospace, monospace';
        ctx.lineWidth = 1;

        // ticks on the square's edges, kept on screen
        const step = niceStep((TICK_PX * view.scale) / Math.PI) * Math.PI;
        const corner = at(-Math.PI, -Math.PI);
        const bx = Math.min(size.w - 40, Math.max(0, corner.x));
        const by = Math.max(14, Math.min(size.h, corner.y));
        ctx.fillStyle = MUTED;
        ctx.strokeStyle = LINE;
        ctx.beginPath();
        const left = view.cx - (size.w / 2) * view.scale;
        const right = view.cx + (size.w / 2) * view.scale;
        for (
            let x = Math.ceil(Math.max(-Math.PI, left) / step) * step;
            x <= Math.min(Math.PI, right) + 1e-9;
            x += step
        ) {
            const px = at(x, 0).x;
            ctx.moveTo(px, by);
            ctx.lineTo(px, by - 5);
            ctx.fillText(piLabel(x / Math.PI, step / Math.PI), px + 3, by - 7);
        }
        const bottom = view.cy - (size.h / 2) * view.scale;
        const top = view.cy + (size.h / 2) * view.scale;
        for (
            let y = Math.ceil(Math.max(-Math.PI, bottom) / step) * step;
            y <= Math.min(Math.PI, top) + 1e-9;
            y += step
        ) {
            const py = at(0, y).y;
            ctx.moveTo(bx, py);
            ctx.lineTo(bx + 5, py);
            ctx.fillText(piLabel(y / Math.PI, step / Math.PI), bx + 8, py - 3);
        }
        ctx.stroke();
        ctx.fillText(
            'θ₁ →',
            Math.min(size.w - 44, at(Math.PI, 0).x - 40),
            by - 20,
        );
        ctx.fillText('↑ θ₂', bx + 8, Math.max(28, at(0, Math.PI).y + 16));

        if (curve) {
            ctx.strokeStyle = 'rgba(229,229,229,0.75)';
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            CURVE.forEach(([x, y], i) => {
                const p = at(x, y);
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // twin underneath; wraps break the line
        for (let r = runs.length - 1; r >= 0; r--) {
            const run = runs[r];
            const n = run?.pathLen ?? 0;
            if (!run || n < 2) continue;
            const cap = run.path.length / 2;
            const first = (run.pathHead - n + cap) % cap;
            ctx.strokeStyle =
                r === 0 ? 'rgba(197,251,69,0.8)' : 'rgba(69,240,251,0.8)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            let px = 0;
            let py = 0;
            for (let k = 0; k < n; k++) {
                const i = (first + k) % cap;
                const x = run.path[i * 2] ?? 0;
                const y = run.path[i * 2 + 1] ?? 0;
                const p = at(x, y);
                if (
                    k === 0 ||
                    Math.abs(x - px) > Math.PI ||
                    Math.abs(y - py) > Math.PI
                )
                    ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
                px = x;
                py = y;
            }
            ctx.stroke();
            const p = at(px, py);
            ctx.fillStyle = r === 0 ? LIME : CYAN;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }

        if (origin) {
            const p = at(origin[0], origin[1]);
            ctx.strokeStyle = CYAN;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
            ctx.moveTo(p.x - 14, p.y);
            ctx.lineTo(p.x - 10, p.y);
            ctx.moveTo(p.x + 10, p.y);
            ctx.lineTo(p.x + 14, p.y);
            ctx.moveTo(p.x, p.y - 14);
            ctx.lineTo(p.x, p.y - 10);
            ctx.moveTo(p.x, p.y + 10);
            ctx.lineTo(p.x, p.y + 14);
            ctx.stroke();
        }
    };
}
