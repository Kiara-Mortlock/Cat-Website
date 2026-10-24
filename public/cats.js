// Shared helpers for every page: API calls, formatting, the cat drawing and the top menu.

// Calls the API and returns the JSON, or throws an Error with the server's message
export async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.error || 'Something went wrong.');
        err.status = res.status;
        throw err;
    }
    return data;
}

const rand = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
export const formatPrice = cents => rand.format(cents / 100);

export function formatAge(months) {
    if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
    const years = Math.floor(months / 12);
    const rest = months % 12;
    return `${years} year${years === 1 ? '' : 's'}${rest ? ` ${rest} mo` : ''}`;
}

export const formatDate = iso =>
    new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

export const STATUS_LABELS = { available: 'Available', reserved: 'Reserved', sold: 'Sold' };

export function el(tag, props = {}, children = []) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
}

// Only follow ?next= to one of our own pages, never to another site
export function safeNext(fallback = 'index.html') {
    const next = new URLSearchParams(location.search).get('next');
    return next && /^[a-z-]+\.html(\?[\w=&-]*)?$/.test(next) ? next : fallback;
}

// ---------- Cat picture ----------

// Mix a #rrggbb colour towards black (amount < 0) or white (amount > 0)
function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const target = amount < 0 ? 0 : 255;
    const mix = c => Math.round(c + (target - c) * Math.abs(amount));
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function isDark(hex) {
    const n = parseInt(hex.slice(1), 16);
    return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 110;
}

// A sitting cat drawn in the cat's fur colour
function catSvg(fur) {
    const edge = shade(fur, -0.25);
    const belly = shade(fur, 0.35);
    const line = isDark(fur) ? '#d9cbbd' : '#4a3426';
    return `
<svg viewBox="0 0 200 200" role="img" aria-hidden="true">
  <path d="M138 168 C 188 162, 186 108, 158 96" fill="none" stroke="${edge}" stroke-width="15" stroke-linecap="round"/>
  <ellipse cx="100" cy="146" rx="50" ry="44" fill="${fur}" stroke="${edge}" stroke-width="2"/>
  <ellipse cx="100" cy="156" rx="26" ry="28" fill="${belly}"/>
  <ellipse cx="80" cy="186" rx="13" ry="8" fill="${belly}" stroke="${edge}" stroke-width="2"/>
  <ellipse cx="120" cy="186" rx="13" ry="8" fill="${belly}" stroke="${edge}" stroke-width="2"/>
  <polygon points="64,66 70,24 98,52" fill="${fur}" stroke="${edge}" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="136,66 130,24 102,52" fill="${fur}" stroke="${edge}" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="71,58 74,36 90,52" fill="#f2a5a5"/>
  <polygon points="129,58 126,36 110,52" fill="#f2a5a5"/>
  <circle cx="100" cy="86" r="40" fill="${fur}" stroke="${edge}" stroke-width="2"/>
  <ellipse cx="85" cy="84" rx="7" ry="9" fill="#7aa34a"/>
  <ellipse cx="115" cy="84" rx="7" ry="9" fill="#7aa34a"/>
  <ellipse cx="85" cy="85" rx="2.5" ry="7" fill="#1d1d1d"/>
  <ellipse cx="115" cy="85" rx="2.5" ry="7" fill="#1d1d1d"/>
  <circle cx="87" cy="80" r="2" fill="#fff"/>
  <circle cx="117" cy="80" r="2" fill="#fff"/>
  <polygon points="95,98 105,98 100,104" fill="#e88a9a"/>
  <path d="M100 104 Q96 110 90 108 M100 104 Q104 110 110 108" fill="none" stroke="${line}" stroke-width="2" stroke-linecap="round"/>
  <path d="M78 100 L52 96 M78 105 L52 108 M122 100 L148 96 M122 105 L148 108" stroke="${line}" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;
}

// The cat's photo if it has one, otherwise the drawing
export function catPicture(cat, className = 'cat-picture') {
    const box = el('div', { className });
    if (cat.photo_url) {
        box.append(el('img', { src: cat.photo_url, alt: `Photo of ${cat.name}`, loading: 'lazy' }));
    } else {
        // fur_color is checked to be #rrggbb by the server and the database
        box.innerHTML = catSvg(cat.fur_color);
    }
    return box;
}

// ---------- Top menu ----------

// Fills <header id="site-nav"> and resolves to the logged-in user, or null
export async function mountNav(active) {
    const header = document.getElementById('site-nav');
    let user = null;
    try {
        ({ user } = await api('/api/me'));
    } catch {
        // Treat a failed check as logged out; the page still works for browsing
    }

    const link = (href, label, key) => el('a', { href, textContent: label, className: key === active ? 'active' : '' });
    const links = [link('index.html', 'Shop', 'shop')];
    if (user) links.push(link('report.html', 'Sales report', 'report'));

    const right = user
        ? [
            el('span', { className: 'hello', textContent: `Hi, ${user.name}` }),
            Object.assign(el('button', { className: 'btn secondary small', textContent: 'Log out' }), {
                onclick: async () => {
                    await api('/api/logout', { method: 'POST' });
                    location.href = 'index.html';
                },
            }),
        ]
        : [
            link('login.html', 'Log in', 'login'),
            el('a', { href: 'signup.html', className: 'btn small', textContent: 'Sign up' }),
        ];

    header.replaceChildren(el('div', { className: 'nav-inner' }, [
        el('a', { href: 'index.html', className: 'brand', textContent: '🐾 Selling Cats' }),
        el('nav', { className: 'links' }, links),
        el('div', { className: 'account' }, right),
    ]));
    return user;
}
