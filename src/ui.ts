// Chrome: brand, map controls, pendulum controls, readouts

export interface Actions {
    toggleLearn(): void;
    zoomIn(): void;
    zoomOut(): void;
    reset(): void;
    toggleCurve(): void;
    toggleStats(): void;
    togglePlay(): void;
    restart(): void;
    toggleTwin(): void;
    cycleSpeed(): void;
    clearTrail(): void;
    cycleColour(): void;
    /** log10 of the time to show */
    scrub(log: number): void;
    toggleScrubPlay(): void;
}

export type Toggle = 'learn' | 'curve' | 'stats' | 'twin';

export interface Ui {
    setPressed(name: Toggle, on: boolean): void;
    setPlaying(on: boolean): void;
    setSpeed(speed: number): void;
    /** map status line */
    setMap(text: string): void;
    setHint(text: string): void;
    setReadout(lines: string[]): void;
    /** shown: null = everything so far */
    setScrub(shown: number | null, reached: number, done: boolean): void;
    setScrubPlaying(on: boolean): void;
    setColour(mode: 'time' | 'arm'): void;
}

const ARMS: [string, string][] = [
    ['TOP ↺', '#c5fb45'],
    ['TOP ↻', '#45d9f2'],
    ['BOTTOM ↺', '#9466ff'],
    ['BOTTOM ↻', '#ff8f33'],
];

function button(
    label: string,
    title: string,
    onClick: () => void,
): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'pd-btn';
    el.textContent = label;
    el.title = title;
    el.addEventListener('click', onClick);
    return el;
}

function box(className: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = className;
    // input ignores these
    el.dataset.pdUi = '';
    return el;
}

export function createUi(map: HTMLElement, pend: HTMLElement, a: Actions): Ui {
    const brand = box('pd-brand');
    const name = document.createElement('h1');
    name.className = 'pd-brand-name';
    name.textContent = 'DOUBLE PENDULUM';
    const learn = button('LEARN', 'What am I looking at? (L)', a.toggleLearn);
    learn.classList.add('pd-btn-primary');
    brand.append(name, learn);

    const mapBar = box('pd-bar pd-bar-map');
    const zoomOut = button('−', 'Zoom out (-)', a.zoomOut);
    const zoomIn = button('+', 'Zoom in (+)', a.zoomIn);
    zoomOut.classList.add('pd-btn-square');
    zoomIn.classList.add('pd-btn-square');
    const curve = button('CURVE', 'Where it can never flip (C)', a.toggleCurve);
    const stats = button('STATS', 'Engine stats (H)', a.toggleStats);
    const colour = button(
        'TIME',
        'Colour by time or by which arm flips (V)',
        a.cycleColour,
    );
    mapBar.append(
        zoomOut,
        zoomIn,
        button('RESET', 'Whole map (0)', a.reset),
        curve,
        colour,
        stats,
    );

    // log time slider, track doubles as the legend
    const scrubRow = box('pd-scrub');
    const scrubPlay = button(
        '▶',
        'Replay the map filling in',
        a.toggleScrubPlay,
    );
    scrubPlay.classList.add('pd-btn-square');
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'pd-slider';
    slider.min = '0';
    slider.max = '3';
    slider.step = '0.001';
    slider.value = '3';
    slider.setAttribute('aria-label', 'Show flips up to this time');
    slider.addEventListener('input', () => a.scrub(Number(slider.value)));
    const scrubText = document.createElement('output');
    scrubText.className = 'pd-scrub-text';
    scrubRow.append(scrubPlay, slider, scrubText);

    const legend = document.createElement('span');
    legend.className = 'pd-legend';
    legend.hidden = true;
    for (const [label, swatch] of ARMS) {
        const item = document.createElement('span');
        item.style.setProperty('--swatch', swatch);
        item.textContent = label;
        legend.append(item);
    }

    const status = document.createElement('p');
    status.className = 'pd-status';
    const mapText = document.createElement('span');
    const hint = document.createElement('span');
    hint.className = 'pd-status-hint';
    status.append(mapText, legend, hint);

    map.append(brand, scrubRow, mapBar, status);

    const readout = document.createElement('dl');
    readout.className = 'pd-readout';

    const pendBar = box('pd-bar pd-bar-pend');
    const play = button('PAUSE', 'Play / pause (space)', a.togglePlay);
    const twin = button(
        'TWIN',
        'A second pendulum 0.001 rad off (T)',
        a.toggleTwin,
    );
    const speed = button('×1', 'Playback speed (S)', a.cycleSpeed);
    pendBar.append(
        play,
        button('RESTART', 'From the start again (R)', a.restart),
        twin,
        speed,
        button('CLEAR', 'Wipe the trail', a.clearTrail),
    );
    pend.append(readout, pendBar);

    const toggles: Record<Toggle, HTMLButtonElement> = {
        learn,
        curve,
        stats,
        twin,
    };
    for (const el of Object.values(toggles))
        el.setAttribute('aria-pressed', 'false');

    // hint is hidden on phones
    const narrow = matchMedia('(max-width: 760px)');
    function fitStatus(): void {
        status.hidden =
            !mapText.textContent &&
            legend.hidden &&
            (!hint.textContent || narrow.matches);
    }

    let shown: string[] = [];
    let dragging = false;
    slider.addEventListener('pointerdown', () => (dragging = true));
    slider.addEventListener('pointerup', () => (dragging = false));
    slider.addEventListener('pointercancel', () => (dragging = false));
    return {
        setPressed(which, on) {
            toggles[which].setAttribute('aria-pressed', String(on));
        },
        setPlaying(on) {
            play.textContent = on ? 'PAUSE' : 'PLAY';
        },
        setSpeed(value) {
            speed.textContent = `×${value}`;
        },
        setMap(text) {
            if (mapText.textContent !== text) mapText.textContent = text;
            fitStatus();
        },
        setHint(text) {
            if (hint.textContent !== text) hint.textContent = text;
            fitStatus();
        },
        setScrub(value, reached, done) {
            const t = value ?? reached;
            if (!dragging) slider.value = String(Math.log10(Math.max(1, t)));
            const text =
                value !== null
                    ? `t ≤ ${t < 10 ? t.toFixed(1) : Math.round(t)}`
                    : done
                      ? 'ALL FLIPS'
                      : `LIVE t ${Math.floor(reached)}`;
            if (scrubText.textContent !== text) scrubText.textContent = text;
        },
        setScrubPlaying(on) {
            scrubPlay.textContent = on ? '❚❚' : '▶';
        },
        setColour(mode) {
            colour.textContent = mode === 'arm' ? 'ARM' : 'TIME';
            scrubRow.dataset.mode = mode;
            legend.hidden = mode !== 'arm';
            fitStatus();
        },
        setReadout(lines) {
            if (lines.join('\n') === shown.join('\n')) return;
            shown = lines;
            readout.replaceChildren(
                ...lines.map((line) => {
                    const row = document.createElement('div');
                    const [term, value] = line.split('\t');
                    const dt = document.createElement('dt');
                    dt.textContent = term ?? '';
                    const dd = document.createElement('dd');
                    dd.textContent = value ?? '';
                    row.append(dt, dd);
                    return row;
                }),
            );
        },
    };
}
