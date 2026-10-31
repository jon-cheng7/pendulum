// Lesson cards

export interface LessonStage {
    reset(): void;
    flyTo(cx: number, cy: number, zoom: number): void;
    pick(t1: number, t2: number): void;
    setTwin(on: boolean): void;
    setCurve(on: boolean): void;
}

interface Lesson {
    title: string;
    /** trusted HTML, may hold MathML */
    body: string;
    tryIt?: { touch: string; mouse: string };
    setup(stage: LessonStage): void;
}

const sub = (base: string, n: number | string): string =>
    `<msub><mi>${base}</mi><mn>${n}</mn></msub>`;
const sq = (base: string, n: number): string =>
    `<msubsup><mi>${base}</mi><mn>${n}</mn><mn>2</mn></msubsup>`;
const t1 = sub('θ', 1);
const t2 = sub('θ', 2);
const D = '<mi>Δ</mi>';
const DEN = `<mrow><mn>3</mn><mo>−</mo><mi>cos</mi><mn>2</mn>${D}</mrow>`;

const EQUATIONS = `
<math display="block">${sub('α', 1)}<mo>=</mo><mfrac><mrow><mo>−</mo><mn>3</mn><mi>sin</mi>${t1}<mo>−</mo><mi>sin</mi><mo>(</mo>${t1}<mo>−</mo><mn>2</mn>${t2}<mo>)</mo><mo>−</mo><mn>2</mn><mi>sin</mi>${D}<mo>(</mo>${sq('ω', 2)}<mo>+</mo>${sq('ω', 1)}<mi>cos</mi>${D}<mo>)</mo></mrow>${DEN}</mfrac></math>
<math display="block">${sub('α', 2)}<mo>=</mo><mfrac><mrow><mn>2</mn><mi>sin</mi>${D}<mo>(</mo><mn>2</mn>${sq('ω', 1)}<mo>+</mo><mn>2</mn><mi>cos</mi>${t1}<mo>+</mo>${sq('ω', 2)}<mi>cos</mi>${D}<mo>)</mo></mrow>${DEN}</mfrac></math>`;

const ENERGY = `<math display="block"><mi>E</mi><mo>=</mo><mo>−</mo><mn>2</mn><mi>cos</mi>${t1}<mo>−</mo><mi>cos</mi>${t2}</math>`;
const CALM = `<math display="block"><mn>2</mn><mi>cos</mi>${t1}<mo>+</mo><mi>cos</mi>${t2}<mo>&gt;</mo><mn>1</mn></math>`;

const LESSONS: Lesson[] = [
    {
        title: 'THE MAP',
        body: `<p>Every pixel is a double pendulum let go from rest. Left to right is the starting angle of the top arm, θ₁. Bottom to top is the bottom arm, θ₂. Straight down is 0.</p>
<p>The colour is how long it swings before either arm goes over the top. Dark blue flips within a swing or two, cyan takes tens of time units, lime hundreds. Grey never flipped in the 1000 units I run it for. Black can't flip at all.</p>`,
        tryIt: {
            touch: 'TAP ANYWHERE ON THE MAP TO LET THAT PENDULUM GO.',
            mouse: 'CLICK ANYWHERE ON THE MAP TO LET THAT PENDULUM GO.',
        },
        setup(s) {
            s.reset();
            s.setTwin(false);
            s.setCurve(false);
        },
    },
    {
        title: 'THE MATH',
        body: `<p>Two equal masses on two equal, weightless arms. With gravity and arm length both set to 1, and Δ = θ₁ − θ₂, the angular accelerations are:</p>${EQUATIONS}
<p>There's no closed-form solution. Both the map and the pendulum step these forward a hundredth of a time unit at a time with RK4. One unit is √(l/g), about 0.32 s for one-metre arms.</p>`,
        setup(s) {
            s.pick(0.9, 1.7);
        },
    },
    {
        title: 'THE CALM MIDDLE',
        body: `<p>Let go from rest, all the pendulum has is its starting height:</p>${ENERGY}
<p>For the bottom arm to go over the top, θ₂ has to reach π. The cheapest way costs E = −1, with the top arm hanging straight down. So every start where</p>${CALM}
<p>can never flip. That's the dashed curve. The map doesn't bother simulating anything inside it.</p>`,
        tryIt: {
            touch: 'TAP INSIDE THE CURVE.',
            mouse: 'CLICK INSIDE THE CURVE.',
        },
        setup(s) {
            s.reset();
            s.setCurve(true);
        },
    },
    {
        title: 'SPIROGRAPHS',
        body: `<p>Inside the curve the motion is two swings at once, at frequencies that don't divide evenly. The path never quite repeats, so the bottom bob slowly fills a band, like a spirograph.</p>
<p>On the map its angles go round and round a closed region instead of wandering off.</p>
<p>Some starts outside the curve behave the same way. They have the energy to flip and, for the 1000 units I check, never use it. Those are the grey patches. This one is just outside.</p>`,
        setup(s) {
            s.setTwin(false);
            s.pick(1.4, 1.2);
        },
    },
    {
        title: 'CHAOS',
        body: `<p>The cyan twin starts 0.001 rad away from the lime one. For a while they move as one. Then the gap grows, roughly exponentially, until the two have nothing to do with each other.</p>
<p>Nothing random is happening. Just that tiny difference in the initial conditions leads to vastly different outcomes over time.</p>`,
        tryIt: {
            touch: 'WATCH THE GAP READOUT, THEN TRY A START INSIDE THE CURVE.',
            mouse: 'WATCH THE GAP READOUT, THEN TRY A START INSIDE THE CURVE.',
        },
        setup(s) {
            s.setTwin(true);
            s.pick(1.2, 2.6);
        },
    },
    {
        title: 'DETAIL AT EVERY SCALE',
        body: `<p>Zoom into the speckle and it stays speckled. Neighbouring pixels are neighbouring starts, and out here those flip at unrelated times however close they are.</p>
<p>Zoom stops at 2000×. Past that, 32-bit floats can't tell one pixel's start from the next.</p>`,
        tryIt: {
            touch: 'PINCH INTO THE SPECKLE.',
            mouse: 'SCROLL INTO THE SPECKLE.',
        },
        setup(s) {
            s.setTwin(false);
            s.flyTo(2.05, 1.05, 12);
        },
    },
];

export interface Learn {
    readonly open: boolean;
    toggle(): void;
}

export function createLearn(
    parent: HTMLElement,
    stage: LessonStage,
    onChange: (open: boolean) => void,
): Learn {
    const touch = matchMedia('(pointer: coarse)').matches;
    const el = (tag: string, className: string): HTMLElement => {
        const node = document.createElement(tag);
        node.className = className;
        return node;
    };
    const btn = (text: string, className = 'pd-btn'): HTMLButtonElement => {
        const node = el('button', className) as HTMLButtonElement;
        node.type = 'button';
        node.textContent = text;
        return node;
    };

    const panel = el('section', 'pd-learn');
    panel.dataset.pdUi = '';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Lessons');
    const head = el('div', 'pd-learn-head');
    const count = el('span', 'pd-learn-count');
    const close = btn('CLOSE');
    head.append(count, close);
    const title = el('h2', 'pd-learn-title');
    const body = el('div', 'pd-learn-body');
    const tryIt = el('p', 'pd-learn-try');
    const nav = el('div', 'pd-learn-nav');
    const prev = btn('← BACK');
    const dots = el('div', 'pd-learn-dots');
    const next = btn('NEXT →', 'pd-btn pd-btn-primary');
    const dotEls = LESSONS.map((_, i) => {
        const dot = btn('', 'pd-learn-dot');
        dot.setAttribute('aria-label', `Lesson ${i + 1}`);
        dot.addEventListener('click', () => show(i));
        dots.append(dot);
        return dot;
    });
    nav.append(prev, dots, next);
    panel.append(head, title, body, tryIt, nav);
    parent.append(panel);

    let index = 0;
    let open = false;

    function show(i: number): void {
        index = Math.max(0, Math.min(LESSONS.length - 1, i));
        const lesson = LESSONS[index];
        if (!lesson) return;
        count.textContent = `${index + 1} / ${LESSONS.length}`;
        title.textContent = lesson.title;
        body.innerHTML = lesson.body;
        tryIt.textContent = lesson.tryIt
            ? touch
                ? lesson.tryIt.touch
                : lesson.tryIt.mouse
            : '';
        tryIt.hidden = !lesson.tryIt;
        prev.disabled = index === 0;
        next.textContent =
            index === LESSONS.length - 1 ? 'EXPLORE →' : 'NEXT →';
        dotEls.forEach((dot, n) =>
            dot.setAttribute('aria-current', String(n === index)),
        );
        body.scrollTop = 0;
        lesson.setup(stage);
    }

    function setOpen(value: boolean): void {
        if (value === open) return;
        open = value;
        panel.hidden = !open;
        if (open) show(index);
        onChange(open);
    }

    close.addEventListener('click', () => setOpen(false));
    prev.addEventListener('click', () => show(index - 1));
    next.addEventListener('click', () => {
        if (index === LESSONS.length - 1) setOpen(false);
        else show(index + 1);
    });

    return {
        get open() {
            return open;
        },
        toggle() {
            setOpen(!open);
        },
    };
}
