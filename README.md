# Xadrez Coach

Aplicação web para estudar xadrez, analisar partidas e praticar posições com o **Stockfish 19 Lite executado localmente no navegador**. O tabuleiro permite reproduzir manualmente os lances de uma partida, examinar variantes e revisar decisões sem depender de uma API paga ou de um backend de análise.

> **Estado das funcionalidades:** a análise do tabuleiro, os treinos e a captura de tela têm fluxos distintos. A captura **por câmera** oferece visualização e calibração do tabuleiro, mas **ainda não reconhece automaticamente peças ou lances**. A captura **de tela** acompanha mudanças visuais em um tabuleiro previamente calibrado e pode exigir confirmação manual de lances ambíguos; não faz reconhecimento geral de peças por IA.

## Funcionalidades

| Área | O que oferece |
| --- | --- |
| **Coach** | Escolha de brancas ou pretas, recomendações para o lado escolhido, seta do melhor lance, avaliação, variantes MultiPV, profundidade configurável e explicações heurísticas. Os dois lados são movimentados manualmente. |
| **Análise livre** | Análise contínua dos dois lados, navegação no histórico, importação/exportação de PGN e carregamento/cópia de FEN. |
| **Revisão pós-partida** | Classificação de lances, perda estimada em centipawns, precisão estimada, gráfico de avaliação, comparação com o melhor lance e treino dos erros identificados. |
| **Professor de Aberturas** | Cursos com explicações lance a lance e modo de treino ativo, com verificação de desvios da linha estudada. |
| **Centro de Treino** | Exercícios de tática e finais, puzzles gerados a partir de erros em partidas revisadas e repetição espaçada do progresso. |
| **Análise da tela ao vivo** | Compartilhamento de tela, calibração de quatro cantos, identificação de mudanças nas casas e correspondência com lances legais, com resolução manual quando necessário. |
| **Tabuleiro por câmera — experimental** | Acesso à câmera, seleção do dispositivo, orientação e calibração visual de uma grade 8×8; reconhecimento automático ainda não implementado. |

O tabuleiro principal também oferece movimento por clique ou arrastar/soltar, indicação de movimentos legais, promoção, destaque de xeque, detecção de fim de partida e personalização de peças e cores. A aplicação é responsiva para desktop e dispositivos móveis.

## Tecnologias e funcionamento

- **Interface:** React 19, TypeScript e Vite 7.
- **Regras e notação:** `chess.js`.
- **Motor:** Stockfish 19 Lite, via Web Worker/WebAssembly e protocolo UCI.
- **Persistência:** sessão local no `localStorage`; histórico, revisões e progresso de treino mantidos no armazenamento do navegador.
- **Captura e visão:** APIs de câmera/compartilhamento de tela do navegador e comparação de alterações visuais nas casas do tabuleiro. O pacote `onnxruntime-web` está presente nas dependências, mas isso **não significa que o reconhecimento por câmera esteja pronto**.

A análise do motor é local. Não é necessário cadastrar uma chave de API para as funções descritas acima. A performance depende do navegador e do equipamento; a captura de tela requer permissão explícita e pode variar conforme o conteúdo compartilhado.

## Pré-requisitos

- Node.js e npm instalados.
- Navegador moderno com suporte a WebAssembly e Web Workers.
- Para captura de câmera ou tela: navegador compatível, permissão de acesso e execução em `localhost` ou HTTPS.
- Para os scripts `start.sh` e `stop.sh`: ambiente Linux com Bash.

## Instalação e execução

Clone o repositório e entre na pasta:

```bash
git clone https://github.com/r0bertgabriel/xadrez-dev.git
cd xadrez-dev
npm ci
npm run dev
```

Abra o endereço informado pelo Vite no terminal (normalmente `http://localhost:5173`). O `postinstall` e o comando `dev` preparam os arquivos locais do Stockfish automaticamente.

### Execução em segundo plano no Linux

```bash
./start.sh
# Acesse http://localhost:5173
./stop.sh
```

O `start.sh` instala dependências caso necessário, prepara o motor, inicia o Vite, registra o processo em `.xadrez-dev.pid` e escreve o log em `.xadrez-dev.log`. Para usar outra porta:

```bash
PORT=5174 ./start.sh
```

Para acompanhar o log:

```bash
tail -f .xadrez-dev.log
```

**Atenção:** o script inicia o Vite com `--host 0.0.0.0`, disponibilizando o servidor de desenvolvimento nas interfaces de rede do computador. Use-o apenas em uma rede confiável; não é uma configuração de produção.

## Como usar

1. Abra a área principal e escolha **Coach** (brancas ou pretas) ou **Análise livre**.
2. Movimente as peças dos dois lados para reproduzir a partida. Ajuste profundidade e quantidade de variantes conforme a capacidade do dispositivo.
3. Importe um PGN ou carregue uma FEN para estudar outra posição; ao terminar, use a revisão pós-partida para examinar os lances.
4. Acesse **Professor de Aberturas** para estudar linhas explicadas ou praticá-las; use **Centro de Treino** para trabalhar tática, finais e erros identificados nas revisões.
5. Na **Análise da tela ao vivo**, conceda a permissão de compartilhamento, marque os quatro cantos do tabuleiro na ordem indicada, defina a orientação e acompanhe o status do rastreamento. Confirme manualmente lances que não possam ser determinados com segurança.
6. No **Tabuleiro por câmera**, conceda acesso e calibre a grade. Essa área ainda não converte a imagem em uma posição de xadrez automaticamente.

**Limitação importante:** o rastreamento da tela compara mudanças de luminosidade nas casas e as relaciona com os lances legais da posição conhecida. Animações, destaques, mudança de tema, orientação incorreta, baixa qualidade de captura e perda de sincronização podem exigir nova calibração ou correção manual.

## Comandos úteis

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Prepara o Stockfish e inicia o servidor de desenvolvimento. |
| `npm test` | Executa os testes de regras de xadrez e dados de treino. |
| `npm run build` | Prepara o motor, verifica TypeScript e gera `dist/`. |
| `npm run preview` | Pré-visualiza localmente o build gerado. |
| `npm run check` | Executa testes e build em sequência. |
| `npm run prepare:engine` | Copia/prepara os arquivos do Stockfish utilizados pela interface. |

## Organização do código

```text
src/
  App.tsx                # Tabuleiro principal, Coach, análise e revisão
  OpeningTrainer.tsx     # Aberturas e treino ativo
  TrainingHub.tsx        # Exercícios e progresso
  ScreenAnalysis.tsx     # Compartilhamento e rastreamento da tela
  CameraAnalysis.tsx     # Captura/calibração por câmera (experimental)
  engine.ts              # Integração com Stockfish
  hooks/                 # Estado do jogo, motor e captura
  vision/                # Geometria e acompanhamento visual do tabuleiro
  persistence.ts         # Dados locais de partidas/revisões/treino
  training-data.ts       # Posições de treino
scripts/                 # Preparação do motor e testes
public/pieces/           # Conjuntos de peças
openspec/                # Especificações e propostas de mudanças
```

## Testes e diagnóstico

```bash
npm run check
```

Os testes automatizados cobrem regras críticas de xadrez e dados de treino. O comando acima também verifica o build, mas **não substitui testes manuais de interface, permissões de captura e comportamento do motor em diferentes navegadores**.

Se a análise não iniciar, consulte o console do navegador e, ao usar `start.sh`, o arquivo `.xadrez-dev.log`. Confira se os arquivos do motor foram preparados com `npm run prepare:engine`. Para problemas de captura, verifique permissões, origem segura (`localhost`/HTTPS) e a calibração do tabuleiro.

## Licenças e atribuições

O Stockfish/Stockfish.js é distribuído sob **GPL-3.0**; verifique as obrigações da licença ao redistribuir o motor e seus binários. Os conjuntos de peças possuem atribuições próprias em [`public/pieces/ATTRIBUTION.md`](public/pieces/ATTRIBUTION.md). Este repositório não declara aqui uma licença geral para todo o código da aplicação.
