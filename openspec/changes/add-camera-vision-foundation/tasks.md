## 1. Base de visão e modelo local

- [x] 1.1 Adicionar dependências de inferência ONNX no navegador e configuração de assets locais; verificar que `npm run build` resolve os binários sem chamada remota.
- [ ] 1.2 Criar os tipos, geometria de quadrilátero/homografia, grade 8x8 e conversão orientada para casas algébricas; verificar com testes unitários de cantos válidos, degenerados e orientação.
- [ ] 1.3 Adicionar ferramentas Python locais para baixar dados públicos por ação explícita, preparar fotos Staunton, gerar exemplos de 13 classes, treinar/validar e exportar ONNX com metadados de licença/proveniência; verificar com `python` em um conjunto fixture mínimo, sem rede/API.

## 2. Captura e calibração

- [ ] 2.1 Implementar hook de ciclo de vida da câmera com seleção de dispositivo, estados de suporte/permissão/contexto seguro e limpeza das tracks; verificar com testes dos estados e inspeção de parada ao desmontar.
- [ ] 2.2 Implementar a aba e a tela de análise por câmera, preservando o estado da partida manual ao alternar; verificar navegando entre as três abas.
- [ ] 2.3 Implementar prévia de vídeo, seleção de quatro cantos, orientação e sobreposição da grade, incluindo rejeição de quadriláteros inválidos; verificar a calibração em uma imagem ou stream fixture.

## 3. Reconhecimento e estado de xadrez

- [ ] 3.1 Implementar o protocolo de Worker para frames, classificação ONNX por casa, confiança e fallback WASM; verificar que uma fixture classificada retorna 64 resultados sem bloquear a UI.
- [ ] 3.2 Implementar estabilização temporal, FEN candidata/confirmada e validação de posição/transição com `chess.js`; verificar cenários de frame instável, lance legal e observação ilegal.
- [ ] 3.3 Integrar a FEN confirmada ao Stockfish lite, cancelar análises obsoletas e mostrar melhor jogada/avaliação na aba; verificar que resultado de FEN anterior não é exibido após uma nova confirmação.

## 4. Qualidade e entrega

- [ ] 4.1 Adicionar fixtures e testes determinísticos para geometria, classificação simulada, estabilização e transições; verificar `npm test`.
- [ ] 4.2 Documentar captura das fotos de referência, treinamento/exportação local, requisitos HTTPS/localhost, limitações e privacidade; verificar que README permite repetir o fluxo sem API paga.
- [ ] 4.3 Executar `npm run check`, validar manualmente permissão concedida/negada/sem câmera e revisar que nenhum frame ou FEN é enviado a endpoint remoto.
