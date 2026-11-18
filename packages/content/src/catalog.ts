/**
 * Catalogue des rubriques éducatives.
 *
 * C'est la source unique utilisée par la barre latérale, la page d'accueil,
 * le fil d'Ariane et les pages de rubrique. Pour ajouter une rubrique ou une
 * sous-rubrique (ex. une nouvelle période historique), il suffit d'ajouter
 * une entrée ici.
 */

/** Clés d'icônes : le frontend les associe à ses propres composants d'icône. */
export type IconKey =
  | "home"
  | "geography"
  | "countries"
  | "capitals"
  | "flags"
  | "departments"
  | "history"
  | "france"
  | "greece"
  | "egypt"
  | "rome"
  | "medieval"
  | "french"
  | "dictation"
  | "games"
  | "math"
  | "quiz"
  | "general"
  | "friends"
  | "reviews"
  | "dofus"
  | "equipment"
  | "profile";

/**
 * - `available` : l'activité est jouable.
 * - `in-progress` : la rubrique existe mais son contenu est en préparation.
 */
export type EntryStatus = "available" | "in-progress";

export interface CatalogEntry {
  /** Segment d'URL, unique parmi ses voisins. */
  slug: string;
  title: string;
  /** Une phrase courte présentant l'activité. */
  description: string;
  icon: IconKey;
  status: EntryStatus;
  children?: CatalogEntry[];
}

const historyOfFrance: CatalogEntry[] = [
  [
    "prehistoire-antiquite",
    "Préhistoire et Antiquité en Gaule",
    "Des premiers hommes aux Gaulois et à la Gaule romaine.",
  ],
  ["moyen-age", "Moyen Âge", "Mérovingiens, Carolingiens, Capétiens, châteaux et cathédrales."],
  ["renaissance", "Renaissance", "Guerres d'Italie, humanisme, arts et guerres de Religion."],
  [
    "monarchie-absolue",
    "Monarchie absolue",
    "De Henri IV à Louis XIV : l'apogée du pouvoir royal.",
  ],
  [
    "revolution-francaise",
    "Révolution française",
    "De 1789 au Directoire : la fin de l'Ancien Régime.",
  ],
  ["premier-empire", "Premier Empire", "Napoléon Ier, ses conquêtes et ses réformes."],
  ["xixe-siecle", "XIXe siècle", "Restaurations, révolutions, Second Empire et IIIe République."],
  [
    "premiere-guerre-mondiale",
    "Première Guerre mondiale",
    "1914-1918 : tranchées, batailles et sortie de guerre.",
  ],
  [
    "seconde-guerre-mondiale",
    "Seconde Guerre mondiale",
    "1939-1945 : défaite, Occupation, Résistance et Libération.",
  ],
  ["france-contemporaine", "France contemporaine", "De la IVe République à nos jours."],
].map(([slug, title, description]) => ({
  slug: slug!,
  title: title!,
  description: description!,
  icon: "france" as const,
  status: "in-progress" as const,
}));

export const catalog: CatalogEntry[] = [
  {
    slug: "geographie",
    title: "Géographie",
    description: "Pays, capitales, drapeaux et départements : parcourez la carte du monde.",
    icon: "geography",
    status: "in-progress",
    children: [
      {
        slug: "pays",
        title: "Pays du monde",
        description: "Situer et reconnaître les pays de chaque continent.",
        icon: "countries",
        status: "in-progress",
      },
      {
        slug: "capitales",
        title: "Capitales du monde",
        description: "Associer chaque pays à sa capitale.",
        icon: "capitals",
        status: "in-progress",
      },
      {
        slug: "drapeaux",
        title: "Drapeaux du monde",
        description: "Reconnaître les drapeaux au premier coup d'œil.",
        icon: "flags",
        status: "in-progress",
      },
      {
        slug: "departements",
        title: "Départements français",
        description: "Numéros, noms et chefs-lieux des départements.",
        icon: "departments",
        status: "in-progress",
      },
    ],
  },
  {
    slug: "histoire",
    title: "Histoire",
    description: "Cours, fiches, dates et grands personnages, de l'Antiquité à nos jours.",
    icon: "history",
    status: "in-progress",
    children: [
      {
        slug: "france",
        title: "Histoire de France",
        description: "Dix grandes périodes, de la Gaule à la France contemporaine.",
        icon: "france",
        status: "in-progress",
        children: historyOfFrance,
      },
      {
        slug: "grece-antique",
        title: "Grèce antique",
        description: "Cités, démocratie athénienne, mythes et philosophes.",
        icon: "greece",
        status: "in-progress",
      },
      {
        slug: "egypte-antique",
        title: "Égypte antique",
        description: "Pharaons, pyramides et vie au bord du Nil.",
        icon: "egypt",
        status: "in-progress",
      },
      {
        slug: "rome-antique",
        title: "Rome antique",
        description: "De la fondation de Rome à la chute de l'Empire.",
        icon: "rome",
        status: "in-progress",
      },
      {
        slug: "civilisations-medievales",
        title: "Civilisations médiévales",
        description: "Byzance, monde arabe, royaumes d'Europe et d'ailleurs.",
        icon: "medieval",
        status: "in-progress",
      },
    ],
  },
  {
    slug: "francais",
    title: "Français",
    description: "Dictées et jeux pour progresser en orthographe, grammaire et vocabulaire.",
    icon: "french",
    status: "in-progress",
    children: [
      {
        slug: "dictees",
        title: "Dictées",
        description: "Des dictées de tous niveaux, corrigées et expliquées.",
        icon: "dictation",
        status: "in-progress",
      },
      {
        slug: "jeux",
        title: "Jeux de langue",
        description: "Conjugaison, accords, homophones, synonymes et plus encore.",
        icon: "games",
        status: "in-progress",
      },
    ],
  },
  {
    slug: "calcul-mental",
    title: "Calcul mental",
    description: "Résolvez les opérations avant qu'elles ne touchent le sol.",
    icon: "math",
    status: "available",
  },
  {
    slug: "quiz",
    title: "Tests de connaissances",
    description: "Mettez votre savoir à l'épreuve dans chaque discipline.",
    icon: "quiz",
    status: "in-progress",
    children: [
      {
        slug: "geographie",
        title: "Quiz de géographie",
        description: "Pays, capitales, drapeaux et départements.",
        icon: "geography",
        status: "in-progress",
      },
      {
        slug: "histoire",
        title: "Quiz d'histoire",
        description: "Dates, personnages et événements majeurs.",
        icon: "history",
        status: "in-progress",
      },
      {
        slug: "francais",
        title: "Quiz de français",
        description: "Orthographe, grammaire et conjugaison.",
        icon: "french",
        status: "in-progress",
      },
      {
        slug: "calcul-mental",
        title: "Quiz de calcul",
        description: "Opérations à résoudre sans limite de chute.",
        icon: "math",
        status: "in-progress",
      },
      {
        slug: "general",
        title: "Quiz général",
        description: "Un mélange de toutes les disciplines.",
        icon: "general",
        status: "in-progress",
      },
    ],
  },
  {
    slug: "dofus",
    title: "Dofus",
    description: "Outils pour préparer vos personnages Dofus.",
    icon: "dofus",
    status: "available",
    children: [
      {
        slug: "simulateur",
        title: "Simulateur de stuff",
        description: "Composez un équipement et calculez les caractéristiques du personnage.",
        icon: "equipment",
        status: "available",
      },
    ],
  },
];

export interface ResolvedEntry {
  entry: CatalogEntry;
  /** Chaîne des entrées depuis la racine (incluse) jusqu'à l'entrée (incluse). */
  trail: CatalogEntry[];
  href: string;
}

/** Retrouve une entrée à partir de ses segments d'URL, ou `null` si inconnue. */
export function resolveEntry(segments: readonly string[]): ResolvedEntry | null {
  let level: CatalogEntry[] | undefined = catalog;
  const trail: CatalogEntry[] = [];
  for (const segment of segments) {
    const found: CatalogEntry | undefined = level?.find((e) => e.slug === segment);
    if (!found) return null;
    trail.push(found);
    level = found.children;
  }
  const entry = trail.at(-1);
  if (!entry) return null;
  return { entry, trail, href: "/" + segments.join("/") };
}

/** Liste tous les chemins du catalogue (utile pour la génération statique). */
export function allEntryPaths(): string[][] {
  const paths: string[][] = [];
  const walk = (entries: CatalogEntry[], prefix: string[]) => {
    for (const e of entries) {
      const path = [...prefix, e.slug];
      paths.push(path);
      if (e.children) walk(e.children, path);
    }
  };
  walk(catalog, []);
  return paths;
}
