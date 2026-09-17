## Why

O Xadrez Coach hoje recebe posições somente pelo tabuleiro manual, PGN ou FEN. Uma aba de visão por câmera permitirá acompanhar um tabuleiro físico e transformar posições observadas em dicas locais do Stockfish, sem exigir backend ou envio de vídeo.

## What Changes

- Adicionar uma aba independente para analisar um tabuleiro físico pela câmera.
- Adicionar captura de vídeo local, seleção de câmera e tratamento explícito de permissão, indisponibilidade e encerramento do stream.
- Adicionar calibração manual dos quatro cantos do tabuleiro e normalização da imagem em uma grade 8x8.
- Adicionar uma fronteira de reconhecimento de peças com inferência local, confiança por casa e estabilização temporal antes de aceitar uma posição.
- Adicionar um pipeline Python local para preparar fotos de referência de um conjunto Staunton clássico, treinar/ajustar o classificador e exportar pesos ONNX próprios para o navegador.
- Validar posições e transições observadas com `chess.js` antes de enviá-las ao Stockfish.
- Mostrar a FEN confirmada, estado de confiança e dicas do Stockfish sobre a imagem da câmera.
- Adicionar fixtures e testes determinísticos para o pipeline de visão e a validação de transições.

## Capabilities

### New Capabilities

- `camera-board-analysis`: captura, calibração, reconhecimento local, validação de posição e dicas para um tabuleiro físico observado por câmera.

### Modified Capabilities

- Nenhuma.

## Impact

- Novos componentes, hooks, tipos e Worker para a aba de visão; a experiência atual de jogo e análise permanece isolada.
- Nova dependência de inferência ONNX para navegador e assets de modelo versionados/servidos estaticamente.
- Ferramentas Python de desenvolvimento para preparação de dados, treinamento e exportação; não haverá custo de API, serviço remoto ou execução Python no cliente.
- Uso da API de câmera do navegador, disponível somente em contexto seguro ou localhost, com todo vídeo e processamento mantidos no dispositivo.
- Reuso de `ChessBoard`, `chess.js` e `StockfishEngine`; será necessário permitir que a camada de visão escolha a variante de Stockfish apropriada sem duplicar o protocolo UCI.
