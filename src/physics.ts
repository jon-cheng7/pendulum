// Double pendulum, equal masses and arms, g = l = m = 1

/** angles from straight down, counter-clockwise */
export interface State {
    t1: number;
    t2: number;
    w1: number;
    w2: number;
}

/** shared with the map shaders */
export const DT = 0.01;
export const T_MAX = 1000;
/** seconds per time unit for 1 m arms: √(l/g) */
export const SECONDS_PER_UNIT = Math.sqrt(1 / 9.81);

export function rest(t1: number, t2: number): State {
    return { t1, t2, w1: 0, w2: 0 };
}

function derive(
    t1: number,
    t2: number,
    w1: number,
    w2: number,
): [number, number] {
    const d = t1 - t2;
    const sd = Math.sin(d);
    const cd = Math.cos(d);
    const den = 3 - Math.cos(2 * d);
    const a1 =
        (-3 * Math.sin(t1) -
            Math.sin(t1 - 2 * t2) -
            2 * sd * (w2 * w2 + w1 * w1 * cd)) /
        den;
    const a2 = (2 * sd * (2 * w1 * w1 + 2 * Math.cos(t1) + w2 * w2 * cd)) / den;
    return [a1, a2];
}

export function rk4(s: State, h: number): State {
    const [a1, b1] = derive(s.t1, s.t2, s.w1, s.w2);
    const [a2, b2] = derive(
        s.t1 + (h / 2) * s.w1,
        s.t2 + (h / 2) * s.w2,
        s.w1 + (h / 2) * a1,
        s.w2 + (h / 2) * b1,
    );
    const w1b = s.w1 + (h / 2) * a1;
    const w2b = s.w2 + (h / 2) * b1;
    const [a3, b3] = derive(
        s.t1 + (h / 2) * w1b,
        s.t2 + (h / 2) * w2b,
        s.w1 + (h / 2) * a2,
        s.w2 + (h / 2) * b2,
    );
    const w1c = s.w1 + (h / 2) * a2;
    const w2c = s.w2 + (h / 2) * b2;
    const [a4, b4] = derive(
        s.t1 + h * w1c,
        s.t2 + h * w2c,
        s.w1 + h * a3,
        s.w2 + h * b3,
    );
    const w1d = s.w1 + h * a3;
    const w2d = s.w2 + h * b3;
    return {
        t1: s.t1 + (h / 6) * (s.w1 + 2 * w1b + 2 * w1c + w1d),
        t2: s.t2 + (h / 6) * (s.w2 + 2 * w2b + 2 * w2c + w2d),
        w1: s.w1 + (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4),
        w2: s.w2 + (h / 6) * (b1 + 2 * b2 + 2 * b3 + b4),
    };
}

export function energy(s: State): number {
    const kinetic =
        0.5 *
        (2 * s.w1 * s.w1 +
            s.w2 * s.w2 +
            2 * s.w1 * s.w2 * Math.cos(s.t1 - s.t2));
    return kinetic - 2 * Math.cos(s.t1) - Math.cos(s.t2);
}

/** from rest: below this neither arm can reach the top */
export function canFlip(t1: number, t2: number): boolean {
    return 2 * Math.cos(t1) + Math.cos(t2) <= 1;
}

export function flipped(s: State): boolean {
    return Math.abs(s.t1) > Math.PI || Math.abs(s.t2) > Math.PI;
}

/** to [-π, π) */
export function wrap(a: number): number {
    return a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
}

/** boundary of the calm region: θ₂ = ±acos(1 − 2cos θ₁), |θ₁| ≤ π/2 */
export function boundary(samples: number): [number, number][] {
    const points: [number, number][] = [];
    for (let i = 0; i <= samples; i++) {
        const t1 = -Math.PI / 2 + (Math.PI * i) / samples;
        points.push([
            t1,
            Math.acos(Math.min(1, Math.max(-1, 1 - 2 * Math.cos(t1)))),
        ]);
    }
    for (let i = samples; i >= 0; i--) {
        const [t1, t2] = points[i] ?? [0, 0];
        points.push([t1, -t2]);
    }
    return points;
}
