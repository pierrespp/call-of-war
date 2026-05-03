1. Nome e Briefing
Título da Missão: Operação Fuga Silenciosa

Contexto Tático: "O centro da cidade foi perdido. O ponto de extração original foi sobreposto pela horda. Nosso helicóptero conseguiu um pouso rápido no campo de futebol do Parque Norte (Ponto Z). Vocês estão na Zona Sul (Ponto X). A Avenida Principal oferece um caminho rápido, mas vocês ficarão expostos a qualquer infectado vagando por lá. Os becos comerciais oferecem cobertura, mas são um labirinto escuro — vocês não saberão o que está virando a esquina até darem de cara com eles. Fiquem fora do campo de visão, usem supressores se precisarem atirar, e não toquem nos alarmes dos carros. Movam-se."

2. Design do Mapa (Grid Recomendado: 40x80 Células / 60x120 Metros)
O mapa é um retângulo alongado verticalmente (Sul para Norte) para enfatizar a travessia.

Ponto X (Início - Borda Sul): Um comboio capotado em um cruzamento fechado.

Via Principal (Centro do Mapa, sentido Sul-Norte):

Uma avenida larga de 8 células de largura.

Cobertura: Quase nula. Alguns detritos dispersos (Meia Cobertura / -20% hit).

Visão: Limpa. Linha de visão (LoS) irrestrita, permitindo que jogadores vejam longe, mas também sendo vistos facilmente.

Os Becos (Flancos Leste e Oeste):

Ruas estreitas de 2 a 3 células de largura.

Cobertura: Caçambas de lixo, esquinas de prédios e caixas (Cobertura Total / -40% hit).

Visão: Altamente restritiva devido aos ângulos de 90 graus das paredes dos prédios. A Fog of War é densa aqui.

Ponto Z (Extração - Borda Norte):

O campo aberto do parque. Uma área verde de 10x10 células. Sem cobertura.

3. Configuração da Horda e IA (Visão e Ruído)
A IA agora possui dois estados: Dormente e Alerta.

Status Base: Movimento de 6m (4 células).

Estado Dormente (Spawn Inicial):

10 a 15 zumbis já pré-posicionados pelo mapa (espalhados entre becos e avenida).

Eles não se movem ou se movem aleatoriamente 1 célula por turno.

Possuem um "Cone de Visão" de 15m (10 células) voltado para uma direção estática.

Estado de Alerta:

Gatilhos para Alerta: Ver um jogador no cone de visão, receber dano, ou se o Ruído Global ultrapassar o limite do seu "raio de audição".

Zumbis em alerta ativam o Pathfinding e perseguem a fonte do distúrbio.

Mecânica de Ruído e Spawn:

Tiros sem supressor (+15 Ruído) alertam todos os zumbis num raio de 30m (20 células).

Se o Ruído Global atingir 50, a horda percebe a movimentação: começam a spawnar +3 zumbis por turno nas bordas do mapa atrás dos jogadores (forçando-os a não recuar).

4. Objetivos Dinâmicos
Condição de Vitória: Pelo menos 1 Operador chega vivo a qualquer célula dentro da Zona de Extração (Ponto Z). A vitória é computada no exato momento em que a célula é pisada (não requer fim de turno).

Condição de Derrota: Toda a Equipe A eliminada.

5. Interatividade do Cenário e Eventos Especiais
Armadilhas Sonoras (Carros com Alarme):

Há 4 carros abandonados posicionados estrategicamente na Via Principal e nas entradas dos Becos. Eles funcionam como Cobertura Total.

Se um tiro (erro ou acerto) passar pela célula do carro, ou se um jogador tentar pular sobre ele, o alarme dispara.

Efeito do Alarme: Gera +40 de Ruído instantâneo na célula do carro. Todos os zumbis no mapa entram em Estado de Alerta e convergem para aquela coordenada específica.

Ponto de Gargalo (Turno 5):

Um pequeno desmoronamento ocorre em um dos becos aleatórios, fechando a passagem e forçando quem estiver lá a voltar e cruzar a Via Principal para acessar o outro lado.

💻 Estrutura de Dados (Lógica de Motor e IA)
Para integrar essa lógica no seu sistema, o foco deve ser no gerador de campo de visão (Raycasting do WebGL/Canvas) e nos estados da IA.



---- Para referência ----
JavaScript
// Constantes Táticas
const TACTICAL_CONSTANTS = {
    CELL_SIZE_PX: 50,
    BASE_MOVEMENT_CELLS: 7, // 10.5m
    COVER: { HALF: -0.20, FULL: -0.40 }
};

// Definição da Entidade Zumbi
class ZombieAI {
    constructor(x, y) {
        this.position = { x, y };
        this.state = 'DORMANT'; // Estados: DORMANT, ALERT, INVESTIGATING
        this.visionRange = 10; // Em células (15m)
        this.facingDirection = { x: 0, y: -1 }; // Vetor de direção da visão
    }

    // Chamado no início do turno da IA ou durante ação do jogador (evento de som/visão)
    checkTriggers(playerPositions, noiseEvents) {
        // 1. Checagem de Visão (Requer Raycasting na sua engine Canvas para LoS)
        if (this.state === 'DORMANT') {
            for (let player of playerPositions) {
                if (this.hasLineOfSight(player) && this.isInVisionCone(player)) {
                    this.state = 'ALERT';
                    this.target = player.position;
                    break;
                }
            }
        }

        // 2. Checagem de Audição
        for (let event of noiseEvents) {
            let distance = calculateDistance(this.position, event.position);
            if (distance <= event.radius) {
                this.state = 'INVESTIGATING';
                this.target = event.position; // Zumbi vai para onde ouviu o barulho
            }
        }
    }
}

// Interatividade do Cenário: Carro com Alarme
const ENVIRONMENT_ENTITIES = [
    {
        type: 'CAR_WITH_ALARM',
        position: { x: 20, y: 40 },
        coverValue: TACTICAL_CONSTANTS.COVER.FULL,
        isTriggered: false,
        onHit: function(globalNoiseSystem) {
            if (!this.isTriggered) {
                this.isTriggered = true;
                globalNoiseSystem.createNoiseEvent({
                    position: this.position,
                    radius: 50, // Células de alcance do som
                    value: 40
                });
                console.log("ALARM TRIGGERED! Horde converging at", this.position);
            }
        }
    }
];

// Lógica de Fim de Movimento do Jogador
function onPlayerMoveEnd(player) {
    // Checagem de Vitória Imediata
    const EXFIL_ZONE = { minX: 15, maxX: 25, minY: 0, maxY: 10 };
    if (player.position.x >= EXFIL_ZONE.minX && player.position.x <= EXFIL_ZONE.maxX &&
        player.position.y >= EXFIL_ZONE.minY && player.position.y <= EXFIL_ZONE.maxY) {
        triggerMissionWin();
    }
}