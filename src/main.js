import '@fontsource/anton/400.css';
import '@fontsource-variable/caveat/wght.css';
import '@fontsource-variable/manrope/wght.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/enxame.css';
import './sections/nav.css';
import './sections/hero.css';
import './styles/secao.css';
import './sections/projetos.css';
import './sections/sobre.css';
import './sections/trajetoria.css';
import './sections/contato.css';
import './sections/barra.css';
import './estilo.js';

import { nav } from './motion/nav.js';
import { barra } from './motion/barra.js';
import { enxame } from './motion/enxame.js';
import { interface_ } from './motion/interface.js';

nav();
interface_();
enxame(barra());
