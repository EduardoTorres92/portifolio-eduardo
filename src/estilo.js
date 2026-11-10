// No dev do Vite o CSS entra pelo JS: até aqui o <style> do index.html deixa o body escondido e as transições
// desligadas. Importado logo depois dos CSS e antes do motion: mostra a página já com o estilo e religa as transições
// sem animar do estilo padrão do navegador para o da página.
const raiz = document.documentElement;
raiz.classList.add('com-estilo');
void document.body.offsetHeight;
raiz.classList.add('assentou');
