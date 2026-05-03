# Controle de Tarefas e Progresso

## Ecossistema de Agentes Especializados (Concluídos)
- [x] **Criação da Estrutura**: Criada a pasta `/agents/` contendo as Personas focadas em alta performance e qualidade.
- [x] **GameDevExpert**: Implementado com foco em React 19, TypeScript estrito, ausência de `any` e otimização do Canvas.
- [x] **UIUXMaster**: Implementado para garantir beleza tática, animações fluidas e design premium Triple-A.
- [x] **BalanceAnalyst**: Implementado com foco em Chain of Thought, cálculo rigoroso de Time-To-Kill e controle de orçamento de pontos.
- [x] **QATester**: Implementado para buscar casos de borda, falhas de sincronização no Firebase e testes negativos.
- [x] **GameDesigner**: Implementado para garantir 'Game Feel', assimetria de facções e clareza de feedback visual.
- [x] **SecuritySpecialist**: Implementado para desconfiar do frontend, auditar as `firestore.rules` e focar em sanitização no Express.
- [x] **Orquestração**: O arquivo principal `AGENTS.md` e o `expertise/ARQUITETURA.md` foram atualizados para integrar este novo fluxo de inteligência na Fase 1 de Planejamento.

## Refinamento Visual Premium (Fase 1 Concluída)
- [x] **Fundação de Design**: Implementação de design tokens globais em \src/index.css\ focados em *Glassmorphism* e micro-interações.
- [x] **Draft Tático (Draft Match)**: Interface de criação de partidas totalmente modernizada com cards animados, barras de progresso táticas e hierarquia visual premium.
- [x] **HUD de Combate**: Sidebar e Log de combate refatorados com estética de \Command Center\, utilizando opacidades dinâmicas, animações \framer-motion\ e botões táticos.
- [x] **Refatoração Estética e Padronização UI**: Implementação de `ScreenWrapper` centralizado, eliminação de regressões de fundo preto sólido e conversão de todas as sub-telas para *glassmorphism* tático militar.
- [x] **Iluminação e Background Dinâmico (Menu de Criação)**: Implementação de fundo dinâmico baseado no mapa, refinamento de contrastes e aplicação de "rim lighting" nos painéis de draft para eliminar a sensação de interface escura (UIUXMaster).
- [x] **Restauração de Tooltips Táticos (Menu de Criação)**: Implementação de descrições técnicas detalhadas (HP, Dano, Range, etc.) via atributos `title` em todos os elementos de seleção de exército para melhorar a usabilidade e o entendimento das mecânicas.
- [x] **Botão "Sair da Partida"**: Implementado botão de saída sutil com confirmação de segurança integrado ao HUD de batalha (UIUXMaster).
- [ ] **Efeitos de Partículas e Brilho**: Próxima etapa envolve refinar a renderização no Canvas para adicionar efeitos de impacto e trajetórias com glow (UIUXMaster).

## Correções e Estabilização
- [x] **Correção de Ações de Combate (Frontend)**: Resolvido bug onde os botões "Mover" e "Atirar" estavam desabilitados devido a divergência nos nomes das propriedades `actions` (`movement` -> `move` e `shooting` -> `intervention`).
- [x] **Clarificação de Slots de Armas**: Documentada e explicada a mecânica de `slots` (capacidade de acessórios) para o usuário.
- [x] **Correção Estrutural de Scroll**: Implementação de altura fixa (`h-screen`) no `ScreenWrapper` e remoção de `justify-center` para permitir rolagem fluida em telas longas sem depender do scroll global do navegador.
- [x] **Sincronização e Polling Tático**: Implementação de guardas no pooling para evitar transições automáticas de fase (efeito 'ímã') enquanto o usuário está no Lobby, garantindo controle manual da navegação.
- [x] **Restauração de Modos de Jogo**: Re-implementado o seletor de modo (PvP vs PvE Zumbis) na tela de criação de partida, permitindo ao Jogador A alternar operações táticas.
- [x] **Estabilização de Texturas 3D**: Resolvido crash `Could not load : undefined` no Canvas ao iniciar partidas. Implementada normalização via `getRoleImage` e guardas de validade no componente `Unit3D`.
