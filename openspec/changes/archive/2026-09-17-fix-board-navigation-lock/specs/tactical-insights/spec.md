## Purpose

Define como o painel de coaching classifica e apresenta observações táticas sobre a posição atual, distinguindo oportunidades do lado a mover de ameaças reais vindas do adversário.

## ADDED Requirements

### Requirement: Distinção entre oportunidades próprias e ameaças do adversário
O sistema SHALL classificar separadamente (a) lances de xeque ou captura disponíveis para o lado a mover, que são oportunidades desse lado, e (b) peças do lado a mover que estão sob ataque sem defesa suficiente, que são ameaças reais contra esse lado. O sistema NÃO SHALL apresentar as duas categorias sob um único rótulo que sugira que ambas são "ameaças" contra o usuário.

#### Scenario: Lance de captura disponível é rotulado como oportunidade
- **WHEN** o lado a mover tem uma captura de valor disponível (ex.: pode ganhar a dama adversária)
- **THEN** essa informação é apresentada como uma jogada/oportunidade tática do lado a mover, não como algo que o "ameaça"

#### Scenario: Peça pendurada é rotulada como ameaça real
- **WHEN** uma peça do lado a mover está atacada pelo adversário e não é suficientemente defendida
- **THEN** essa informação é apresentada como uma ameaça real contra o lado a mover

#### Scenario: Painel sem oportunidades nem ameaças
- **WHEN** não há capturas/xeques relevantes disponíveis nem peças penduradas na posição
- **THEN** o sistema informa a ausência de itens em cada categoria, sem misturar as mensagens
