import { TileSet } from '../../types/tileset';

export const CAMP_TILESET_DATA: TileSet = {
  id: "military_camp",
  name: "Acampamento & Base Militar",
  description: "Tilesets modulares para postos avançados florestais, tendas de comando, paliçadas defensivas, bunkers e depósitos.",
  tiles: [
    {
      id: "military_tent",
      name: "Tenda Militar de Comando",
      category: "wall",
      imagePath: "/tiles/camp/military_tent.svg",
      coverType: "wall",
      rotatable: true,
      description: "Barraca militar de lona camuflada. Bloqueia linha de visão e tiros."
    },
    {
      id: "wooden_palisade",
      name: "Paliçada Defensiva",
      category: "wall",
      imagePath: "/tiles/camp/wooden_palisade.svg",
      coverType: "wall",
      rotatable: true,
      description: "Cerca de troncos pontiagudos com arame farpado. Bloqueia movimento e disparos diretos."
    },
    {
      id: "sandbag_bunker",
      name: "Bunker de Sacos de Areia",
      category: "cover",
      imagePath: "/tiles/camp/sandbag_bunker.svg",
      coverType: "full",
      rotatable: true,
      description: "Posição fortificada de tiro com proteção perimetral. Cobertura Total (-40% de hit)."
    },
    {
      id: "campfire_site",
      name: "Fogueira de Acampamento",
      category: "cover",
      imagePath: "/tiles/camp/campfire_site.svg",
      coverType: "half",
      description: "Fogueira circular com pedras e brasas ardentes. Meia Cobertura (-20% de hit)."
    },
    {
      id: "supply_cache",
      name: "Engradados de Suprimentos",
      category: "cover",
      imagePath: "/tiles/camp/supply_cache.svg",
      coverType: "half",
      rotatable: true,
      description: "Pilha de caixas militares e galão de combustível. Meia Cobertura (-20% de hit)."
    },
    {
      id: "watchtower_base",
      name: "Torre de Vigia",
      category: "cover",
      imagePath: "/tiles/camp/watchtower_base.svg",
      coverType: "full",
      rotatable: true,
      description: "Base fortificada com 4 pilares de madeira maciça e escotilha de vigia. Cobertura Total (-40% de hit)."
    }
  ]
};
