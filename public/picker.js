// A date picker in the shop's style, replacing the browser's built-in one.
// Picks a day, a month or a year; the value is always a 'YYYY-MM-DD' string
// (the 1st of the month for months, 1 January for years).
import { el } from './cats.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
                     'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const pad = n => String(n).padStart(2, '0');
export const toIso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const parseIso = iso => iso.split('-').map(Number);
const fromDate = date => toIso(date.getFullYear(), date.getMonth() + 1, date.getDate());
export const todayIso = () => fromDate(new Date());

// Moves a date by whole days, months or years (local time, so no timezone surprises)
export function shiftIso(iso, unit, amount) {
    const [y, m, d] = parseIso(iso);
    if (unit === 'day') return fromDate(new Date(y, m - 1, d + amount));
    if (unit === 'month') {
        const date = new Date(y, m - 1 + amount, 1);
        return toIso(date.getFullYear(), date.getMonth() + 1, 1);
    }
    return toIso(y + amount, 1, 1);
}

// The first day of the day/month/year that contains `iso`
export function snapIso(iso, unit) {
    const [y, m, d] = parseIso(iso);
    if (unit === 'day') return toIso(y, m, d);
    if (unit === 'month') return toIso(y, m, 1);
    return toIso(y, 1, 1);
}

export function formatPeriod(iso, unit, long = false) {
    const [y, m, d] = parseIso(iso);
    if (unit === 'day') return `${d} ${MONTHS[m - 1]}${long ? ` ${y}` : ''}`;
    if (unit === 'month') return long ? `${MONTHS_LONG[m - 1]} ${y}` : `${MONTHS[m - 1]} ${String(y).slice(2)}`;
    return String(y);
}

export function createPicker({ mode = 'month', value = todayIso(), min = '2000-01-01', max = todayIso(), label = 'date', onChange = () => {} }) {
    let current = snapIso(value, mode);
    let view = null; // what the popup is showing: { y, m } or { start } for years

    const allowed = iso => snapIso(iso, mode) >= snapIso(min, mode) && snapIso(iso, mode) <= snapIso(max, mode);
    const clamp = iso => {
        const s = snapIso(iso, mode);
        if (s < snapIso(min, mode)) return snapIso(min, mode);
        if (s > snapIso(max, mode)) return snapIso(max, mode);
        return s;
    };

    const prev = el('button', { type: 'button', className: 'picker-step', textContent: '‹' });
    const next = el('button', { type: 'button', className: 'picker-step', textContent: '›' });
    const display = el('button', { type: 'button', className: 'picker-display' });
    const pop = el('div', { className: 'picker-pop', hidden: true });
    const root = el('div', { className: 'picker' }, [prev, display, next, pop]);

    function set(iso, notify = true) {
        const v = clamp(iso);
        const changed = v !== current;
        current = v;
        refresh();
        if (changed && notify) onChange(current);
    }

    function refresh() {
        display.textContent = formatPeriod(current, mode, true);
        display.setAttribute('aria-label', `Choose ${label}: ${display.textContent}`);
        prev.setAttribute('aria-label', `Previous ${mode}`);
        next.setAttribute('aria-label', `Next ${mode}`);
        prev.disabled = !allowed(shiftIso(current, mode, -1));
        next.disabled = !allowed(shiftIso(current, mode, 1));
    }

    function cell(text, iso, { selected, today, disabled }) {
        return el('button', {
            type: 'button',
            className: ['picker-cell', selected && 'selected', today && 'today'].filter(Boolean).join(' '),
            textContent: text,
            disabled,
            onclick: () => { set(iso); close(); },
        });
    }

    function renderPop() {
        const today = todayIso();
        let title;
        let cells;
        let grid = 'picker-grid';

        if (mode === 'day') {
            const { y, m } = view;
            title = `${MONTHS_LONG[m - 1]} ${y}`;
            grid += ' days';
            const blanks = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday first
            const days = new Date(y, m, 0).getDate();
            cells = [
                ...WEEKDAYS.map(w => el('span', { className: 'picker-weekday', textContent: w })),
                ...Array.from({ length: blanks }, () => el('span')),
                ...Array.from({ length: days }, (_, i) => {
                    const iso = toIso(y, m, i + 1);
                    return cell(String(i + 1), iso, { selected: iso === current, today: iso === today, disabled: !allowed(iso) });
                }),
            ];
        } else if (mode === 'month') {
            title = String(view.y);
            cells = MONTHS.map((name, i) => {
                const iso = toIso(view.y, i + 1, 1);
                return cell(name, iso, { selected: iso === current, today: iso === snapIso(today, 'month'), disabled: !allowed(iso) });
            });
        } else {
            title = `${view.start} – ${view.start + 11}`;
            cells = Array.from({ length: 12 }, (_, i) => {
                const iso = toIso(view.start + i, 1, 1);
                return cell(String(view.start + i), iso, { selected: iso === current, today: iso === snapIso(today, 'year'), disabled: !allowed(iso) });
            });
        }

        const move = dir => () => {
            if (mode === 'day') {
                const [y, m] = parseIso(shiftIso(toIso(view.y, view.m, 1), 'month', dir));
                view = { y, m };
            } else if (mode === 'month') view = { y: view.y + dir };
            else view = { start: view.start + dir * 12 };
            renderPop();
        };

        const nowLabel = { day: 'Today', month: 'This month', year: 'This year' }[mode];
        pop.replaceChildren(
            el('div', { className: 'picker-head' }, [
                el('button', { type: 'button', className: 'picker-step', textContent: '‹', onclick: move(-1), ariaLabel: 'Earlier' }),
                el('strong', { textContent: title }),
                el('button', { type: 'button', className: 'picker-step', textContent: '›', onclick: move(1), ariaLabel: 'Later' }),
            ]),
            el('div', { className: grid }, cells),
            el('div', { className: 'picker-foot' }, [
                el('button', { type: 'button', className: 'picker-link', textContent: nowLabel, onclick: () => { set(today); close(); } }),
            ]),
        );
    }

    const onOutside = e => { if (!root.contains(e.target)) close(); };
    const onKey = e => { if (e.key === 'Escape') { close(); display.focus(); } };

    function open() {
        const [y, m] = parseIso(current);
        view = mode === 'day' ? { y, m } : mode === 'month' ? { y } : { start: Math.floor(y / 12) * 12 };
        renderPop();
        pop.hidden = false;
        root.classList.add('open');
        document.addEventListener('pointerdown', onOutside);
        document.addEventListener('keydown', onKey);
        pop.querySelector('.picker-cell.selected, .picker-cell:not(:disabled)')?.focus();
    }

    function close() {
        pop.hidden = true;
        root.classList.remove('open');
        document.removeEventListener('pointerdown', onOutside);
        document.removeEventListener('keydown', onKey);
    }

    display.addEventListener('click', () => (pop.hidden ? open() : close()));
    prev.addEventListener('click', () => set(shiftIso(current, mode, -1)));
    next.addEventListener('click', () => set(shiftIso(current, mode, 1)));
    refresh();

    return {
        element: root,
        get value() { return current; },
        set value(iso) { set(iso, false); },
        setMode(newMode) { mode = newMode; current = clamp(current); close(); refresh(); },
        setLimits(limits) {
            if (limits.min) min = limits.min;
            if (limits.max) max = limits.max;
            current = clamp(current);
            refresh();
        },
    };
}
