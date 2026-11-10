// Digitação: o texto da camada vira um caractere por elemento (<x-l>) (o layout continua o final, só invisível), e o agente
// revela um por um em rajadas, com o cursor de texto piscando no fim. Ao terminar, o HTML original volta.
import { gsap } from 'gsap';

export function divide(el) {
  const html = el.innerHTML;
  const unidades = [];
  const anda = (no) => {
    for (const f of [...no.childNodes]) {
      if (f.nodeType === Node.TEXT_NODE) {
        const txt = f.textContent.replace(/\s+/g, ' ');
        if (!txt) { f.remove(); continue; }
        const frag = document.createDocumentFragment();
        for (const ch of txt) {
          // elemento próprio (não <span>), para nenhuma regra de span da página pegar as letras soltas
          const s = document.createElement('x-l');
          s.className = 'ch';
          s.textContent = ch;
          frag.append(s);
          unidades.push(s);
        }
        f.replaceWith(frag);
      } else if (f.nodeType === Node.ELEMENT_NODE) {
        // elemento sem texto (o ponto vermelho) entra inteiro, como uma letra
        if (!f.textContent.trim()) { f.classList.add('ch'); unidades.push(f); }
        else anda(f);
      }
    }
  };
  anda(el);
  return { el, html, unidades };
}

// desfaz a divisão sem recriar o HTML: as letras voltam a ser texto e os elementos de dentro (a palavra marcada)
// continuam os mesmos
export function junta(div) {
  for (const u of div.unidades) {
    if (u.localName === 'x-l') u.replaceWith(u.textContent);
    else u.classList.remove('ch', 'on');
  }
  div.el.normalize();
}

// tempo de cada caractere: rótulo curto digita devagar o bastante para se ver; parágrafo vai em rajadas rápidas
function tempos(unidades) {
  const n = unidades.length;
  const cps = Math.min(100, Math.max(22, 18 + n * 0.9));
  const base = 1 / cps;
  let t = 0;
  return unidades.map((u) => {
    const espaco = u.textContent === ' ';
    t += espaco ? base * 0.5 + (Math.random() < 0.22 ? base * 3.5 : 0) : base * (0.55 + Math.random() * 0.9);
    return t;
  });
}

export function digita(div, a, palco, fonte) {
  const { unidades } = div;
  const ts = tempos(unidades);
  const total = ts.at(-1) || 0.01;
  const altura = fonte * 1.12;
  const caret = document.createElement('i');
  caret.className = 'caret';
  caret.style.height = `${altura}px`;
  palco.append(caret);

  let k = 0;
  const posiciona = (segue) => {
    const u = unidades[Math.max(0, k - 1)];
    if (!u) return;
    const r = u.getBoundingClientRect();
    const x = (k ? r.right : r.left) + scrollX;
    const y = r.top + r.height / 2 - altura / 2 + scrollY;
    caret.style.transform = `translate(${x}px, ${y}px)`;
    if (segue) {
      a.x += (x + 9 - a.x) * 0.35;
      a.y += (y + altura * 0.8 - a.y) * 0.35;
    }
  };
  posiciona(false);

  const p = { t: 0 };
  return new Promise((res) => {
    const fim = (ok) => { caret.remove(); res(ok); };
    gsap.to(p, {
      t: total,
      duration: total,
      ease: 'none',
      onUpdate() {
        while (k < unidades.length && ts[k] <= p.t) unidades[k++].classList.add('on');
        posiciona(true);
      },
      onComplete: () => { while (k < unidades.length) unidades[k++].classList.add('on'); fim(true); },
      onInterrupt: () => fim(false),
    });
  });
}
