// Map pan/zoom over the (θ₁, θ₂) square

export interface Size {
    w: number;
    h: number;
}

export interface Point {
    x: number;
    y: number;
}

/** scale: radians per CSS px, θ₂ up */
export interface View {
    cx: number;
    cy: number;
    scale: number;
}

const SPAN = 2 * Math.PI;
const MARGIN = 1.08;
// past this float32 can't tell neighbouring pixels apart
export const MAX_ZOOM = 2000;

export function fitView(size: Size): View {
    return {
        cx: 0,
        cy: 0,
        scale: (SPAN * MARGIN) / Math.max(1, Math.min(size.w, size.h)),
    };
}

export function zoomLevel(view: View, size: Size): number {
    return fitView(size).scale / view.scale;
}

/** keep some of the square on screen */
function clamp(view: View, size: Size): View {
    const fit = fitView(size).scale;
    const scale = Math.min(fit, Math.max(fit / MAX_ZOOM, view.scale));
    const cx = Math.min(Math.PI, Math.max(-Math.PI, view.cx));
    const cy = Math.min(Math.PI, Math.max(-Math.PI, view.cy));
    return { cx, cy, scale };
}

export function screenToPlane(
    view: View,
    size: Size,
    px: number,
    py: number,
): Point {
    return {
        x: view.cx + (px - size.w / 2) * view.scale,
        y: view.cy - (py - size.h / 2) * view.scale,
    };
}

export function planeToScreen(
    view: View,
    size: Size,
    x: number,
    y: number,
): Point {
    return {
        x: size.w / 2 + (x - view.cx) / view.scale,
        y: size.h / 2 - (y - view.cy) / view.scale,
    };
}

export function zoomAt(
    view: View,
    size: Size,
    px: number,
    py: number,
    factor: number,
): View {
    const anchor = screenToPlane(view, size, px, py);
    const scale = clamp({ ...view, scale: view.scale * factor }, size).scale;
    return clamp(
        {
            cx: anchor.x - (px - size.w / 2) * scale,
            cy: anchor.y + (py - size.h / 2) * scale,
            scale,
        },
        size,
    );
}

export function panBy(view: View, size: Size, dx: number, dy: number): View {
    return clamp(
        {
            ...view,
            cx: view.cx - dx * view.scale,
            cy: view.cy + dy * view.scale,
        },
        size,
    );
}

export function settle(view: View, size: Size): View {
    return clamp(view, size);
}

export function inSquare(x: number, y: number): boolean {
    return Math.abs(x) <= Math.PI && Math.abs(y) <= Math.PI;
}
