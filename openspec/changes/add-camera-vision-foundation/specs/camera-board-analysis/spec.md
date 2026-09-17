## Purpose

Permitir que o usuário observe um tabuleiro físico pela câmera, confirme posições confiáveis localmente e receba análises do Stockfish sem transmitir vídeo para serviços externos.

## ADDED Requirements

### Requirement: Aba independente de análise por câmera
O sistema SHALL disponibilizar uma aba de análise por câmera separada dos modos de jogo/análise e do Professor de Aberturas. A aba SHALL preservar as partidas e preferências do modo de jogo existente ao ser aberta ou fechada.

#### Scenario: Abrir a análise por câmera
- **WHEN** o usuário seleciona a aba de análise por câmera
- **THEN** o sistema apresenta a experiência de câmera sem substituir a partida manual em andamento

### Requirement: Captura de câmera com controle explícito
O sistema SHALL solicitar acesso à câmera somente após uma ação explícita do usuário, permitir escolher entre câmeras de vídeo disponíveis e disponibilizar um controle para encerrar a captura. O sistema SHALL informar claramente quando a câmera não for suportada, a página não estiver em contexto seguro, não houver dispositivo disponível ou a permissão for negada.

#### Scenario: Acesso concedido à câmera
- **WHEN** o usuário escolhe uma câmera e inicia a captura em um contexto compatível
- **THEN** o sistema mostra a prévia do vídeo e indica que a captura está ativa

#### Scenario: Permissão de câmera negada
- **WHEN** o navegador recusa o acesso à câmera
- **THEN** o sistema mantém a aba utilizável e apresenta uma mensagem com a causa e a ação de tentar novamente

#### Scenario: Encerrar captura
- **WHEN** o usuário encerra a câmera ou sai da aba de análise por câmera
- **THEN** o sistema interrompe todas as faixas de vídeo ativas e deixa de processar novos frames

### Requirement: Calibração manual do tabuleiro
O sistema SHALL permitir que o usuário defina os quatro cantos de um tabuleiro físico visível na prévia, validar que formam um quadrilátero utilizável e mostrar a grade 8x8 alinhada à área calibrada. A orientação de brancas e pretas SHALL ser escolhida explicitamente durante a calibração.

#### Scenario: Calibração válida
- **WHEN** o usuário informa quatro cantos distintos que delimitam o tabuleiro
- **THEN** o sistema exibe uma grade de 64 casas projetada sobre a imagem e habilita a observação de posições

#### Scenario: Calibração inválida
- **WHEN** os cantos são repetidos, cruzados ou não formam uma área utilizável
- **THEN** o sistema rejeita a calibração e explica que os pontos devem ser ajustados antes de iniciar a observação

### Requirement: Reconhecimento local e estado observável
O sistema SHALL processar frames e classificar cada casa como vazia ou como uma das doze combinações de cor e peça sem enviar frames, imagens ou FEN para um serviço remoto. A primeira versão SHALL reconhecer peças Staunton clássicas vistas de cima, sob boa iluminação, a partir de um modelo local preparado para o conjunto físico de referência. O sistema SHALL exibir a confiança da observação e SHALL distinguir uma posição candidata de uma posição confirmada.

#### Scenario: Posição candidata ainda instável
- **WHEN** as classificações recentes não atingem a confiança ou a estabilidade temporal configuradas
- **THEN** o sistema exibe a posição como candidata e não atualiza a posição confirmada nem solicita análise da engine

#### Scenario: Posição confirmada
- **WHEN** a mesma posição candidata atinge a confiança e estabilidade temporal configuradas
- **THEN** o sistema publica a FEN confirmada, a mostra na interface e a disponibiliza para validação de xadrez

### Requirement: Modelo local reproduzível
O sistema SHALL fornecer uma forma local e documentada de preparar fotos de referência de um tabuleiro Staunton clássico, produzir um classificador de 13 classes e exportar o modelo para um artefato consumível pelo navegador. A preparação SHALL executar sem chamar serviços de inferência ou treinamento remotos.

#### Scenario: Preparar modelo para o tabuleiro de referência
- **WHEN** um desenvolvedor fornece as fotos de referência exigidas e executa o pipeline local documentado
- **THEN** o pipeline produz um artefato ONNX versionado e um relatório de validação para uso pela aba de câmera

### Requirement: Validação de posição e transição legal
O sistema SHALL validar uma posição confirmada e cada transição posterior pelas regras de xadrez antes de aceitá-la como estado analisável. O sistema SHALL manter a última posição válida quando a observação não puder ser interpretada como uma posição inicial permitida ou como uma continuação legal.

#### Scenario: Lance físico legal detectado
- **WHEN** uma posição confirmada representa um único lance legal a partir da última posição válida
- **THEN** o sistema aceita a nova posição, registra o lance observado e atualiza a FEN analisável

#### Scenario: Observação incompatível com as regras
- **WHEN** uma posição confirmada não pode ser aceita como posição inicial permitida nem como continuação legal da última posição válida
- **THEN** o sistema mantém a última posição válida, marca a observação como requerendo recalibração ou confirmação e não envia a observação à engine

### Requirement: Dicas de Stockfish somente para posição válida
O sistema SHALL solicitar análise local do Stockfish somente para uma posição confirmada e válida. A interface SHALL mostrar a melhor jogada e sua avaliação, ou um estado de carregamento/falha, sem bloquear a prévia de câmera.

#### Scenario: Dica para posição válida
- **WHEN** uma nova posição válida é confirmada
- **THEN** o sistema solicita a análise local e mostra a melhor jogada e avaliação associadas à FEN confirmada

#### Scenario: Resultado de análise desatualizado
- **WHEN** a posição confirmada muda antes de uma análise solicitada terminar
- **THEN** o sistema descarta o resultado anterior e não o apresenta como dica da nova posição
