// Caixa de seleção que um agente desenha em volta de uma camada: fio azul, alças nos cantos, etiqueta com a medida
// e o placeholder cinza (com o ícone de imagem nos blocos grandes). A do fundo do hero põe o placeholder atrás do
// conteúdo, dentro do próprio fundo.
import { gsap } from 'gsap';

const ICONE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="m4.5 16.5 4.8-4.8 3.7 3.7 2.4-2.4 4.1 4.1"/><circle cx="15.6" cy="9.4" r="1.5"/></svg>';

// etiquetas de medida na tela: uma caixa cuja etiqueta cairia em cima de outra fica sem a dela
const etiquetas = new Set();

export const limpaEtiquetas = () => etiquetas.clear();

export function caixa(palco, r, { icone = false, fundo = null, grande = false } = {}) {
  const el = document.createElement('div');
  el.className = 'cx';
  el.innerHTML = '<i class="cx__h"></i><i class="cx__h"></i><i class="cx__h"></i><i class="cx__h"></i><b class="cx__tam"></b>';
  el.style.transform = `translate(${r.x}px, ${r.y}px)`;
  const tam = el.querySelector('.cx__tam');

  const fill = document.createElement('i');
  fill.className = 'cx__fill';
  if (icone) fill.innerHTML = ICONE;
  if (grande) fill.classList.add('cx__fill--grande');
  if (fundo) {
    fill.classList.add('cx__fill--fundo');
    fundo.append(fill);
  } else {
    el.prepend(fill);
  }
  palco.append(el);

  let viva = true;
  const ponto = { x: r.x + r.w / 2, y: r.y + r.h };
  const colide = [...etiquetas].some((e) => Math.abs(e.x - ponto.x) < 70 && Math.abs(e.y - ponto.y) < 22);
  if (colide) el.classList.add('sem-medida');
  else etiquetas.add(ponto);
  const api = {
    el,
    tamanho(w, h) {
      if (!viva) return;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      tam.textContent = `${Math.round(w)} × ${Math.round(h)}`;
    },
    // caixa posta: alças e placeholder
    fixa() {
      if (!viva) return;
      el.classList.add('fixa');
      gsap.to(fill, { opacity: 1, duration: 0.22, ease: 'power1.out' });
    },
    // vai digitar: o placeholder sai, o fio fica
    digitando() {
      if (!viva) return;
      el.classList.add('digitando');
      gsap.to(fill, { opacity: 0, duration: 0.18, ease: 'power1.out' });
    },
    // conteúdo no lugar: some a caixa (na hora, se a seção foi concluída fora da tela)
    some(rapido = false, dur = 0.3) {
      if (!viva) return;
      viva = false;
      etiquetas.delete(ponto);
      const tira = () => { el.remove(); fill.remove(); };
      if (rapido) return tira();
      gsap.to([el, fill], { opacity: 0, duration: dur, ease: 'power1.out', onComplete: tira, onInterrupt: tira });
    },
  };
  api.tamanho(0, 0);
  return api;
}
