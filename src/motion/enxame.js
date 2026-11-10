// O enxame: agentes montam a página na frente de quem vê, como colegas num editor multiplayer.
//
// Cada [data-camada] é uma camada. Montar uma camada são duas tarefas:
//   1. esqueleto: um agente vai ao canto dela e arrasta a caixa de seleção até o outro canto (medida ao vivo), e a
//      caixa fica com o placeholder cinza;
//   2. conteúdo: um agente (outro, às vezes) volta e aplica a camada: digita o texto, acende o título, mostra o
//      bloco, revela a foto em cinza e depois em cor, acende o fundo.
// As camadas se juntam em montagens ([data-montagem]; no celular também [data-parte]), que começam quando entram na
// tela. Os agentes pegam primeiro os esqueletos e depois os conteúdos, o mais perto de onde estão. Uma camada dentro
// de outra espera a de fora; o fundo (quadro) espera todas as outras da montagem.
//
// Rolagem durante a montagem do hero acelera (5×); montagem que sai da tela fecha na hora. ?pronto e movimento
// reduzido abrem a página já montada.
import { gsap } from 'gsap';
import { CORES, criaAgentes, novoAgente, modo, vai, para, clique } from './agentes.js';
import { caixa, limpaEtiquetas } from './caixas.js';
import { divide, digita, junta } from './digita.js';

const raiz = document.documentElement;
const celular = matchMedia('(max-width: 760px)');
const rand = (a, b) => a + Math.random() * (b - a);
const relogio = () => gsap.globalTimeline.time();
const espera = (s) => new Promise((res) => { gsap.to({}, { duration: s, onComplete: () => res(true), onInterrupt: () => res(false) }); });
const anima = (alvo, vars) => new Promise((res) => { gsap.to(alvo, { ...vars, onComplete: () => res(true), onInterrupt: () => res(false) }); });
const rectDoc = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
};
const naTela = (el) => {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.width > 0;
};

export function enxame(barra) {
  window.__enxame = true;

  const camadas = [...document.querySelectorAll('[data-camada]')].map((el, i) => ({
    el, i,
    tipo: el.dataset.camada,
    casca: !!el.querySelector('[data-camada]'),
    estado: 'oculta',
    pai: null, grupo: null, caixa: null, html: null, div: null, r: null,
  }));
  const porEl = new Map(camadas.map((c) => [c.el, c]));
  for (const c of camadas) {
    const p = c.el.parentElement?.closest('[data-camada]');
    c.pai = p ? porEl.get(p) : null;
  }
  barra.total(camadas.length);

  // página já montada: ?pronto ou movimento reduzido
  if (!raiz.classList.contains('monta')) {
    barra.agentes(celular.matches ? 8 : 18, CORES);
    barra.camadas(camadas.length);
    barra.estado('pronta');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) raiz.classList.add('sem-agentes');
    barra.aoRefazer(() => {
      const u = new URL(location.href);
      u.searchParams.delete('pronto');
      location.href = u.toString();
    });
    barra.aoTour(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }));
    return;
  }

  const palco = document.createElement('div');
  palco.className = 'enxame';
  palco.setAttribute('aria-hidden', 'true');
  document.body.append(palco);

  const n = celular.matches ? 8 : 18;
  const { lista: ags } = criaAgentes(n, palco);
  barra.agentes(n, CORES);

  let geracao = 0;
  let fila = [];
  let grupos = [];
  let feitas = 0;
  let introViva = false;
  let primeiraLeva = false;
  let base = 1;
  let turbo = 1;
  let emTour = false;
  let rolagemTour = null;
  let ioEntra = null;
  let ioSai = null;
  let testes = [];       // componentes que um agente testa depois de montar (abas, filtro)
  let testando = 0;
  let fecho = null;      // o botão do contato: no fim, os agentes se juntam em volta dele
  let rumo = 0;          // muda quando os agentes parados devem trocar de destino
  let trabalho = 0;      // tempo (ms) com alguma montagem em andamento, para a barra no fim
  let desde = null;
  const relogioLiga = () => { if (desde == null) desde = performance.now(); };
  const relogioDesliga = () => { if (desde != null) { trabalho += performance.now() - desde; desde = null; } };

  // sinal de "tem novidade na fila": acorda os agentes parados
  let sinal;
  let novidade = new Promise((r) => (sinal = r));
  const avisa = () => { const s = sinal; novidade = new Promise((r) => (sinal = r)); s(); };
  const aplicaVel = () => gsap.globalTimeline.timeScale(base * turbo);

  // ---------- montagens ----------
  function montaGrupos() {
    const sel = celular.matches ? '[data-montagem], [data-parte]' : '[data-montagem]';
    const mapa = new Map([...document.querySelectorAll(sel)].map((el) => [el, { el, camadas: [], estado: 'espera', inicial: false }]));
    for (const c of camadas) {
      const g = mapa.get(c.el.closest(sel));
      c.grupo = g ?? null;
      g?.camadas.push(c);
    }
    grupos = [...mapa.values()].filter((g) => g.camadas.length);
  }

  function inicia(g) {
    if (g.estado !== 'espera') return;
    g.estado = 'montando';
    g.inicial = primeiraLeva;
    barra.estado('montando');
    relogioLiga();
    chegam(g);
    // fora do lugar: o elemento nasce deslocado e um agente o arrasta até encaixar (antes de medir qualquer caixa)
    for (const c of g.camadas) {
      if (c.estado === 'pronta' || !c.el.dataset.ajusta) continue;
      const k = celular.matches ? 0.5 : 1;
      const [dx, dy] = c.el.dataset.ajusta.split(',').map((n) => Number(n) * k);
      c.ajuste = [dx, dy];
      gsap.set(c.el, { x: dx, y: dy });
    }
    const novas = [];
    const dups = new Map();
    for (const c of g.camadas) {
      if (c.estado === 'pronta') continue;
      const r = rectDoc(c.el);
      if (r.w < 1 || r.h < 1) { finaliza(c, true); continue; } // escondida neste tamanho de tela
      c.r = r;
      // item repetido de uma lista: não tem esqueleto, sai de uma cópia de um item pronto
      const u = unidadeDup(c.el);
      if (u) {
        if (!dups.has(u)) dups.set(u, []);
        dups.get(u).push(c);
        continue;
      }
      // a palavra marcada não tem esqueleto: o agente seleciona e pinta depois que a frase foi digitada
      if (c.tipo === 'marca') fila.push({ fase: 'conteudo', c, g, em: 0, x: r.x, y: r.y });
      else novas.push({ fase: 'esqueleto', c, g, em: 0, x: r.x, y: r.y });
    }
    // montagem em paralelo: as caixas dos cards saem primeiro, cada uma com um agente
    if (g.el.closest('[data-paralelo]')) novas.sort((a, b) => b.c.casca - a.c.casca);
    fila.push(...novas);
    for (const [u, cs] of dups) {
      const r = rectDoc(u);
      fila.push({ fase: 'duplica', u, cs, g, em: 0, x: r.x, y: r.y });
    }
    if (g.estado === 'montando' && g.camadas.every((c) => c.estado === 'pronta')) fimDoGrupo(g);
    avisa();
  }

  function fimDoGrupo(g) {
    g.estado = 'pronta';
    fila = fila.filter((t) => t.g !== g);
    if (turbo !== 1 && !introViva && !grupos.some((x) => x.inicial && x.estado === 'montando')) { turbo = 1; aplicaVel(); }
    if (!g.forcado) {
      // montou na frente de quem vê: um agente testa os componentes; no contato, todos se juntam no botão
      for (const el of g.el.querySelectorAll('[data-teste]')) {
        if (!('tocado' in el.dataset)) testes.push({ fase: 'teste', el, g, seq: el.dataset.teste === 'arraste' ? null : el.dataset.teste.split(',').map(Number) });
      }
      if ('fecho' in g.el.dataset) { fecho = g.el.querySelector('[data-alvo]') ?? g.el; rumo++; }
    }
    if (!grupos.some((x) => x.estado === 'montando')) {
      relogioDesliga();
      if (feitas >= camadas.length) { barra.fim(ags.length, Math.round(trabalho / 100) / 10); rumo++; } // página pronta: a fila liga
      else barra.estado('parada');
    }
    avisa();
  }

  // fecha a montagem na hora (saiu da tela, mudou o tamanho da janela)
  function conclui(g) {
    if (g.estado === 'pronta') return;
    g.forcado = true;
    tiraFantasmas(g);
    for (const c of g.camadas) finaliza(c, true);
    if (g.estado !== 'pronta') fimDoGrupo(g);
  }

  function finaliza(c, rapido = false) {
    if (c.estado === 'pronta') return;
    c.estado = 'pronta';
    const el = c.el;
    if (c.div) { junta(c.div); c.div = null; }
    if (c.html != null) { el.innerHTML = c.html; c.html = null; }
    if (rapido) { el.classList.add('c-ja'); setTimeout(() => el.classList.remove('c-ja'), 80); }
    gsap.killTweensOf(el);
    gsap.set(el, { clearProps: 'opacity,filter,transform' });
    el.classList.remove('c-viva');
    el.classList.add('c-pronta');
    c.caixa?.some(rapido);
    c.caixa = null;
    feitas++;
    barra.camadas(feitas);
    const g = c.grupo;
    if (g && g.estado !== 'pronta' && g.camadas.every((x) => x.estado === 'pronta')) fimDoGrupo(g);
    else avisa();
  }

  // ---------- fila ----------
  // ordem de escolha: o título e o fundo (a virada do rascunho para a página) furam a fila; depois todos os
  // esqueletos; depois os conteúdos
  function disponiveis() {
    const t0 = relogio();
    const urgente = [];
    const esq = [];
    const con = [];
    for (const t of fila) {
      if (t.g.estado !== 'montando' || t.em > t0) continue;
      if (t.fase === 'esqueleto') { esq.push(t); continue; }
      if (t.fase === 'duplica') { if (fonteDe(t.u)) esq.push(t); continue; }
      const c = t.c;
      if (c.pai && c.pai.estado !== 'pronta') continue;
      if (c.tipo === 'quadro' && !fundoPodeAcender(t.g)) continue;
      (c.tipo === 'titulo' || c.tipo === 'quadro' ? urgente : con).push(t);
    }
    return urgente.length ? urgente : esq.length ? esq : con;
  }

  // o fundo acende logo depois do título (ou, sem título, com metade da montagem pronta): o cinza de rascunho não
  // fica até o fim, e o resto termina de entrar já sobre o fundo escuro
  function fundoPodeAcender(g) {
    const outras = g.camadas.filter((x) => x.tipo !== 'quadro');
    const titulos = outras.filter((x) => x.tipo === 'titulo');
    if (titulos.length) return titulos.every((x) => x.estado === 'pronta');
    return outras.filter((x) => x.estado === 'pronta').length >= outras.length * 0.5;
  }

  // um teste só sai quando o componente está inteiro na tela (senão ninguém vê o agente testando)
  const inteiro = (el) => {
    const r = el.getBoundingClientRect();
    return r.top > 56 && r.bottom < innerHeight - 70;
  };
  const testeLivre = () => testes.find((t) => inteiro(t.el));
  const temTrabalho = () => disponiveis().length > 0 || !!testeLivre();

  // o que já passou para cima da tela (a pessoa rolou para baixo com a montagem em andamento) fecha na hora: nenhum
  // agente atravessa a página de volta para montar um pedaço que ninguém está vendo
  function podaPassadas() {
    const fechar = [];
    fila = fila.filter((t) => {
      if (t.fase === 'teste' || t.g.estado !== 'montando') return true;
      const el = t.c?.el ?? t.u;
      if (!el || el.getBoundingClientRect().bottom >= 0) return true;
      fechar.push(t);
      return false;
    });
    for (const t of fechar) {
      if (t.fase === 'duplica') t.cs.forEach((c) => finaliza(c, true));
      else finaliza(t.c, true);
    }
  }

  function pega(a) {
    podaPassadas();
    const pool = disponiveis().slice(0, 5);
    if (!pool.length) {
      const t = testeLivre();
      if (t) testes.splice(testes.indexOf(t), 1);
      return t ?? null;
    }
    let melhor = pool[0];
    let md = Infinity;
    for (const t of pool) {
      const d = Math.hypot(t.x - a.x, t.y - a.y);
      if (d < md) { md = d; melhor = t; }
    }
    fila.splice(fila.indexOf(melhor), 1);
    return melhor;
  }

  // ---------- tarefas ----------
  async function esqueleto(a, { c, g }, gen) {
    const vivo = () => gen === geracao && g.estado === 'montando' && c.estado !== 'pronta';
    const r = c.r;
    if (!(await vai(a, r.x, r.y)) || !vivo()) return;
    modo(a, 'mira');
    const grande = r.w * r.h > 9000;
    const cx = caixa(palco, r, {
      icone: c.tipo === 'foto' || c.tipo === 'titulo' || c.tipo === 'quadro' || (c.tipo === 'bloco' && !c.casca && grande),
      fundo: c.tipo === 'quadro' ? c.el : null,
      grande: r.w * r.h > 60000,
    });
    c.caixa = cx;
    const p = { k: 0 };
    const dur = Math.min(0.7, Math.max(0.2, 0.16 + Math.sqrt(r.w * r.h) / 1600));
    const ok = await anima(p, {
      k: 1,
      duration: dur,
      ease: 'power2.inOut',
      onUpdate() {
        const w = r.w * p.k, h = r.h * p.k;
        a.x = r.x + w;
        a.y = r.y + h;
        cx.tamanho(w, h);
      },
    });
    modo(a, 'seta');
    if (!ok || !vivo()) return;
    cx.fixa();
    c.estado = 'esqueleto';
    const atraso = rand(0.3, 0.9);
    fila.push({ fase: 'conteudo', c, g, em: relogio() + atraso, x: r.x + Math.min(r.w, 40), y: r.y + Math.min(r.h, 30) });
    gsap.delayedCall(atraso, avisa);
  }

  async function conteudo(a, { c, g }, gen) {
    const vivo = () => gen === geracao && g.estado === 'montando' && c.estado !== 'pronta';
    if (c.tipo === 'texto') {
      c.div = divide(c.el);
      const u0 = c.div.unidades.find((u) => u.textContent.trim()) ?? c.div.unidades[0];
      if (!u0) return finaliza(c);
      const r0 = u0.getBoundingClientRect();
      if (!(await vai(a, r0.left + scrollX + 4, r0.top + scrollY + r0.height * 0.75)) || !vivo()) return;
      modo(a, 'texto');
      c.caixa?.digitando();
      c.el.classList.add('c-viva');
      const fonte = parseFloat(getComputedStyle(c.el).fontSize) || 16;
      const ok = await digita(c.div, a, palco, fonte);
      modo(a, 'seta');
      if (ok && vivo() && c.ajuste) await ajusta(a, c, vivo);
      if (ok && vivo()) finaliza(c);
      return;
    }
    if (c.tipo === 'marca') {
      if ((await aplicaMarca(a, c, vivo)) && vivo()) finaliza(c);
      return;
    }
    const r = rectDoc(c.el);
    const px = r.x + r.w * rand(0.3, 0.7);
    const py = r.y + Math.min(r.h, innerHeight * 0.8) * rand(0.3, 0.7);
    if (!(await vai(a, px, py)) || !vivo()) return;
    clique(a, palco);
    if (c.tipo === 'titulo') await acendeTitulo(c);
    else if (c.tipo === 'foto') await revelaFoto(c);
    else if (c.tipo === 'quadro') await revelaQuadro(c);
    else await revelaBloco(c);
    if (vivo() && c.ajuste) await ajusta(a, c, vivo);
    if (vivo()) finaliza(c);
  }

  // palavra marcada: o agente seleciona a palavra (caixa azul arrastada) e pinta o bloco vermelho por trás dela
  async function aplicaMarca(a, c, vivo) {
    const r0 = rectDoc(c.el);
    const r = { x: r0.x - 3, y: r0.y, w: r0.w + 6, h: r0.h };
    if (!(await vai(a, r.x, r.y)) || !vivo()) return false;
    modo(a, 'mira');
    const cx = caixa(palco, r);
    c.caixa = cx;
    const p = { k: 0 };
    const ok = await anima(p, {
      k: 1,
      duration: 0.32,
      ease: 'power2.inOut',
      onUpdate() {
        const w = r.w * p.k, h = r.h * p.k;
        a.x = r.x + w;
        a.y = r.y + h;
        cx.tamanho(w, h);
      },
    });
    modo(a, 'seta');
    if (!ok || !vivo()) return false;
    cx.el.classList.add('fixa');
    if (!(await espera(0.25)) || !vivo()) return false;
    clique(a, palco);
    c.el.classList.add('c-pronta');
    cx.some(false, 0.45);
    c.caixa = null;
    return espera(0.5);
  }

  // teste de um componente pronto: o agente clica nos botões da sequência e, se mudou alguma coisa, volta ao
  // primeiro. Para se a pessoa mexer no componente ou ele sair da tela.
  async function testa(a, t, gen) {
    if (!t.seq) return arrasta(a, t, gen);
    const { el, seq } = t;
    testando++;
    const bts = [...el.querySelectorAll('button')];
    const pode = () => gen === geracao && !('tocado' in el.dataset) && naTela(el);
    let mexeu = false;
    try {
      if (!(await espera(0.3))) return;
      for (const i of seq) {
        const b = bts[i];
        if (!b || !pode()) break;
        const r = rectDoc(b);
        if (!(await vai(a, r.x + r.w * rand(0.35, 0.65), r.y + r.h * 0.62)) || !pode()) break;
        clique(a, palco);
        b.click();
        mexeu = i !== 0;
        if (!(await espera(i === 0 ? 0.3 : 1.3))) break;
      }
    } finally {
      if (mexeu && gen === geracao && !('tocado' in el.dataset)) bts[0]?.click();
      testando--;
      avisa();
    }
  }

  // comparador: o agente pega a alça, arrasta até quase um lado, até quase o outro e devolve ao meio
  async function arrasta(a, { el }, gen) {
    testando++;
    const pode = () => gen === geracao && !('tocado' in el.dataset) && naTela(el);
    const ponto = (p) => { const r = rectDoc(el); return [r.x + (r.w * p) / 100, r.y + r.h / 2 + 6]; };
    try {
      if (!(await espera(0.3))) return;
      let [x, y] = ponto(el.__p ?? 50);
      if (!(await vai(a, x, y)) || !pode()) return;
      clique(a, palco);
      el.classList.add('arrastando');
      for (const alvo of [16, 84, 50]) {
        const o = { p: el.__p ?? 50 };
        const ok = await anima(o, {
          p: alvo,
          duration: Math.max(0.4, Math.abs(alvo - o.p) / 55),
          ease: 'power2.inOut',
          onUpdate() {
            if (!pode()) return;
            el.__poe(o.p);
            [a.x, a.y] = ponto(o.p);
          },
        });
        if (!ok || !pode()) break;
        if (!(await espera(alvo === 50 ? 0.1 : 0.45))) break;
      }
    } finally {
      el.classList.remove('arrastando');
      testando--;
      avisa();
    }
  }

  // ---------- duplicar ----------
  // Lista com data-duplica: o primeiro item é montado do zero; cada um dos outros sai de uma cópia. Um agente
  // seleciona um item pronto, arrasta a cópia (com o cursor de copiar) até o lugar do novo e solta; a estrutura fica
  // (fundos, fios, ícones) e o conteúdo troca: os textos são digitados de novo e a imagem é revelada.
  const unidadeDup = (el) => {
    const u = el.closest('[data-duplica] > *');
    return u && u !== u.parentElement.firstElementChild ? u : null;
  };
  const camadasDe = (u) => [u, ...u.querySelectorAll('[data-camada]')].map((e) => porEl.get(e)).filter(Boolean);
  const unidadePronta = (u) => { const cs = camadasDe(u); return cs.length > 0 && cs.every((c) => c.estado === 'pronta'); };
  // a origem da cópia: o item pronto mais perto, de preferência o de cima
  function fonteDe(u) {
    const irmaos = [...u.parentElement.children].filter((e) => e !== u && !e.classList.contains('fantasma'));
    const i = irmaos.findIndex((e) => e.compareDocumentPosition(u) & Node.DOCUMENT_POSITION_PRECEDING);
    const antes = (i < 0 ? irmaos : irmaos.slice(0, i)).reverse();
    const visivel = (e) => e.getBoundingClientRect().bottom > 0;
    return antes.find((e) => unidadePronta(e) && visivel(e)) ?? irmaos.find((e) => unidadePronta(e) && visivel(e)) ?? null;
  }
  const fantasmas = new Set();
  // a lista vira position: relative enquanto tiver cópias dentro; várias cópias podem estar na mesma lista ao mesmo
  // tempo, então ela só volta ao normal quando sai a última (senão as outras perdem a referência e pulam)
  const emCopia = new Map();
  const prendePai = (pai) => {
    const n = emCopia.get(pai) ?? 0;
    if (n === 0 && getComputedStyle(pai).position === 'static') pai.style.position = 'relative';
    emCopia.set(pai, n + 1);
  };
  const soltaPai = (pai) => {
    const n = (emCopia.get(pai) ?? 1) - 1;
    if (n <= 0) { emCopia.delete(pai); pai.style.position = ''; } else emCopia.set(pai, n);
  };
  function tira(f) {
    if (f.el) { gsap.killTweensOf(f.el); f.el.remove(); }
    f.cx?.some(true);
    if (f.pai) { soltaPai(f.pai); f.pai = null; }
    fantasmas.delete(f);
  }
  const tiraFantasmas = (g) => { for (const f of [...fantasmas]) if (!g || f.g === g) tira(f); };
  function copia(src) {
    const el = src.cloneNode(true);
    for (const e of [el, ...el.querySelectorAll('*')]) {
      e.removeAttribute('id');
      e.removeAttribute('data-camada');
      e.removeAttribute('data-teste');
      e.removeAttribute('aria-controls');
      e.classList.remove('sel', 'c-viva');
    }
    el.classList.add('fantasma');
    el.setAttribute('aria-hidden', 'true');
    el.inert = true;
    return el;
  }

  async function duplica(a, t, gen) {
    const { u, cs, g } = t;
    const vivo = () => gen === geracao && g.estado === 'montando';
    const src = fonteDe(u);
    if (!src) { fila.push(t); return; }
    const rs = rectDoc(src), rt = rectDoc(u);
    const ox = Math.min(rs.w * 0.4, 90), oy = Math.min(rs.h * 0.45, 34);
    if (!(await vai(a, rs.x + ox, rs.y + oy)) || !vivo()) { if (vivo()) fila.push(t); return; }
    // seleciona a origem
    const cx = caixa(palco, rs);
    cx.tamanho(rs.w, rs.h);
    cx.el.classList.add('fixa');
    const f = { g, cx, el: null, pai: null };
    fantasmas.add(f);
    if (!(await espera(0.16)) || !vivo()) return tira(f);
    // a cópia, dentro do mesmo pai (mantém os estilos que dependem dele), por cima de tudo
    modo(a, 'copia');
    clique(a, palco);
    const pai = u.parentElement;
    prendePai(pai);
    f.pai = pai;
    const rp = pai.getBoundingClientRect();
    const fant = copia(src);
    Object.assign(fant.style, {
      position: 'absolute',
      left: `${rs.x - scrollX - rp.left - pai.clientLeft + pai.scrollLeft}px`,
      top: `${rs.y - scrollY - rp.top - pai.clientTop + pai.scrollTop}px`,
      width: `${rs.w}px`,
      height: `${rs.h}px`,
      margin: '0',
      zIndex: '5',
      pointerEvents: 'none',
    });
    f.el = fant;
    pai.append(fant);
    const dx = rt.x - rs.x, dy = rt.y - rs.y;
    const p = { k: 0 };
    const ok = await anima(p, {
      k: 1,
      duration: Math.min(1.1, Math.max(0.5, 0.42 + Math.hypot(dx, dy) / 1500)),
      ease: 'power2.inOut',
      onUpdate() {
        const x = dx * p.k, y = dy * p.k;
        fant.style.transform = `translate(${x}px, ${y}px)`;
        cx.el.style.transform = `translate(${rs.x + x}px, ${rs.y + y}px)`;
        a.x = rs.x + x + ox;
        a.y = rs.y + y + oy;
      },
    });
    modo(a, 'seta');
    if (!ok || !vivo()) return tira(f);
    clique(a, palco);
    // solta: a estrutura do item novo aparece por baixo da cópia, que some; o conteúdo vai para a fila
    for (const c of cs) {
      if (c.estado === 'pronta') continue;
      if (c.tipo === 'texto' || c.tipo === 'foto') {
        c.estado = 'esqueleto';
        const r = rectDoc(c.el);
        fila.push({ fase: 'conteudo', c, g, em: relogio() + rand(0.15, 0.5), x: r.x, y: r.y });
      } else {
        finaliza(c);
      }
    }
    cx.some(false, 0.3);
    f.cx = null;
    gsap.to(fant, {
      opacity: 0,
      duration: 0.28,
      ease: 'power1.out',
      onComplete: () => tira(f),
    });
    gsap.delayedCall(0.5, avisa);
  }

  // ---------- ajustar ----------
  // data-ajusta="dx,dy": o elemento nasce deslocado; montado, um agente o seleciona e arrasta de volta. Perto do
  // lugar ele encaixa, e a linha-guia de alinhamento (rosa, como num editor) pisca na borda alinhada.
  function guia(r, vertical) {
    const el = document.createElement('i');
    el.className = 'guia';
    if (vertical) Object.assign(el.style, { left: `${r.x}px`, top: `${r.y - 70}px`, width: '1px', height: `${r.h + 140}px` });
    else Object.assign(el.style, { left: `${r.x - 90}px`, top: `${r.y}px`, width: `${r.w + 180}px`, height: '1px' });
    palco.append(el);
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.08 });
    gsap.to(el, { opacity: 0, duration: 0.35, delay: 0.55, onComplete: () => el.remove(), onInterrupt: () => el.remove() });
  }

  async function ajusta(a, c, vivo) {
    c.caixa?.some(false, 0.2);
    c.caixa = null;
    const el = c.el;
    const [dx, dy] = c.ajuste;
    const r = rectDoc(el); // ainda deslocado
    const ox = r.w * rand(0.35, 0.6), oy = Math.min(r.h * 0.5, 60);
    if (!(await espera(rand(0.15, 0.35))) || !vivo()) return;
    if (!(await vai(a, r.x + ox, r.y + oy)) || !vivo()) return;
    const cx = caixa(palco, r);
    cx.tamanho(r.w, r.h);
    cx.el.classList.add('fixa');
    if (!(await espera(0.14)) || !vivo()) return cx.some(true);
    clique(a, palco);
    const p = { k: 0 };
    const segue = () => {
      const x = dx * (1 - p.k), y = dy * (1 - p.k);
      gsap.set(el, { x, y });
      cx.el.style.transform = `translate(${r.x - dx * p.k}px, ${r.y - dy * p.k}px)`;
      a.x = r.x - dx * p.k + ox;
      a.y = r.y - dy * p.k + oy;
    };
    // arrasta até quase o lugar...
    let ok = await anima(p, { k: 0.86, duration: Math.min(0.9, 0.45 + Math.hypot(dx, dy) / 400), ease: 'power2.inOut', onUpdate: segue });
    if (!ok || !vivo()) return cx.some(true);
    // ...e encaixa, com a guia na borda que alinhou
    const fim = { x: r.x - dx, y: r.y - dy, w: r.w, h: r.h };
    if (dx) guia(fim, true);
    if (dy) guia(fim, false);
    ok = await anima(p, { k: 1, duration: 0.1, ease: 'power1.out', onUpdate: segue });
    cx.some(false, 0.35);
    if (ok && vivo()) await espera(0.2);
  }

  // reforço: quando uma seção de baixo começa, chegam agentes novos pelas bordas da tela
  function chegam(g) {
    if (!g.el.dataset.reforco || g.reforcou) return;
    g.reforcou = true;
    const k = celular.matches ? 1 : Number(g.el.dataset.reforco);
    for (let j = 0; j < k; j++) {
      const a = novoAgente(ags.length, palco);
      const esq = Math.random() < 0.5;
      a.x = scrollX + (esq ? -24 : innerWidth + 24);
      a.y = scrollY + innerHeight * rand(0.25, 0.85);
      ags.push(a);
      vida(a, geracao);
    }
    barra.agentes(ags.length, CORES);
  }

  // título: as letras acendem em ordem solta, piscando como neon ligando
  function acendeTitulo(c) {
    const el = c.el;
    c.html = el.innerHTML;
    el.innerHTML = [...el.textContent].map((l) => `<span class="letra">${l}</span>`).join('');
    el.classList.add('c-viva');
    c.caixa?.some(false, 0.5);
    const letras = gsap.utils.shuffle([...el.querySelectorAll('.letra')]);
    const tl = gsap.timeline();
    letras.forEach((l, i) => {
      tl.to(l, {
        keyframes: [
          { opacity: 1, duration: 0.04 },
          { opacity: 0.15, duration: 0.05 },
          { opacity: 1, duration: 0.04 },
          { opacity: 0.5, duration: 0.07 },
          { opacity: 1, duration: 0.12 },
        ],
        ease: 'none',
      }, i * 0.07 + Math.random() * 0.03);
    });
    return new Promise((res) => { tl.eventCallback('onComplete', () => res(true)); tl.eventCallback('onInterrupt', () => res(false)); });
  }

  // foto: entra em cinza e escura, depois o vermelho do fundo acende
  async function revelaFoto(c) {
    const el = c.el;
    gsap.set(el, { opacity: 0, filter: 'grayscale(1) brightness(0.7) contrast(1.1)' });
    el.classList.add('c-viva');
    c.caixa?.digitando();
    if (!(await anima(el, { opacity: 1, duration: 0.4, ease: 'power1.out' }))) return;
    if (!(await espera(0.45))) return;
    await anima(el, { filter: 'grayscale(0) brightness(1) contrast(1)', duration: 0.8, ease: 'power2.inOut' });
  }

  // fundo do hero: o cinza sai e o halo vermelho acende por baixo de tudo
  async function revelaQuadro(c) {
    c.el.classList.add('c-pronta');
    c.caixa?.some(false, 1.1);
    c.caixa = null;
    await espera(1);
  }

  async function revelaBloco(c) {
    c.caixa?.some(false, 0.3);
    c.caixa = null;
    if (c.casca) {
      c.el.classList.add('c-pronta'); // o fundo e a borda voltam pela transição do CSS
      await espera(0.3);
      return;
    }
    c.el.classList.add('c-viva');
    await anima(c.el, { startAt: { opacity: 0, scale: 0.94 }, opacity: 1, scale: 1, duration: 0.4, ease: 'expo.out' });
  }

  // ---------- vida de cada agente ----------
  async function vida(a, gen) {
    while (gen === geracao) {
      const t = pega(a);
      if (t) {
        try {
          await (t.fase === 'esqueleto' ? esqueleto(a, t, gen)
            : t.fase === 'duplica' ? duplica(a, t, gen)
            : t.fase === 'teste' ? testa(a, t, gen)
            : conteudo(a, t, gen));
        }
        catch (e) { console.error(e); }
        modo(a, 'seta');
      } else {
        await vaga(a, gen);
      }
    }
  }

  // ---------- fila do fecho ----------
  // Com o contato na tela, ou com a página inteira montada (em qualquer ponto dela), os agentes parados entram numa
  // fila só que dá voltas soltas pela tela, sem se preocupar com a copy. A ponta pilota pela curvatura, que muda
  // devagar (nada de quina): encadeia figuras em S (curvatura que vai e volta de um lado para o outro), oitos (uma
  // volta para cada lado, trocando no cruzamento) e arcos abertos. Os raios são largos, nunca um laço apertado. Perto
  // da borda da tela ela vai virando para o centro aos poucos. Os outros seguem o rastro exato da ponta, cada um VAO
  // px atrás do anterior, então a fila inteira desenha as mesmas formas.
  const VAO = 34;
  const cobra = { rastro: [], ponta: null, rumo: 0, k: 0, fig: null };
  const filaLigada = () => (fecho && naTela(fecho)) || feitas >= camadas.length;
  const raio = () => (celular.matches ? 78 : Math.max(120, Math.min(innerWidth, innerHeight) * 0.16));
  const velocidade = () => (celular.matches ? 95 : 160);
  function areaLivre() {
    const mx = celular.matches ? 30 : innerWidth * 0.08;
    return { x0: scrollX + mx, x1: scrollX + innerWidth - mx, y0: scrollY + (celular.matches ? 100 : 130), y1: scrollY + innerHeight - (celular.matches ? 130 : 140) };
  }
  function novaFigura(t) {
    const R = raio(), v = velocidade();
    const lado = Math.random() < 0.5 ? 1 : -1;
    const sorte = Math.random();
    if (sorte < 0.4) {
      // S: a curvatura oscila entre os dois lados; uma ou duas ondas
      const T = (2 * Math.PI * R * 1.25) / v;
      const ini = t;
      return { tipo: 'S', ate: t + T * (Math.random() < 0.5 ? 1 : 2), k: (tt) => lado * (v / (R * 1.25)) * Math.sin((2 * Math.PI * (tt - ini)) / T) };
    }
    if (sorte < 0.75) {
      // 8: uma volta inteira para um lado e outra para o outro
      const volta = (2 * Math.PI * R) / v;
      const ini = t;
      return { tipo: '8', ate: t + volta * 2, k: (tt) => (tt - ini < volta ? lado : -lado) * (v / R) };
    }
    // arco aberto, quase reto, para atravessar a tela entre uma figura e outra
    return { tipo: 'arco', ate: t + 1.6 + Math.random() * 1.8, k: () => lado * (v / (R * 3.2)) };
  }
  function pilota(t, s) {
    const v = velocidade(), R = raio();
    const A = areaLivre();
    // começa (ou recomeça, se a tela pulou para longe) num ponto qualquer da área livre
    const longe = cobra.ponta && (cobra.ponta[1] < scrollY - innerHeight * 0.4 || cobra.ponta[1] > scrollY + innerHeight * 1.4);
    if (!cobra.ponta || longe) {
      cobra.ponta = [A.x0 + Math.random() * (A.x1 - A.x0), A.y0 + Math.random() * (A.y1 - A.y0)];
      cobra.rumo = Math.random() * Math.PI * 2;
      cobra.k = 0;
      cobra.fig = null;
      cobra.rastro = [{ x: cobra.ponta[0], y: cobra.ponta[1], d: 0 }];
    }
    if (!cobra.fig || t > cobra.fig.ate) cobra.fig = novaFigura(t);
    let alvo = cobra.fig.k(t);
    // borda: olha um pouco à frente; quanto mais fora da área livre, mais vira para o centro dela
    const [px, py] = cobra.ponta;
    const fx = px + Math.cos(cobra.rumo) * v * 1.0, fy = py + Math.sin(cobra.rumo) * v * 1.0;
    const fora = Math.max(A.x0 - fx, fx - A.x1, A.y0 - fy, fy - A.y1, 0);
    if (fora > 0) {
      const quer = Math.atan2((A.y0 + A.y1) / 2 - py, (A.x0 + A.x1) / 2 - px);
      let dif = quer - cobra.rumo;
      dif = Math.atan2(Math.sin(dif), Math.cos(dif));
      const w = Math.min(1, fora / (R * 0.55));
      const kBorda = Math.max(-1.4 * v / R, Math.min(1.4 * v / R, dif * 2.2));
      alvo = alvo * (1 - w) + kBorda * w;
      // figura que insiste em sair da tela dá lugar a uma nova, que começa já virando para dentro
      if (w > 0.85 && cobra.fig.tipo !== 'arco') cobra.fig = { tipo: 'arco', ate: t + 1.2, k: () => Math.sign(dif || 1) * (v / (R * 1.4)) };
    }
    // curvatura muda devagar: as curvas emendam sem quina (um pouco mais rápido quando a borda chama)
    cobra.bw = fora > 0 ? Math.min(1, fora / (R * 0.55)) : 0;
    cobra.k += (alvo - cobra.k) * (1 - Math.exp(-s * (2.4 + 3 * cobra.bw)));
    cobra.rumo += cobra.k * s;
    const nx = px + Math.cos(cobra.rumo) * v * s, ny = py + Math.sin(cobra.rumo) * v * s;
    cobra.ponta = [nx, ny];
    const ult = cobra.rastro[cobra.rastro.length - 1];
    cobra.rastro.push({ x: nx, y: ny, d: ult.d + Math.hypot(nx - ult.x, ny - ult.y) });
    const max = (ags.length + 2) * VAO;
    while (cobra.rastro.length > 2 && cobra.rastro[cobra.rastro.length - 1].d - cobra.rastro[1].d > max) cobra.rastro.shift();
  }
  // ponto do rastro a uma distância atrás da ponta
  function noRastro(atras) {
    const r = cobra.rastro;
    const alvo = r[r.length - 1].d - atras;
    if (alvo <= r[0].d) return [r[0].x, r[0].y];
    let lo = 0, hi = r.length - 1;
    while (hi - lo > 1) { const md = (lo + hi) >> 1; if (r[md].d < alvo) lo = md; else hi = md; }
    const f = (alvo - r[lo].d) / (r[hi].d - r[lo].d || 1);
    return [r[lo].x + (r[hi].x - r[lo].x) * f, r[lo].y + (r[hi].y - r[lo].y) * f];
  }
  let filaTick = null;
  function ligaFila() {
    if (filaTick) return;
    filaTick = (_, dt) => {
      if (!ags.some((a) => a.naFila)) { cobra.ponta = null; return; }
      const s = Math.min(0.05, (dt / 1000) * gsap.globalTimeline.timeScale());
      const t = relogio();
      pilota(t, s);
      const f = 1 - Math.exp(-s * 6);
      const passo = 520 * s; // quem ainda está chegando anda no máximo isso por quadro
      let n = 0;
      for (const a of ags) {
        if (!a.naFila) continue;
        const [px, py] = noRastro(n++ * VAO);
        let dx = (px - a.x) * f, dy = (py - a.y) * f;
        const d = Math.hypot(dx, dy);
        if (d > passo) { dx *= passo / d; dy *= passo / d; }
        a.x += dx;
        a.y += dy;
      }
    };
    gsap.ticker.add(filaTick);
  }

  async function naFila(a, gen, r0) {
    para(a);
    modo(a, 'seta');
    a.naFila = true;
    ligaFila();
    while (gen === geracao && a.naFila) {
      await Promise.race([novidade, espera(0.5)]);
      if (temTrabalho() || rumo !== r0 || !filaLigada()) break;
    }
    a.naFila = false;
  }

  const TEXTO = 'p, h1, h2, h3, li, a, button, blockquote, figcaption, summary, .secao__rotulo, .hero__nome, .hero__ola';
  const livre = (vx, vy) => {
    for (const [dx, dy] of [[0, 0], [14, 18], [-10, 10]]) {
      const el = document.elementFromPoint(vx + dx, vy + dy);
      if (el?.closest(TEXTO) && !el.closest('.hero__titulo')) return false; // o título gigante é fundo
    }
    return true;
  };

  // sem tarefa: passeia devagar pela parte da página que está na tela; larga na hora se aparecer trabalho
  async function vaga(a, gen) {
    const r0 = rumo;
    if (filaLigada()) return naFila(a, gen, r0);
    // destino fora do texto (o cursor parado não fica em cima da copy)
    const m = 40;
    let x, y;
    for (let k = 0; k < 14; k++) {
      x = scrollX + m + Math.random() * (innerWidth - 2 * m);
      y = scrollY + 70 + Math.random() * Math.max(80, innerHeight - 200);
      if (livre(x - scrollX, y - scrollY)) break;
    }
    // quem ficou fora da tela (a pessoa rolou) volta direto e rápido; quem já está na tela passeia devagar
    const fora = a.y < scrollY - 40 || a.y > scrollY + innerHeight + 40;
    const dur = fora ? Math.min(0.9, Math.max(0.45, Math.hypot(x - a.x, y - a.y) / 1800)) : rand(1.6, 3);
    const andar = vai(a, x, y, fora ? { dur, ease: 'power2.inOut', curva: 0.15 } : { dur, ease: 'sine.inOut', curva: 0.45 });
    while (gen === geracao) {
      const r = await Promise.race([andar.then(() => 'fim'), novidade.then(() => 'novidade')]);
      if (r === 'fim') break;
      if (temTrabalho() || rumo !== r0) return;
    }
    const pausa = espera(rand(0.4, 1.8));
    while (gen === geracao) {
      const r = await Promise.race([pausa.then(() => 'fim'), novidade.then(() => 'novidade')]);
      if (r === 'fim' || temTrabalho() || rumo !== r0) return;
    }
  }

  // ---------- abertura: os agentes chegam e rodeiam o símbolo enquanto a página carrega ----------
  function carregado() {
    const fontes = document.fonts
      ? Promise.all([
          document.fonts.load('400 100px "Anton"'),
          document.fonts.load('600 40px "Caveat Variable"'),
          document.fonts.load('400 16px "Manrope Variable"'),
          document.fonts.load('800 16px "Manrope Variable"'),
        ]).then(() => document.fonts.ready)
      : Promise.resolve();
    const imgs = [...document.querySelectorAll('.hero img')].map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()));
    return Promise.all([fontes, ...imgs]).catch(() => {});
  }

  async function intro(gen) {
    introViva = true;
    relogioLiga();
    barra.estado('escaneando');
    barra.scan(0);
    const cx = scrollX + innerWidth / 2;
    const cy = scrollY + innerHeight * 0.46;
    const logo = document.createElement('div');
    logo.className = 'enx-logo';
    logo.innerHTML = '<svg class="marca-kairo" viewBox="0 0 100 100" aria-hidden="true"><path d="M24 20H76V36H44V43H68V57H44V64H76V80H24Z"/></svg>';
    logo.style.transform = `translate(${cx}px, ${cy}px)`;
    palco.append(logo);
    gsap.fromTo(logo, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'expo.out' });

    const R = Math.hypot(innerWidth, innerHeight) * 0.62;
    const esc = Math.min(1, innerWidth / 1440 + 0.2);
    const slots = ags.map((a, i) => {
      const ang = Math.random() * Math.PI * 2;
      a.x = cx + Math.cos(ang) * R;
      a.y = cy + Math.sin(ang) * R;
      return { th: (i / ags.length) * Math.PI * 2 + rand(-0.3, 0.3), r: rand(70, 150) * esc, w: rand(0.6, 1.2), fase: rand(0, 6) };
    });
    let t = 0;
    const tick = (_, dt) => {
      const k = gsap.globalTimeline.timeScale();
      const s = (dt / 1000) * k;
      t += s;
      const f = 1 - Math.exp(-s * 3.2);
      ags.forEach((a, i) => {
        const sl = slots[i];
        const ang = sl.th + sl.w * t;
        const rr = sl.r + 16 * Math.sin(t * 1.7 + sl.fase);
        a.x += (cx + Math.cos(ang) * rr - a.x) * f;
        a.y += (cy + Math.sin(ang) * rr * 0.8 - a.y) * f;
      });
    };
    gsap.ticker.add(tick);
    const scan = { p: 0 };
    gsap.to(scan, { p: 0.85, duration: 1.6, ease: 'power1.inOut', onUpdate: () => barra.scan(scan.p) });
    await Promise.race([Promise.all([espera(1.8), carregado()]), espera(5)]);
    gsap.ticker.remove(tick);
    if (gen !== geracao) return;
    await anima(scan, { p: 1, duration: 0.2, onUpdate: () => barra.scan(scan.p) });
    gsap.to(logo, { opacity: 0, scale: 0.92, duration: 0.3, ease: 'power1.out', onComplete: () => logo.remove(), onInterrupt: () => logo.remove() });
    barra.estado('montando');
    introViva = false;
  }

  // ---------- montagens entram e saem da tela ----------
  function observa() {
    ioEntra?.disconnect();
    ioSai?.disconnect();
    const porG = new Map(grupos.map((g) => [g.el, g]));
    ioEntra = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { const g = porG.get(e.target); if (g) inicia(g); }
    }, { rootMargin: '0px 0px -38% 0px' });
    ioSai = new IntersectionObserver((es) => {
      for (const e of es) if (!e.isIntersecting) { const g = porG.get(e.target); if (g?.estado === 'montando') conclui(g); }
    });
    grupos.forEach((g) => { ioEntra.observe(g.el); ioSai.observe(g.el); });
  }

  async function inicio() {
    const gen = geracao;
    montaGrupos();
    await intro(gen);
    if (gen !== geracao) return;
    primeiraLeva = true;
    observa();
    setTimeout(() => (primeiraLeva = false), 400);
    ags.forEach((a) => vida(a, gen));
  }

  // ---------- rolagem do visitante, tamanho da janela ----------
  let rolagemPropria = false; // a volta ao topo do "montar de novo" não é o visitante rolando
  addEventListener('scroll', () => {
    if (testes.length && testeLivre()) avisa();
    if (emTour || rolagemPropria) return;
    if ((introViva || grupos.some((g) => g.inicial && g.estado === 'montando')) && turbo === 1) { turbo = 5; aplicaVel(); }
  }, { passive: true });

  let largura = innerWidth;
  let eraCelular = celular.matches;
  let tRes;
  addEventListener('resize', () => {
    if (innerWidth === largura) return; // só a altura mudou (barra do navegador no celular)
    largura = innerWidth;
    clearTimeout(tRes);
    tRes = setTimeout(() => {
      const trocou = celular.matches !== eraCelular;
      eraCelular = celular.matches;
      for (const g of grupos) if (g.estado === 'montando' || (trocou && g.estado === 'espera')) conclui(g);
    }, 120);
  });

  // ---------- tour: rola a página sozinho, esperando cada montagem terminar ----------
  function paraTour() {
    if (!emTour) return;
    emTour = false;
    rolagemTour?.kill();
    barra.tour(false);
  }
  // paradas do tour: cada bloco de conteúdo fica centrado no vão entre a nav e a barra; bloco mais alto que esse vão
  // para com o topo logo abaixo da nav e depois desce em passos de uma tela
  function paradas() {
    const sel = celular.matches ? '.hero [data-parte], .secao__dentro' : '.secao__dentro';
    const topo = 68, pe = 70; // nav e barra
    const vao = innerHeight - topo - pe;
    const ys = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = rectDoc(el);
      if (!r.h) continue;
      if (r.h <= vao) ys.push(r.y + r.h / 2 - (topo + vao / 2));
      else for (let y = r.y - topo - 8; y < r.y + r.h - innerHeight + pe; y += vao * 0.85) ys.push(y);
    }
    return ys.sort((a, b) => a - b);
  }
  function proximaParada() {
    const ys = paradas().filter((y) => y > scrollY + 40);
    // paradas muito juntas (dois blocos curtos na mesma tela) viram uma só
    return ys.length ? ys.find((y) => y - scrollY > innerHeight * 0.3) ?? ys.at(-1) : Infinity;
  }

  async function tour() {
    if (emTour) return paraTour();
    emTour = true;
    barra.tour(true);
    const gen = geracao;
    while (emTour && gen === geracao) {
      while (emTour && gen === geracao && (introViva || testeLivre() || testando || grupos.some((g) => g.estado === 'montando'))) {
        await Promise.race([novidade, espera(0.3)]);
      }
      if (!emTour || gen !== geracao) break;
      await espera(0.6);
      const max = document.documentElement.scrollHeight - innerHeight;
      if (!emTour || scrollY >= max - 2) break;
      const alvo = Math.min(max, proximaParada());
      const p = { y: scrollY };
      await new Promise((res) => {
        rolagemTour = gsap.to(p, {
          y: alvo,
          duration: Math.max(0.7, ((alvo - scrollY) / innerHeight) * 1.2),
          ease: 'power2.inOut',
          onUpdate: () => scrollTo(0, p.y),
          onComplete: res,
          onInterrupt: res,
        });
      });
    }
    emTour = false;
    barra.tour(false);
  }
  for (const ev of ['wheel', 'touchstart']) addEventListener(ev, paraTour, { passive: true });
  addEventListener('keydown', (e) => { if (!e.target.closest?.('.barra')) paraTour(); });

  // ---------- controles ----------
  barra.aoTour(tour);
  barra.aoVel(() => {
    base = base === 1 ? 2 : base === 2 ? 4 : 1;
    barra.vel(base);
    aplicaVel();
  });
  barra.aoRefazer(() => {
    paraTour();
    geracao++;
    gsap.globalTimeline.getChildren(true, true, true).forEach((t) => t.kill());
    ioEntra?.disconnect();
    ioSai?.disconnect();
    tiraFantasmas();
    palco.querySelectorAll('.cx, .caret, .clique, .enx-logo, .guia').forEach((e) => e.remove());
    limpaEtiquetas();
    document.querySelectorAll('.cx__fill').forEach((e) => e.remove());
    for (const c of camadas) {
      if (c.div) { junta(c.div); c.div = null; }
      if (c.html != null) { c.el.innerHTML = c.html; c.html = null; }
      c.el.classList.add('c-ja');
      c.el.classList.remove('c-pronta', 'c-viva');
      gsap.set(c.el, { clearProps: 'opacity,filter,transform' });
      c.estado = 'oculta';
      c.caixa = null;
      c.ajuste = null;
      setTimeout(() => c.el.classList.remove('c-ja'), 80);
    }
    fila = [];
    testes = [];
    testando = 0;
    fecho = null;
    trabalho = 0;
    desde = null;
    while (ags.length > n) { const a = ags.pop(); a.mov?.kill(); a.el.remove(); }
    barra.agentes(n, CORES);
    feitas = 0;
    barra.camadas(0);
    turbo = 1;
    aplicaVel();
    ags.forEach((a) => { modo(a, 'seta'); a.naFila = false; });
    rolagemPropria = true;
    scrollTo(0, 0);
    setTimeout(() => (rolagemPropria = false), 200);
    inicio();
  });

  if ('scrollRestoration' in history && !location.hash) {
    history.scrollRestoration = 'manual';
    scrollTo(0, 0);
  }
  inicio();
}
