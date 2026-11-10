// Componentes das seções: filtro e busca dos projetos, faixa das ferramentas, comparador rascunho → no ar, sanfona da
// trajetória, replay. Funcionam sozinhos, com ou sem enxame. Quando a pessoa mexe num deles (ponteiro ou teclado),
// o grupo ganha data-tocado e os agentes não o testam mais.
import { gsap } from 'gsap';

const raiz = document.documentElement;
const marcaToque = (el) => {
  const f = () => { el.dataset.tocado = ''; };
  el.addEventListener('pointerdown', f);
  el.addEventListener('keydown', f);
};
const sem = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// filtro em abas + busca: a aba apaga os de fora sem mexer no layout; a busca tira da grade os que não batem
function projetos(sec) {
  const grupo = sec.querySelector('.filtro');
  const bts = [...grupo.querySelectorAll('[data-filtro]')];
  const cards = [...sec.querySelectorAll('.projeto')];
  const campo = sec.querySelector('.busca__campo');
  const vazio = sec.querySelector('.projetos__vazio');
  let filtro = 'todos';
  const aplica = () => {
    const q = sem(campo.value);
    let algum = false;
    for (const c of cards) {
      const bate = !q || sem(c.dataset.busca + ' ' + c.textContent).includes(q);
      c.classList.toggle('some', !bate);
      c.classList.toggle('fora', bate && filtro !== 'todos' && c.dataset.tipo !== filtro);
      algum ||= bate;
    }
    vazio.hidden = algum;
  };
  bts.forEach((b) => b.addEventListener('click', () => {
    filtro = b.dataset.filtro;
    bts.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    aplica();
  }));
  campo.addEventListener('input', aplica);
  sec.querySelector('.projetos__limpa').addEventListener('click', () => { campo.value = ''; aplica(); campo.focus(); });
  marcaToque(grupo);
}

// faixa das ferramentas: corre devagar para a esquerda; pausa, setas (um logo por vez) e "ver todas" (vira grade).
// Enquanto os agentes ainda montam os logos, ela fica parada (as caixas são medidas no lugar).
function ferramentas(el) {
  const trilho = el.querySelector('.ferramentas__trilho');
  const orig = [...trilho.children];
  for (const li of orig) {
    const c = li.cloneNode(true);
    c.removeAttribute('data-camada');
    c.setAttribute('aria-hidden', 'true');
    trilho.append(c);
  }
  const pausa = el.querySelector('.ferramentas__pausa');
  const todas = el.querySelector('.ferramentas__todas');
  const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let x = 0;
  let parado = reduz;
  let empurra = null;
  const largura = () => trilho.scrollWidth / 2;
  const passo = () => orig[0].getBoundingClientRect().width;
  const pronto = () => !raiz.classList.contains('monta') || orig.every((li) => li.classList.contains('c-pronta'));
  const visivel = { v: false };
  new IntersectionObserver(([e]) => (visivel.v = e.isIntersecting)).observe(el);
  const poe = () => {
    const w = largura();
    x = ((x % w) + w) % w;
    trilho.style.transform = `translate3d(${-x}px, 0, 0)`;
  };
  gsap.ticker.add((_, dt) => {
    if (!visivel.v || el.classList.contains('todas') || empurra || parado || !pronto()) return;
    x += (dt / 1000) * 28;
    poe();
  });
  if (reduz) pausa.setAttribute('aria-pressed', 'true');
  pausa.addEventListener('click', () => {
    parado = !parado;
    pausa.setAttribute('aria-pressed', String(parado));
    pausa.setAttribute('aria-label', parado ? 'Continuar a faixa' : 'Pausar a faixa');
  });
  el.querySelectorAll('[data-passo]').forEach((b) => b.addEventListener('click', () => {
    const o = { x };
    empurra?.kill();
    empurra = gsap.to(o, {
      x: x + Number(b.dataset.passo) * passo(),
      duration: 0.5,
      ease: 'power3.out',
      onUpdate: () => { x = o.x; poe(); },
      onComplete: () => (empurra = null),
    });
  }));
  todas.addEventListener('click', () => {
    const abre = !el.classList.contains('todas');
    el.classList.toggle('todas', abre);
    todas.setAttribute('aria-expanded', String(abre));
    todas.querySelector('.ferramentas__todas-t').textContent = abre ? 'Ver menos' : 'Ver todas (17)';
    if (!abre) poe();
  });
}

// comparador: input range por cima de tudo (arrastar, clicar, setas do teclado); el.__poe(p) deixa o agente arrastar
function comparador(el) {
  const range = el.querySelector('.comp__range');
  el.__p = 50;
  el.__poe = (p) => {
    el.__p = Math.max(0, Math.min(100, p));
    el.style.setProperty('--p', `${el.__p}%`);
    range.value = String(Math.round(el.__p));
  };
  range.addEventListener('input', () => el.__poe(Number(range.value)));
  marcaToque(el);
}

// sanfona: uma aberta por vez; clicar na aberta fecha
function sanfona(lista) {
  const cabs = [...lista.querySelectorAll('.sanfona__cab')];
  cabs.forEach((cab) => cab.addEventListener('click', () => {
    const abre = cab.getAttribute('aria-expanded') !== 'true';
    for (const c of cabs) {
      const on = c === cab && abre;
      c.setAttribute('aria-expanded', String(on));
      const corpo = document.getElementById(c.getAttribute('aria-controls'));
      if (on && corpo.hidden) {
        corpo.hidden = false;
        corpo.classList.remove('entra');
        void corpo.offsetWidth;
        corpo.classList.add('entra');
      } else if (!on) corpo.hidden = true;
    }
  }));
  marcaToque(lista);
}

// formulário: monta o e-mail com o que a pessoa escreveu
function formulario(form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const corpo = `Nome: ${d.get('nome')}\nE-mail: ${d.get('email')}\n\nO que se repete:\n${d.get('tarefa')}`;
    location.href = `mailto:eduardotorres.nexus@gmail.com?subject=${encodeURIComponent('Projeto')}&body=${encodeURIComponent(corpo)}`;
  });
}

export function interface_() {
  document.querySelectorAll('.projetos').forEach(projetos);
  document.querySelectorAll('.ferramentas').forEach(ferramentas);
  document.querySelectorAll('.comp').forEach(comparador);
  document.querySelectorAll('.sanfona').forEach(sanfona);
  document.querySelectorAll('.form__corpo').forEach(formulario);
  // o play do card do contato é o "montar de novo" da barra
  document.querySelector('.replay__play')?.addEventListener('click', () => document.querySelector('.barra__refaz')?.click());
}
