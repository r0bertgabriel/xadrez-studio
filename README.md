# Xadrez Coach

Interface web de estudo e análise assistida por Stockfish 19 executado localmente no navegador. O projeto não usa LLM, API paga ou serviço com cobrança por uso.

## Modos de uso

### Coach

O usuário escolhe brancas ou pretas e recebe recomendações orientadas somente ao seu lado. A outra cor continua sendo movimentada manualmente, permitindo reproduzir partidas reais no tabuleiro.

### Análise livre

O Stockfish acompanha ambos os lados continuamente. É indicado para estudar posições, testar variantes, carregar FENs ou revisar partidas completas.

## Funcionalidades

- escolha inicial entre brancas, pretas e modo de análise livre;
- tabuleiro orientado automaticamente;
- controle manual das duas cores;
- movimentação por clique e arrastar/soltar;
- validação completa de movimentos com `chess.js`;
- promoção com escolha entre dama, torre, bispo e cavalo;
- destaque de movimentos legais e do último lance;
- indicação visual de xeque e xeque-mate;
- modal explícito de fim de partida com vencedor e causa;
- tratamento de xeque-mate, afogamento, repetição tripla e material insuficiente;
- melhor jogada em SAN e UCI;
- seta visual da recomendação no tabuleiro;
- indicação de mate em N e alerta de ameaça de mate;
- Top N variantes configurável (MultiPV 1–5);
- profundidade de análise configurável;
- avaliação normalizada para o lado escolhido;
- explicações heurísticas e tags de ideias táticas/posicionais sem LLM;
- histórico clicável e navegação lance a lance (`⏮ ← → ⏭`);
- importação de PGN;
- exportação de PGN;
- carregamento e cópia de FEN;
- persistência automática da última sessão em `localStorage`;
- revisão pós-partida com perda em centipawns e precisão estimada;
- classificação dos lances (melhor, excelente, bom, imprecisão, erro e erro grave);
- resumo quantitativo da qualidade dos lances;
- gráfico de avaliação da revisão;
- comparação interativa entre o lance realizado e o melhor lance;
- treino das posições em que ocorreram erros ou erros graves;
- Stockfish 19 em Web Worker/WebAssembly;
- interface responsiva para desktop e mobile.

## Stack

- React 19 + TypeScript
- Vite 7
- `chess.js`
- Stockfish 19 via pacote `stockfish`

## Como executar

A forma recomendada no Linux é:

```bash
./start.sh
```

O script instala as dependências quando necessário, prepara os arquivos locais do Stockfish, inicia o Vite em segundo plano, registra o PID e grava o log em `.xadrez-dev.log`.

Por padrão:

```text
http://localhost:5173
```

Outra porta:

```bash
PORT=5174 ./start.sh
```

Parar tudo:

```bash
./stop.sh
```

Execução manual:

```bash
npm install
npm run dev
```

## Validação

Testes rápidos das regras críticas de xadrez:

```bash
npm test
```

Build de produção:

```bash
npm run build
```

Executar testes e build em sequência:

```bash
npm run check
```

Os testes cobrem, entre outros pontos, xeque-mate, afogamento, repetição tripla, material insuficiente, roque, en passant e promoção.

## Arquitetura

Toda a inteligência de xadrez roda localmente. O frontend envia posições FEN ao Stockfish via protocolo UCI e recebe avaliações, variantes e melhor lance.

No modo Coach, o score do motor é convertido para a perspectiva do lado escolhido. No modo Análise, a avaliação fica na perspectiva das brancas, seguindo a convenção mais comum de ferramentas de análise.

A sessão atual é persistida apenas no armazenamento local do navegador. PGN e FEN podem ser importados/exportados sem backend.

## Diagnóstico

```bash
tail -f .xadrez-dev.log
```

O cliente do Stockfish possui timeout explícito de inicialização e análise para evitar espera indefinida caso o Web Worker falhe. Também trata explicitamente erros críticos de validação UCI/FEN introduzidos no Stockfish 19.

## Licença

O pacote `stockfish`/Stockfish.js é distribuído sob GPL-3.0. Consulte a licença e os requisitos do projeto original ao distribuir binários derivados do motor.
