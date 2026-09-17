## Purpose

Define como o usuário navega pelo histórico de lances de uma partida (início, anterior, próximo, posição atual) e como essa navegação afeta a possibilidade de jogar no tabuleiro.

## Requirements

### Requirement: Retorno à posição atual libera o tabuleiro
O sistema SHALL considerar o tabuleiro em estado "jogável" (não bloqueado por revisão de histórico) sempre que a posição exibida for a posição mais recente da partida, independentemente de qual controle (botão dedicado, botão de avançar lance ou atalho de teclado) foi usado para chegar até ela.

#### Scenario: Avançar pelo botão até o último lance
- **WHEN** o usuário está revisando um lance anterior e clica repetidamente no botão "Próximo lance" até alcançar o último lance da partida
- **THEN** o tabuleiro volta a aceitar jogadas normalmente, exatamente como se o botão "Ir para a posição atual" tivesse sido usado

#### Scenario: Avançar pelo atalho de teclado até o último lance
- **WHEN** o usuário está revisando um lance anterior e pressiona a tecla de atalho de avançar (`ArrowRight`) repetidamente até alcançar o último lance da partida
- **THEN** o tabuleiro volta a aceitar jogadas normalmente e a seta de dica (quando ativada) volta a ser exibida

#### Scenario: Navegação intermediária continua bloqueada
- **WHEN** o usuário está revisando qualquer lance anterior ao último lance da partida
- **THEN** o tabuleiro permanece bloqueado para novas jogadas, preservando o comportamento atual de revisão somente-leitura

### Requirement: Indicador de posição consistente com o estado de bloqueio
O sistema SHALL exibir o indicador de posição ("POSIÇÃO ATUAL" vs. "LANCE N DE M") de forma consistente com o estado real de bloqueio do tabuleiro descrito no requisito anterior.

#### Scenario: Indicador reflete posição atual após navegação completa
- **WHEN** a navegação (por botão ou atalho) leva o usuário de volta ao último lance da partida
- **THEN** o indicador de posição mostra "POSIÇÃO ATUAL" e não mais "LANCE N DE M"
