# Architecture de Kenpai

## Vue d'ensemble

```
Navigateur ──► (Caddy en production / rewrites Next en dev) ──┬─► web  (Next.js)   pages, UI
                                                              └─► /api (Fastify)   données, auth, temps réel
                                                                        │
                                                                        ▼
                                                                   PostgreSQL
```

- **Même origine** pour le site et l'API : cookies de session `httpOnly` + `SameSite`,
  pas de CORS complexe, WebSockets sous `/api`.
- **Séparation stricte** : le frontend ne parle jamais à la base, uniquement à l'API.
- **Validation** : toute entrée est validée côté serveur par un schéma Zod (`packages/shared`).
- **SQL** : uniquement via Drizzle ORM (requêtes paramétrées).
- **Configuration** : variables d'environnement validées au démarrage de l'API (`apps/api/src/env.ts`).
  Les secrets ne sont jamais commités (`.env` ignoré, `.env.example` documenté).

## Frontend (`apps/web`)

| Dossier                   | Contenu                                                      |
| ------------------------- | ------------------------------------------------------------ |
| `src/app/(app)`           | Pages avec barre latérale (accueil, rubriques, amis, profil) |
| `src/app/(auth)`          | Écrans de connexion / inscription, sans barre latérale       |
| `src/app/(app)/[...path]` | Page générique d'une rubrique du catalogue                   |
| `src/components/ui`       | Primitives (bouton, menu, infobulle, panneau…) sur Radix UI  |
| `src/components/layout`   | Barre latérale, en-tête, fil d'Ariane, thème                 |
| `src/components/page`     | Briques de page (en-tête, cartes, états vides)               |

Quand une activité est développée, on crée sa route dédiée (ex. `src/app/(app)/calcul-mental/page.tsx`),
qui prend automatiquement le pas sur la page générique du catalogue.

### Système de design

Jetons de couleur dans `src/app/globals.css` (thèmes **Parchemin** et **Nuit étoilée**).
Une seule couleur d'accent (vert sauge, `primary`) pour les interactions ; l'or (`gold`) est réservé
aux ornements. Typographies : Alegreya (titres), Alegreya Sans (texte), Cinzel (marque).
Aucune couleur codée en dur dans les composants.

### Accessibilité

Lien d'évitement « Aller au contenu », navigation complète au clavier, `aria-current` sur la page
active, infobulles en mode replié, raccourci Ctrl/⌘+B, respect de `prefers-reduced-motion`.

## Contenu (`packages/content`)

`catalog.ts` décrit toutes les rubriques (titre, description, icône, sous-rubriques). C'est la source
unique pour la barre latérale, l'accueil, le fil d'Ariane et les pages de rubrique.
Ajouter une période historique = ajouter une entrée.

## Base de données (prévisionnel)

| Table               | Étape | Rôle                                                      |
| ------------------- | ----- | --------------------------------------------------------- |
| `users`             | 2     | Compte (pseudo unique, e-mail, avatar)                    |
| `accounts`          | 2     | Méthodes de connexion (mot de passe haché, Discord)       |
| `sessions`          | 2     | Sessions actives                                          |
| `verifications`     | 2     | Jetons de réinitialisation du mot de passe                |
| `friendships`       | 3     | Demandes et relations d'amitié                            |
| `activity_attempts` | 4     | Résultats des quiz, jeux, dictées (statistiques, accueil) |

## Feuille de route

0. ✅ Socle : monorepo, outillage, PostgreSQL, API, CI
1. ✅ Design et navigation
2. ✅ Comptes : inscription, connexion, déconnexion, profil modifiable (pseudo, avatar)
   — à venir : connexion Discord, mot de passe oublié
3. Profil (structure) et amis, présence en temps réel
4. Moteur de quiz générique et suivi des activités
5. Géographie
6. Calcul mental
7. Français (dictées, jeux)
8. Histoire
9. Accueil dynamique (activités populaires, dernières activités)
10. Finitions : accessibilité, sécurité, performances, déploiement
