## Why

Uma exploração do código (`src/App.tsx`, `src/chess-tools.ts`) encontrou dois bugs de comportamento observável: (1) navegar pelo histórico da partida com o botão `→` ou a tecla de atalho `ArrowRight` pode deixar o tabuleiro travado mesmo depois de voltar até a posição atual, porque `viewPly` fica igual a `history.length` em vez de voltar a `null`; (2) o painel "Ameaças táticas" mistura oportunidades do próprio lado a mover (xeques e capturas disponíveis) com ameaças reais do adversário (peças penduradas), rotulando tudo como "ameaça", o que pode levar o usuário a interpretar mal a posição.

## What Changes

- Corrigir a navegação de histórico para que avançar até o último lance (via botão `→` ou tecla `ArrowRight`) restaure o estado "jogável" (`viewPly = null`), igual ao botão `⏭`.
- Separar, no painel de análise tática, as jogadas de xeque/captura disponíveis para o lado a mover (oportunidades) das peças realmente penduradas (ameaças do adversário), com rótulos e/ou seções distintas para evitar ambiguidade.

## Capabilities

### New Capabilities
- `board-navigation`: comportamento de navegação pelo histórico de lances (adiante/atrás/início/atual) e seu efeito no estado de bloqueio do tabuleiro.
- `tactical-insights`: classificação e rotulagem de oportunidades táticas próprias versus ameaças reais do adversário exibidas no painel de coaching.

### Modified Capabilities
(nenhuma — não há specs existentes; este change introduz a primeira cobertura formal para essas áreas)

## Impact

- Código afetado: `src/App.tsx` (handler de `ArrowRight`, botão de navegação "→", estado `viewPly`), `src/chess-tools.ts` (função `threatsFor`).
- Nenhuma dependência externa ou API afetada; mudança é puramente de comportamento client-side, sem alteração de dados persistidos (`localStorage`).
