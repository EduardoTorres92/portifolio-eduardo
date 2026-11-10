// Os agentes: cursores coloridos de um editor multiplayer. Cada um tem uma posição no documento (x, y), um modo
// (seta, mira ou texto) e anda em curva até onde vai trabalhar. Um ticker só desenha todos.
import { gsap } from 'gsap';

export const CORES = [
  '#8be3c9', '#ffd36e', '#c2a8ff', '#ff9fb8', '#72d4ff', '#ffb07c',
  '#a6ee8c', '#f5a6ff', '#9fb4ff', '#ffe28f', '#7ff0dd', '#ff9a8e',
  '#c6ec8a', '#ffc6a8', '#9ee6ff', '#dcb4ff', '#ffd0e4', '#b7f5c4',
  // os que chegam de reforço nas seções de baixo
  '#ffe0a3', '#a8c8ff', '#f0b8ff', '#8ff0b0', '#ffb3c8', '#b9e8ff',
  '#ffcf8a', '#c8b8ff', '#d8f09a', '#ffbfa0',
];

const SVG = `
<svg class="ag__seta" viewBox="0 0 20 20"><path d="M3.6 2.4 17.4 8.7c.8.36.75 1.05-.08 1.3l-5.9 1.75-1.9 6.1c-.25.82-.95.85-1.3.06z"/></svg>
<svg class="ag__mira" viewBox="0 0 20 20"><path class="f" d="M10 3v14M3 10h14"/><path d="M10 3v14M3 10h14"/></svg>
<svg class="ag__ibeam" viewBox="0 0 20 20"><path class="f" d="M7.2 2.8h5.6M10 2.8v14.4M7.2 17.2h5.6"/><path d="M7.2 2.8h5.6M10 2.8v14.4M7.2 17.2h5.6"/></svg>`;

export function novoAgente(i, palco) {
  const el = document.createElement('div');
  el.className = 'ag';
  el.style.setProperty('--c', CORES[i % CORES.length]);
  el.innerHTML = SVG;
  palco.append(el);
  return { i, el, cor: CORES[i % CORES.length], x: -200, y: -200, rx: NaN, ry: NaN, modo: 'seta', mov: null };
}

export function criaAgentes(n, palco) {
  const lista = [];
  for (let i = 0; i < n; i++) lista.push(novoAgente(i, palco));
  const desenha = () => {
    for (const a of lista) {
      if (a.x === a.rx && a.y === a.ry) continue;
      a.el.style.transform = `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px, 0)`;
      a.rx = a.x;
      a.ry = a.y;
    }
  };
  gsap.ticker.add(desenha);
  return { lista, remove: () => { gsap.ticker.remove(desenha); lista.forEach((a) => a.el.remove()); } };
}

export function modo(a, m) {
  if (a.modo === m) return;
  a.el.classList.remove('is-' + a.modo);
  a.modo = m;
  if (m !== 'seta') a.el.classList.add('is-' + m);
}

// anda em curva (bezier quadrática com o ponto de controle para um lado) e resolve true ao chegar, false se outro
// movimento o interromper
export function vai(a, x, y, o = {}) {
  const x0 = a.x, y0 = a.y;
  const dx = x - x0, dy = y - y0;
  const d = Math.hypot(dx, dy) || 1;
  const k = (Math.random() * 2 - 1) * (o.curva ?? 0.22) * d;
  const cx = x0 + dx / 2 - (dy / d) * k;
  const cy = y0 + dy / 2 + (dx / d) * k;
  const dur = o.dur ?? Math.min(0.85, Math.max(0.26, 0.2 + d / 2100));
  const p = { t: 0 };
  a.mov?.kill();
  return new Promise((res) => {
    a.mov = gsap.to(p, {
      t: 1,
      duration: dur,
      ease: o.ease ?? 'power2.inOut',
      onUpdate() {
        const t = p.t, u = 1 - t;
        a.x = u * u * x0 + 2 * u * t * cx + t * t * x;
        a.y = u * u * y0 + 2 * u * t * cy + t * t * y;
      },
      onComplete: () => res(true),
      onInterrupt: () => res(false),
    });
  });
}

export function para(a) {
  a.mov?.kill();
  a.mov = null;
}

// anel que abre no ponto do clique, na cor do agente
export function clique(a, palco) {
  const el = document.createElement('i');
  el.className = 'clique';
  el.style.setProperty('--c', a.cor);
  el.style.transform = `translate(${a.x}px, ${a.y}px)`;
  palco.append(el);
  gsap.fromTo(el, { scale: 0.2, opacity: 1 }, { scale: 1, opacity: 0, duration: 0.42, ease: 'power2.out', onComplete: () => el.remove(), onInterrupt: () => el.remove() });
}
