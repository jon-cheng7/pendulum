// Shareable state in the URL hash: #v=cx,cy,zoom&p=θ₁,θ₂&twin

export interface Shared {
    view: { cx: number; cy: number; zoom: number } | null;
    pick: [number, number] | null;
    twin: boolean;
}

function numbers(text: string | null, count: number): number[] | null {
    if (!text) return null;
    const values = text.split(',').map(Number);
    return values.length === count && values.every(Number.isFinite)
        ? values
        : null;
}

export function parseHash(hash: string): Shared {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const v = numbers(params.get('v'), 3);
    const p = numbers(params.get('p'), 2);
    return {
        view: v && v[2]! > 0 ? { cx: v[0]!, cy: v[1]!, zoom: v[2]! } : null,
        pick: p ? [p[0]!, p[1]!] : null,
        twin: params.has('twin'),
    };
}

export function formatHash(s: Shared): string {
    const parts: string[] = [];
    if (s.view) {
        const { cx, cy, zoom } = s.view;
        // enough digits to survive max zoom
        parts.push(
            `v=${cx.toFixed(6)},${cy.toFixed(6)},${Number(zoom.toPrecision(4))}`,
        );
    }
    if (s.pick) parts.push(`p=${s.pick[0].toFixed(5)},${s.pick[1].toFixed(5)}`);
    if (s.twin) parts.push('twin');
    return parts.join('&');
}
