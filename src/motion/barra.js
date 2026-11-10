// Barra dos agentes: mostra o escaneamento, quantas camadas já foram montadas e os controles (Tour, velocidade,
// montar de novo). Só interface: quem decide o que acontece é o enxame.
export function barra() {
  const el = document.querySelector('.barra');
  const q = (s) => el.querySelector(s);
  const feitas = q('.barra__feitas');
  const total = q('.barra__total');
  const prog = q('.barra__progresso > i');
  const scan = q('.barra__scan .barra__trilho > i');
  const agentes = q('.barra__agentes b');
  const fimN = q('.barra__fim-n');
  const fimT = q('.barra__fim-t');
  const btTour = q('.barra__tour');
  const btVel = q('.barra__vel');
  const btRefaz = q('.barra__refaz');
  let T = 1;

  return {
    total(n) { T = Math.max(1, n); total.textContent = n; },
    camadas(n) { feitas.textContent = n; prog.style.transform = `scaleX(${Math.min(1, n / T)})`; },
    estado(s) { el.dataset.estado = s; },
    // página inteira montada: "Montada por N agentes em T s"
    fim(n, s) {
      fimN.textContent = n;
      fimT.textContent = `${s.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`;
      el.dataset.estado = 'fim';
    },
    scan(p) { scan.style.transform = `scaleX(${p})`; },
    agentes(n, cores) {
      agentes.textContent = n;
      el.querySelectorAll('.barra__avatares i').forEach((i, k) => i.style.setProperty('--c', cores[k * 3 % cores.length]));
    },
    tour(on) {
      btTour.setAttribute('aria-pressed', String(on));
      btTour.textContent = on ? 'Em tour' : 'Tour';
    },
    vel(v) {
      btVel.textContent = `${v}×`;
      btVel.setAttribute('aria-label', `Velocidade dos agentes: ${v}×`);
    },
    aoTour(fn) { btTour.addEventListener('click', fn); },
    aoVel(fn) { btVel.addEventListener('click', fn); },
    aoRefazer(fn) { btRefaz.addEventListener('click', fn); },
  };
}
