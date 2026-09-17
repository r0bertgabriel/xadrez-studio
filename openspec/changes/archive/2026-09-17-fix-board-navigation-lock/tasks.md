## 1. Navegação de histórico (board-navigation)

- [x] 1.1 Corrigir o handler do botão "Próximo lance" (`src/App.tsx`, controle "history-controls") para que, ao alcançar `history.length`, `viewPly` seja definido como `null` em vez de `history.length`, e verificar manualmente que após navegar para trás e depois clicar em "→" até o fim o tabuleiro volta a aceitar jogadas
- [x] 1.2 Aplicar a mesma correção ao atalho de teclado `ArrowRight` (`src/App.tsx`, handler `handleShortcut`) e verificar que pressionar `←` seguido de `→` repetidas vezes até o último lance também libera o tabuleiro
- [x] 1.3 Verificar que o indicador de posição ("POSIÇÃO ATUAL" vs. "LANCE N DE M") reflete corretamente `viewPly === null` após a correção, tanto via botão quanto via teclado
- [x] 1.4 Verificar que a navegação para lances intermediários (não o último) continua bloqueando o tabuleiro como antes, sem regressão

## 2. Distinção entre oportunidades e ameaças (tactical-insights)

- [x] 2.1 Separar em `threatsFor` (`src/chess-tools.ts`) os itens de xeque/captura disponíveis para o lado a mover (oportunidades) das peças penduradas (ameaças reais), retornando essa distinção de forma que o componente consumidor (`src/App.tsx`, card "Ameaças táticas") possa exibi-las em seções ou rótulos diferentes
- [x] 2.2 Atualizar o card de análise tática em `src/App.tsx` para apresentar as duas categorias com rótulos que não sugiram que oportunidades próprias são ameaças contra o usuário, e verificar visualmente em uma posição com captura disponível e em uma posição com peça pendurada
- [x] 2.3 Verificar que o comportamento de "nenhum item" em cada categoria (mensagem de estado vazio) continua funcionando quando não há oportunidades nem ameaças
