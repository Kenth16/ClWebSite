# Demandes en attente

Demandes mises de côté pour plus tard. Rien n'est encore développé.

## Kenpai (ce dépôt)

### Page Amis : design de référence

Annexes :

- [`amis-grille-cartes.png`](backlog/annexes/amis-grille-cartes.png) : liste des amis en **grille
  de cartes**. Chaque carte affiche un avatar rond centré, le nom et une sous-ligne, avec une rangée
  d'actions en bas. L'en-tête montre le titre « Amis », un **compteur** (badge) et un **champ de
  recherche** à droite.
- [`amis-chargement-skeleton.png`](backlog/annexes/amis-chargement-skeleton.png) : **état de
  chargement** (skeleton) avec un cercle pour l'avatar et deux barres pour le texte.

À adapter au style Kenpai (thèmes Parchemin / Nuit étoilée, ornements dorés). Rappel du cahier des
charges :

- rechercher un utilisateur ;
- envoyer, accepter ou refuser une demande ;
- supprimer un ami ;
- consulter le profil d'un ami ;
- voir les demandes en attente ;
- pastille de présence verte (en ligne) ou grise (hors ligne), mise à jour en direct.

### Connexion et inscription : mise en page en deux colonnes

Annexes :

- [`connexion-deux-colonnes.png`](backlog/annexes/connexion-deux-colonnes.png)
- [`inscription-deux-colonnes.png`](backlog/annexes/inscription-deux-colonnes.png)

Mise en page souhaitée :

- une carte large en deux colonnes : le formulaire à gauche, un **panneau illustration** à droite
  (masqué sur mobile) ;
- dans le formulaire d'inscription, mot de passe et confirmation **côte à côte** ;
- un séparateur « Ou continuer avec » suivi des boutons de connexion externes. Pour Kenpai, ce sera
  **Discord** uniquement, à afficher seulement quand la connexion Discord sera réellement en place ;
- le lien « Mot de passe oublié ? » à côté du libellé du mot de passe, à afficher seulement quand
  la fonctionnalité existera ;
- une mention CGU / politique de confidentialité sous la carte, si ces pages sont rédigées.

L'illustration à droite est à créer dans l'ambiance médiévale fantasy du site.

### Géographie : carte interactive du monde

- Une carte interactive de la Terre avec tous les pays reconnus par l'ONU.
- Un encadré annonce un pays : le joueur clique sur le bon pays de la carte pour marquer le point.

## Autre projet (optimiseur de stuff Dofus, page « avis désastreux »)

Ces points ne concernent pas le code de Kenpai. Il faudra le dépôt du projet concerné.

### Optimiseur : expliquer ce que fait le bouton « Générer »

- Montrer au joueur les sorts choisis, puis une flèche vers le **barème unique** obtenu en les
  additionnant. Exemple : « 83 dégâts, 5 lignes de dégâts dans tel et tel élément ».
- Expliquer ensuite le calcul avec des **schémas en temps semi-réel**.
- Double objectif : aider le joueur à comprendre, et permettre au développeur de vérifier le calcul
  et de corriger les erreurs.

### Optimiseur : classement des tours

- Classer les **4 meilleurs tours** selon la classe et le stuff.
- Distinguer **T1, T2, T3, T4**, car certains sorts se cumulent sur plusieurs tours. Une autre
  option : une rubrique **tours pairs / impairs**.
- Si un sort se cumule, pouvoir **forcer le cumul** pour tester les dégâts cumulés.

### Optimiseur : effets passifs des Dofus et des objets légendaires

Ils sont à traiter **tous**. Exemples :

- **Dofus Nébuleux** : +20 % de dommages les tours impairs, −10 % les tours pairs. La description
  est à corriger en :
  - `+20% Dommage (Impair)`
  - `-10% Dommage (Pair)`
- **Dofus Ocre** : +1 PA si le joueur n'a pas été touché au tour précédent. Ce bonus peut dépasser
  la limite de +12 PA. Il pourrait aussi s'agir de +20 tacle : **à vérifier**. Dans tous les cas, un
  des deux bonus s'applique.
- Beaucoup d'autres Dofus fonctionnent de cette façon, ainsi que tous les objets légendaires.

### Page « avis désastreux »

- Le barème de notation n'est plus affiché en permanence sur la page.
- Pendant la notation uniquement, un bouton **« Barème »** ouvre le barème dans une fenêtre (popup).
