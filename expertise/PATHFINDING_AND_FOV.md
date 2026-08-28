# Movimentação, FOV e Pathfinding (PATHFINDING_AND_FOV)

## Princípios Core
1. **Malha do Tabuleiro**: O grid base assumido é 40x40. Entidades como paredes ou coberturas devem estar quantizadas/alinhadas ao grid para o algoritmo A* funcionar perfeitamente.
2. **Raycasting / FOV**: Cálculos de linha de visão podem ser pesados O(n²). Maximize a eficiência cortando early returns caso fique fora do `maxRange` da arma/visão.
3. **Custo de Movimento (AP)**: Água e terrenos difíceis multiplicam o custo de AP. Isso deve estar rigidamente exposto em `/src/utils/pathfinding.ts`.

## Checklist Antes de Alterar
- [ ] O algoritmo A* está gerando "zig-zags" desnecessários? Checar os pesos das diagonais.
- [ ] A linha de visão (`lineOfSight.ts`) ignora perfeitamente meias-coberturas nos grids adyacentes para permitir que unidades atirem "por cima"? 
- [ ] Modificações no `MapCoverData` estão refletindo corretamente no render do FOV?
