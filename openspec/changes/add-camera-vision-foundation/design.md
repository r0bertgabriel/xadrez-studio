## Context

O aplicativo é um cliente React/Vite sem backend. `App.tsx` controla as duas áreas existentes por estado local, `ChessBoard` recebe uma instância `chess.js` para renderização e `StockfishEngine` já isola o UCI em Web Worker. Não existe captura de mídia, processamento de imagem ou modelo de reconhecimento. Veja `proposal.md` para a motivação e `specs/camera-board-analysis/spec.md` para o contrato de comportamento.

## Goals / Non-Goals

**Goals:**

- Criar uma fronteira de visão reutilizável: câmera, calibração, inferência, estabilização e validação não ficam misturadas com a tela de jogo atual.
- Executar captura, transformação geométrica e inferência no dispositivo, mantendo a interface responsiva.
- Converter apenas posições confiáveis e legalmente válidas em análises de Stockfish.
- Viabilizar evolução posterior para detecção automática do tabuleiro ou novo modelo sem mudar a experiência da aba.

**Non-Goals:**

- Detectar automaticamente o tabuleiro na primeira entrega; a calibração dos quatro cantos é manual.
- Treinar um modelo no navegador, armazenar vídeo, sincronizar partidas ou criar um backend.
- Garantir reconhecimento em condições extremas de iluminação, oclusão, reflexo ou conjuntos físicos que não sejam o Staunton clássico de referência.
- Substituir o tabuleiro manual, PGN/FEN, revisão ou Professor de Aberturas.

## Decisions

### Separar a área de câmera como modo de navegação de primeiro nível

Substituir o par de flags implícitas por uma seleção explícita de área (`play`, `openings`, `camera`) e montar a experiência de câmera em componente próprio. A partida manual permanece em memória enquanto o usuário alterna de aba.

Alternativa considerada: adicionar controles de câmera ao `App.tsx` atual. Foi rejeitada porque captura de mídia, canvas e estados de calibração têm ciclo de vida incompatível com a tela de partida e aumentariam o risco de vazamento de stream.

### Tornar o stream proprietário de um hook de câmera

Um hook dedicado solicita `getUserMedia` após interação, enumera dispositivos depois da permissão, troca a câmera selecionada e encerra `MediaStreamTrack`s em parada, desmontagem ou mudança de aba. A UI recebe estados discriminados para suporte, contexto seguro, permissão, dispositivo e stream.

Alternativa considerada: deixar o elemento `video` controlar o stream diretamente. Foi rejeitada porque não centraliza limpeza nem permite teste unitário dos estados de erro.

### Usar calibração manual e homografia para normalizar o tabuleiro

Quatro pontos ordenados pelo usuário definem o quadrilátero da imagem. Um módulo de geometria calcula a transformação projetiva para uma imagem canônica quadrada; a orientação escolhida mapeia cada célula canônica à casa algébrica correta. A validação deve impedir pontos degenerados, auto-interseção e área insuficiente.

Alternativa considerada: OpenCV.js e detecção automática de linhas. Foi adiada: amplia bastante o download e é sensível a tabuleiros, fundos e iluminação. A mesma interface de geometria mantém essa evolução possível.

### Treinar e exportar um modelo próprio em Python

O repositório incluirá ferramentas Python locais para pré-treinar com dados públicos permitidos, preparar as imagens de referência do tabuleiro Staunton clássico suportado, gerar variações controladas, treinar/ajustar os classificadores de ocupação e identidade e exportá-los para ONNX. Dados públicos serão baixados somente por comando explícito, com URL, versão e licença registrados; fotos próprias fazem o fine-tuning e validação final. Os pesos distribuídos serão produzidos por esse pipeline e acompanhados de metadados de versão, classes, normalização, proveniência e conjunto de referência.

Alternativa considerada: redistribuir um checkpoint público já treinado. Foi rejeitada porque os pesos encontrados têm licença/proveniência insuficiente para redistribuição ou foram treinados para peças e condições distintas. O pipeline próprio elimina custo de API e permite ajuste ao tabuleiro realmente observado.

### Executar reconhecimento em Worker com contrato de modelo ONNX

Frames amostrados em cadência limitada são convertidos para `ImageBitmap` e enviados a um Worker de visão. Após a normalização, o Worker produz 64 previsões no contrato `empty | wp..wk | bp..bk`, uma confiança por casa e uma confiança agregada. O runtime ONNX usa WebGPU quando presente e compatível, com WASM/SIMD como fallback; o modelo e os binários são assets locais versionados.

Alternativa considerada: inferência no thread principal. Foi rejeitada para evitar degradação da interação e da prévia. TensorFlow.js foi considerado, mas ONNX mantém o modelo independente do framework de treinamento e oferece as duas rotas de execução necessárias no navegador.

### Confirmar observações com uma máquina de estados temporal e `chess.js`

O estado segue `uncalibrated -> calibrating -> observing -> candidate -> confirmed -> needs-confirmation`. Uma FEN candidata só avança após N frames equivalentes, confiança mínima por casa e confiança agregada mínima. Uma posição confirmada passa por validação estrutural e, depois da primeira posição, por inferência de transição legal a partir da última `Chess` válida. Divergências não alteram a posição analisável; a tela pede confirmação manual ou nova calibração.

Alternativa considerada: aceitar a previsão de cada frame. Foi rejeitada porque oclusões durante o movimento gerariam FENs ilegais e análises ruidosas.

### Manter a análise desacoplada e cancelar resultados obsoletos

A aba de câmera usa um adaptador de análise que recebe somente uma FEN confirmada. Para uso contínuo, a variante lite do Stockfish é a padrão; respostas são associadas à FEN/revisão de observação e descartadas se a posição muda. A configuração de variante deve continuar disponível para análises futuras mais pesadas sem carregar o motor full durante observação ao vivo.

Alternativa considerada: acionar Stockfish a cada frame. Foi rejeitada por custo de CPU, fila de UCI e resultados inevitavelmente defasados.

### Preservar privacidade por arquitetura

O stream, frames, coordenadas de calibração e previsões permanecem no navegador. A primeira entrega não chama APIs remotas, não envia telemetria de imagens e não persiste vídeo. Preferências não sensíveis, como câmera selecionada ou orientação, podem usar armazenamento local somente após serem explicitamente definidas.

## Risks / Trade-offs

- [Modelo com baixa precisão fora do conjunto Staunton de referência] -> capturar imagens de referência, publicar métricas por casa/tabuleiro e exibir confiança/estado pendente em vez de inferir certeza.
- [Câmeras lentas ou dispositivos sem WebGPU] -> amostrar frames em cadência limitada, usar Worker e fallback WASM; reduzir resolução antes da inferência.
- [Oclusão durante movimento] -> exigir estabilidade temporal e ignorar candidatos ilegais.
- [Permissão recusada, HTTPS ausente ou troca de câmera] -> manter estados recuperáveis e nunca iniciar captura automaticamente.
- [Uso simultâneo da engine em outra aba] -> cancelar a análise ao alternar áreas e serializar solicitações pela instância/adaptador de Stockfish.
- [Transformação ruim por pontos imprecisos] -> mostrar sobreposição da grade e permitir recalibrar sem reiniciar o stream.

## Migration Plan

1. Publicar a nova aba desativada até que os assets de modelo e as verificações de build estejam incluídos.
2. Habilitar a captura somente por ação explícita em HTTPS/localhost; os modos existentes não mudam.
3. Validar em desktop e mobile com permissões concedidas, negadas e sem câmera antes de expor a aba como recurso estável.
4. Para rollback, remover a entrada da aba e os assets de visão; não há dados de servidor ou migração de armazenamento a reverter.
