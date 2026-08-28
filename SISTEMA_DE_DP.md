# Sistema de Pontos de Dificuldade (DP) - PvE Zumbis

O sistema de **Difficulty Points (DP)** foi revisado e totalmente rebalanceado para garantir que a ameaça no modo cooperativo acompanhe a equipe não com pancadas absurdas, mas com um escalonamento sombrio: começa controlável, e se torna punitivo com o tempo. A premissa central é que o "DP Atual" em campo tenta alcançar um "DP Alvo". Zumbis nascem todo fim de turno para suprir o delta.

## 1. DP Alvo: Quanta Dificuldade Deve Existir?
O cálculo não adiciona números fixos grandes, mas sim um valor base orgânico que é expandido por multiplicadores de acordo com o estado do jogo.

1. **Dificuldade e Jogadores (A Base):**  
   - Tudo começa num valor de DP Fixo de **15 (Normal) ou 25 (Hard)**.
   - Para cada jogador sobrevivente da equipe A, o alvo sobe levemente para respeitar o poder de fogo: **+5 DP por cabeça no Normal**, **+7 DP no Hard**.
   - *Exemplo: Um esquadrão completo de 4 pessoas numa sala Normal começa seu turno 1 mirando ~35 DP (Trazendo em torno de 7 zumbis para a largada).*

2. **Escalonamento de Turno (A Ameaça Crescente):** 
   - A cada turno que se passa, o alvo de DP ganha um degrau no seu multiplicador contínuo de **+5%**.
   - O tempo é o maior inimigo da equipe. No turno 10, a dificuldade global já está multiplicada por `1.5x`. Num dramático turno 20, o escopo dobrou (`2.0x`).

3. **Proximidade da Extração (O Polígono de Tensão):**  
   - Ao identificar a área de extração (linhas "extraction" colocadas pelo dono no editor).
   - O jogo monitora especificamente o **Ponta** (jogador mais perto de exfiltrar).
   - Ao passar da linha dos `40 metros` do objetivo, mais bônus é inserido no alvo proporcionalmente à sua proximidade (Até um teto de **+50%** ao multiplicador final).

*A Fórmula do Alvo Base:*
`Base DP = (BaseDP + Jogadores*K) * (1 + (Turnos * 0.05) + FatorPonta(0.0 a 0.5))`

## 2. A Barra de Barulho (Gatilho Cumulativo de Atenção)
A verdadeira "Cota de DP Alvo" que dita quantos zumbis vão nascer é estrangulada pelo **Sistema de Furtividade / Barulho de Fundo**.

Toda partida se inicia em zero absoluto de ruído. Se o mapa estiver totalmente furtivo (Ninguém atirou, ninguém correu e não houve alarmes), a horda libera apenas **10%** do DP previsto. Os sobreviventes "não existem" no mapa de maneira orgânica.

Conforme a partida avança, ações do esquadrão aumentam globalmente a barra de Ruído (0 a 100), destravando a cota percentual de DP que o Diretor do jogo tem permissão para lançar nas cabeças da equipe. O som vai subindo através de engajamento direto:

1. **Atirar ("Primeiro Sangue"):** Efetuar um disparo em campo e quebrar o silêncio atrai atenção massiva (**+10 de Barulho**).
2. **Explosivos:** Lançar e detonar granadas rasga a atmosfera da cidade, gerando eco imenso e atraindo a horda mais forte imediata (**+25 de Barulho**).
3. **Mecânica de Investida:** Correr quebrando furtividade para salvar um aliado ou fazer progresso acelerado gera comoção moderada (**+5 de Barulho**).
4. **Tempo no Mapa (O fator passivo):** Zumbis não são tolos pra sempre. A cada turno que a equipe transita no mapa, a percepção ambiental geral natural deles sobe aos poucos, dificultando segurar o stealth infinito (**+5 de Barulho todo turno**).

*Ao chegar perto do 100 de Ruído (100%), o DP Alvo total do jogo passa a bater de frante contra a equipe usando sua capacidade máxima.*

## 3. DP Atual: Medindo a Ameaça Viva
Em contraponto ao DP Alvo, o DP Atual contabiliza o quão pressionado o esquadrão está *nas trincheiras agora*. Um zumbi é um número de DP, mas ele pode desvalorizar se for inútil ou engordar se for letal.

Cada zumbi contribui dependendo de sua posição:
1. **O Zumbi Básico (5 DP):** 
   Ameaça típica, perambulando (15 a 30 casas de distância).

2. **Proximidade do Alvo (O multiplicador tático):**  
   Zumbis longe caem no esquecimento logístico para forçar novos spawns onde realmente importa.
   - **Esquecidos (> 30 casas):** Geram apenas **1 DP**. O sistema pensa que a barra está limpa e joga zumbis fresquinhos próximos.
   - **Atrasados (> 15 casas):** Caem pra **3 DP**.
   - **Perigo Mortal (<= 3 casas):** Sobem pra **7 DP**. Um bando com 5 zumbis cheirando o cangote bate *35 DP* por si só, paralisando os spawns novos pelo susto local e focando o embate.

3. **Morte Sangrenta (Vida Atual):**  
   Um zumbi quase morto gera menos pressão que um saudável. O DP é multiplicado pela porcentagem de vida do inimigo (piso mínimo de 20%). Tiros dados não abatem o monstro *mas abrem espaço de DP*. Se um esquadrão só aleija a horda sem matar as ameaças, ele destrava DP pro "Diretor" jogar mais corpos no mapa no limite final da rodada.

## 3. Dinâmica de Hordas (Spawns)
Quando o turno encerra, o bot PVE pega a calculadora:
`DP Alvo - DP Atual = DP Faltante.`
Os zumbis nascem à uma taxa estipulada de que cada unidade vai "comer" cerca de 5 pontos dessa conta.

**A Árvore de Locais de Spawns:**
1. **Células PvE Definidas (spawn_pve):** Tenta nascer os zumbis nas grades pintadas e esconderijos apontados pelo dono do mapa (Ex: Bueiros).
2. **Sistema de Emboscada (Fallback):** 
   - Varrerá uma área nos fundos e flancos.
   - Evita áreas que estejam à menos de *10 casas* coladas de distância. Para ninguém tomar spawn no colo direto.
