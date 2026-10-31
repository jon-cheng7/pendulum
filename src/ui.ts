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
}

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
    mapBar.append(
        zoomOut,
        zoomIn,
        button('RESET', 'Whole map (0)', a.reset),
        curve,
        stats,
    );

    const status = document.createElement('p');
    status.className = 'pd-status';
    const mapText = document.createElement('span');
    const hint = document.createElement('span');
    hint.className = 'pd-status-hint';
    status.append(mapText, hint);

    map.append(brand, mapBar, status);

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

    let shown: string[] = [];
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
        },
        setHint(text) {
            if (hint.textContent !== text) hint.textContent = text;
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
