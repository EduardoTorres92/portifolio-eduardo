// Nav: fundo mais fechado depois do topo; o link da seção que está na tela ganha o ponto vermelho. Enquanto a página
// rola, o hover não acende (html.rolando), para o cursor parado não selecionar o que passa por baixo dele.
export function nav() {
  const el = document.querySelector('.nav');
  const raiz = document.documentElement;
  const links = [...el.querySelectorAll('.nav__links a')];
  for (const a of links) {
    const p = document.createElement('i');
    p.className = 'nav__ponto';
    p.setAttribute('aria-hidden', 'true');
    a.prepend(p);
  }
  const secoes = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  let t;
  const ativa = () => {
    const linha = innerHeight * 0.4;
    let atual = null;
    for (const s of secoes) if (s.getBoundingClientRect().top <= linha) atual = s;
    links.forEach((a) => {
      const on = !!atual && a.getAttribute('href') === `#${atual.id}`;
      a.classList.toggle('ativo', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  };
  const aoRolar = () => {
    el.classList.toggle('rolou', scrollY > 24);
    raiz.classList.add('rolando');
    clearTimeout(t);
    t = setTimeout(() => raiz.classList.remove('rolando'), 140);
    ativa();
  };
  addEventListener('scroll', aoRolar, { passive: true });
  el.classList.toggle('rolou', scrollY > 24);
  ativa();
}
