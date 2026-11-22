/**
 * Les 193 États membres de l'ONU : code ISO 3166-1 numérique (identifiant des
 * pays sur la carte) et nom usuel en français.
 */
export interface UnMember {
  /** Code ISO 3166-1 numérique, sur trois chiffres (ex. « 250 » pour la France). */
  id: string;
  name: string;
}

const RAW = `004 Afghanistan
710 Afrique du Sud
008 Albanie
012 Algérie
276 Allemagne
020 Andorre
024 Angola
028 Antigua-et-Barbuda
682 Arabie saoudite
032 Argentine
051 Arménie
036 Australie
040 Autriche
031 Azerbaïdjan
044 Bahamas
048 Bahreïn
050 Bangladesh
052 Barbade
056 Belgique
084 Belize
204 Bénin
064 Bhoutan
112 Biélorussie
104 Birmanie
068 Bolivie
070 Bosnie-Herzégovine
072 Botswana
076 Brésil
096 Brunei
100 Bulgarie
854 Burkina Faso
108 Burundi
116 Cambodge
120 Cameroun
124 Canada
132 Cap-Vert
140 Centrafrique
152 Chili
156 Chine
196 Chypre
170 Colombie
174 Comores
178 Congo
180 République démocratique du Congo
408 Corée du Nord
410 Corée du Sud
188 Costa Rica
384 Côte d'Ivoire
191 Croatie
192 Cuba
208 Danemark
262 Djibouti
214 République dominicaine
212 Dominique
818 Égypte
784 Émirats arabes unis
218 Équateur
232 Érythrée
724 Espagne
233 Estonie
748 Eswatini
840 États-Unis
231 Éthiopie
242 Fidji
246 Finlande
250 France
266 Gabon
270 Gambie
268 Géorgie
288 Ghana
300 Grèce
308 Grenade
320 Guatemala
324 Guinée
624 Guinée-Bissau
226 Guinée équatoriale
328 Guyana
332 Haïti
340 Honduras
348 Hongrie
356 Inde
360 Indonésie
368 Irak
364 Iran
372 Irlande
352 Islande
376 Israël
380 Italie
388 Jamaïque
392 Japon
400 Jordanie
398 Kazakhstan
404 Kenya
417 Kirghizistan
296 Kiribati
414 Koweït
418 Laos
426 Lesotho
428 Lettonie
422 Liban
430 Liberia
434 Libye
438 Liechtenstein
440 Lituanie
442 Luxembourg
807 Macédoine du Nord
450 Madagascar
458 Malaisie
454 Malawi
462 Maldives
466 Mali
470 Malte
504 Maroc
584 Îles Marshall
480 Maurice
478 Mauritanie
484 Mexique
583 Micronésie
498 Moldavie
492 Monaco
496 Mongolie
499 Monténégro
508 Mozambique
516 Namibie
520 Nauru
524 Népal
558 Nicaragua
562 Niger
566 Nigeria
578 Norvège
554 Nouvelle-Zélande
512 Oman
800 Ouganda
860 Ouzbékistan
586 Pakistan
585 Palaos
591 Panama
598 Papouasie-Nouvelle-Guinée
600 Paraguay
528 Pays-Bas
604 Pérou
608 Philippines
616 Pologne
620 Portugal
634 Qatar
642 Roumanie
826 Royaume-Uni
643 Russie
646 Rwanda
659 Saint-Christophe-et-Niévès
674 Saint-Marin
670 Saint-Vincent-et-les-Grenadines
662 Sainte-Lucie
090 Îles Salomon
222 Salvador
882 Samoa
678 Sao Tomé-et-Principe
686 Sénégal
688 Serbie
690 Seychelles
694 Sierra Leone
702 Singapour
703 Slovaquie
705 Slovénie
706 Somalie
729 Soudan
728 Soudan du Sud
144 Sri Lanka
752 Suède
756 Suisse
740 Suriname
760 Syrie
762 Tadjikistan
834 Tanzanie
148 Tchad
203 Tchéquie
764 Thaïlande
626 Timor oriental
768 Togo
776 Tonga
780 Trinité-et-Tobago
788 Tunisie
795 Turkménistan
792 Turquie
798 Tuvalu
804 Ukraine
858 Uruguay
548 Vanuatu
862 Venezuela
704 Viêt Nam
887 Yémen
894 Zambie
716 Zimbabwe`;

export const UN_MEMBERS: readonly UnMember[] = RAW.split("\n").map((line) => ({
  id: line.slice(0, 3),
  name: line.slice(4),
}));
