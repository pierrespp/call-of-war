import { TileSet } from '../../types/tileset';

export const NATURE_TILESET_DATA: TileSet = {
  id: "nature_jungle",
  name: "Selva Tropical & Rios",
  description: "Tilesets modulares para densa vegetação tropical, rios navegáveis, vaus de travessia, pontes e rochedos.",
  tiles: [
    {
      id: "dirt_trail",
      name: "Trilha de Terra",
      category: "floor",
      imagePath: "/tiles/nature/dirt_trail.svg",
      coverType: "none",
      description: "Trilha de terra batida na floresta. Movimento padrão livre."
    },
    {
      id: "dense_foliage",
      name: "Folhagem Densa",
      category: "cover",
      imagePath: "/tiles/nature/dense_foliage.svg",
      coverType: "half",
      rotatable: true,
      description: "Moita / arbustos tropicais espessos. Meia Cobertura (-20% de hit)."
    },
    {
      id: "river_water",
      name: "Água do Rio (Profunda)",
      category: "liquid",
      imagePath: "/tiles/nature/river_water.svg",
      coverType: "water",
      description: "Leito do rio com correnteza. Cada célula custa o dobro de movimento (3m em vez de 1.5m)."
    },
    {
      id: "shallow_water",
      name: "Vau de Travessia (Raso)",
      category: "liquid",
      imagePath: "/tiles/nature/shallow_water.svg",
      coverType: "water",
      description: "Água rasa com pedras emergentes para travessia tática a pé."
    },
    {
      id: "wooden_bridge",
      name: "Ponte de Madeira",
      category: "floor",
      imagePath: "/tiles/nature/wooden_bridge.svg",
      coverType: "none",
      rotatable: true,
      description: "Ponte rústica de tábuas de madeira sobre a água. Travessia rápida sem penalidade de movimento."
    },
    {
      id: "rock_boulder",
      name: "Rochedo Vulcânico",
      category: "cover",
      imagePath: "/tiles/nature/rock_boulder.svg",
      coverType: "full",
      rotatable: true,
      description: "Bloco de rocha maciça. Cobertura Total (-40% de hit)."
    },
    {
      id: "fallen_tree",
      name: "Tronco Caído",
      category: "cover",
      imagePath: "/tiles/nature/fallen_tree.svg",
      coverType: "half",
      rotatable: true,
      description: "Árvore centenária caída transversalmente. Meia Cobertura (-20% de hit)."
    },
    {
      id: "jungle_thick",
      name: "Mata Impenetrável",
      category: "wall",
      imagePath: "/tiles/nature/jungle_thick.svg",
      coverType: "wall",
      rotatable: true,
      description: "Bosque denso de copas fechadas. Bloqueia linha de visão e tiros."
    }
  ]
};
