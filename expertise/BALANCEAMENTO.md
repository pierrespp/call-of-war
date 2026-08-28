# Documento de Design de Rebalanceamento: Call of War

Este documento apresenta a análise e a proposta inicial de um novo balanceamento tático para o 'Call of War'. 
O objetivo é garantir que cada escolha de classe e armamento seja significativa, focando em um combate moderno e letal.

## 1. Mapeamento da Estrutura Atual

Atualmente (conforme lido em `src/data/constants.ts`), nossos parâmetros de sistema estão centralizados em dicionários de TypeScript (Records):
- **Classes:** 5 arquétipos base separados por facção (`Assalto`, `Suporte`, `Médico`, `Granadeiro`, `Sniper`). 
  - *Status:* O HP base está nivelado entre 4 (Sniper) e 6 (Assalto). A mobilidade está travada em `10.5` para todos. O limite de precisão ("Hit") varia fortemente (60 no Médico a 90 no Sniper). Pela atual tabela a capacidade de modificação está baseada mais no custo de pontos (`points`) de 10 a 20.
- **Armas:** Estão classificadas por tipos, com dano variando de `2` (Pistolas) até `8` (Sniper M82). Elas possuem custos sistêmicos como `shots` e `reload`.
- **Armaduras:** Focadas em uma troca básica: dão de `1 a 4` de redução de dano raso e causam `0 a 3` de penalidade de movimento.
- **Acessórios (Attachments) e Skills:** Concedem modificadores diretos condicionais (+ hit, + alcance, ações extras).

## 2. Definição do Ponto Zero (Baseline) e TTK Letal

Para que o jogo se assemelhe a *Thunder Tier One* e seja punitivo para quem não usa coberturas, definimos a nossa **Escala Base**:

- **O Soldado Padrão (Baseline Absoluta)**
  - **HP Base:** 10 pontos.
  - **Mobilidade Base:** 10 metros.
  - **Hit Chance (Precisão Básica do Soldado):** 70%.

- **Arma Base (Fuzil de Assalto - M4A1 / AK-47)**
  - **Dano por Tiro:** 4
  - **Sintonia de Cadência (`shots`):** 3
  - **TTK (Time-To-Kill):** Letalidade Punitiva. Sem armadura, 3 tiros que acertem causam 12 de dano, matando um soldado de 10 HP em **1 Turno/1 Ação de Ataque**. Isso força a necessidade *imperativa* do soldado inimigo estar curado ou vestindo blindagem.

## 3. Orçamento de Status (Stat Budgeting)

Imaginando um "orçamento imaginário" de poder (digamos que a Arma Base custa 100 pontos abstratos de poder design), e variando outros equipamentos para o mesmo nível, temos o seguinte trade-off tático:

| Categoria                       | Dano / Tiro | Cadência (Shots) | Alcance Ideal | Chance Acerto Mod | Vantagens | Desvantagens (Trade-offs) |
| :--- | :---: | :---: | :---: | :---: | :--- | :--- |
| **Fuzil de Assalto (Baseline)** | 4           | 3                | Médio | 0% | Perfeito para tropas de meio-termo, bom engajamento geral. | Nenhuma vantagem clara em CQB ou longo alcance contra armas de nicho. |
| **Escopeta (CQB)**              | 8           | 1-2              | Curto | +20% Curta | Dano absurdo, destrói alvos não blindados. | Inútil a alcances além do Curto. Altamente penalizado pelo mapa. |
| **Rifle (Sniper)**              | 10          | 1                | Longo | +10% Longa | Pode perfurar armaduras menores num hit kill se criticar, controle de mapa longo. | Péssimo para resposta de Overwatch sob pressão; taxa de recarga horrível. |
| **LMG (Supressão)**             | 3           | 5                | Médio | -10% sem Bi-pé | Fóco primário e alto total (15 pot.) de dano de fogo constante e negação de área. | Custo de slots alto e penalidade à precisão enquanto de pé. |

## 4. A Trindade de Classes/Equipamentos

Considerando o triângulo "Mobilidade vs. Proteção vs. Poder de Fogo", ajustaremos a ideia dos Status da Classe onde o `movement` e `HP` devem ser variáveis cruciais e não estáticos.

- **O Tanque (Forte, Lento) - Suporte/Granadeiro:**
  - Equipamento: Armadura Pesada (-3 Movimento, 4 Redução) + LMG. 
  - Ficará com ~7m de movimento e anulará quase 12 pontos de dano em rajadas graças à redução fixa. Vira um *bunker* móvel.
- **O Batedor (Ágil, Frágil) - Médico/Avançado:**
  - Equipamento: Nenhuma Armadura / Cinto Tático. Armas leves (Submetralhadoras/Escopeta). 
  - Ficará com 10-12m de movimento para varrer as ladeiras do terreno cruzando para dentro das edificações mais rápidas e evitar ser mirado na abertura limpa do cenário.
- **O Operador Versátil - Assalto:**
  - Equipamento: Armadura Moderada (-2 Movimento, 3 Redução), Fuzil. 
  - Movimento base fixado no normal em ~8m, trocando acertos limpos da média distância a favor da durabilidade em tiroteios corriqueiros.

## 5. Economia de Ação e Utilidade

Num sistema letal de 1 hit-kill de Sniper e Rajada da Morte do Assalto, utilidade é rei:
- **Granadas de Fumaça (Ocultação Base):** Precisam ter peso forte e anular a mira ("Hit" cai drasticamente) bloqueando Linha de Visão. Isto é crucial para atravessar o mapa seguro em campo limpo contra Snipers.
- **Supressão:** Adicionar peso e funcionalidade real ao "overwatch". Se uma LMG não derruba a vida, ela forçaria um debuff nos Status (`-Movimento` e `-Hit`) fazendo o inimigo se engastar e não devolver fogo, essencial para fechar a investida inimiga.
- **Granadeiro & Explosivos:** Além do dano bruto na vida, podem causar quebra de armadura.

---

### Próximos Passos
Por favor, analise a proposta baseada no Fuzil (4 dano x 3 tiros vs HP 10). Se estivermos alinhados com o baseline e o TTK desejado descrito no passo 2, poderei desdobrar isso em valores e números matemáticos específicos para alterar nos atributos atuais de `src/data/constants.ts` com a sua aprovação.
