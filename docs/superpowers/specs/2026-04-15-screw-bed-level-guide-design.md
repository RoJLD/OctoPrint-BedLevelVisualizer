# Screw Bed Level Guide — Design Spec

**Date:** 2026-04-15
**Plugin:** OctoPrint-BedLevelVisualizer
**Statut:** Approuvé, prêt pour implémentation

---

## Contexte et problème

Le plugin OctoPrint-BedLevelVisualizer affiche un mesh 3D du plateau. La fonctionnalité `show_prusa_adjustments` est hardcodée pour les imprimantes Prusa (mesh 5×5 = 25 points) et ne convient pas aux plateaux avec vis configurables à des coordonnées arbitraires.

L'utilisateur dispose de 4 vis de réglage aux coordonnées précises et a besoin d'un guide simplifié indiquant combien de tours tourner chaque vis pour amener le plateau à Z=0.

---

## Objectif

Ajouter un **guide d'ajustement des vis** firmware-agnostique qui :
1. Permet de configurer N vis (label + coordonnées x/y) dans les Settings
2. Interpole la valeur Z du mesh aux coordonnées de chaque vis
3. Affiche le nombre de tours et le sens (↺/↻) pour ramener chaque vis à Z=0
4. S'affiche sur l'onglet principal sous le graphe 3D (activable/désactivable)

---

## Architecture

### Principe clé

**Zéro modification du backend Python de collecte du mesh.** Tout le calcul se fait en JavaScript dans le ViewModel Knockout, en exploitant le mesh déjà stocké (`stored_mesh`, `stored_mesh_x`, `stored_mesh_y`).

### Fichiers modifiés

| Fichier | Modification |
|---|---|
| `octoprint_bedlevelvisualizer/__init__.py` | Ajout de 2 nouveaux defaults dans `get_settings_defaults()` |
| `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js` | Nouveaux observables + computed `screw_corrections` + interpolation bilinéaire |
| `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2` | Bloc de configuration des vis dans l'onglet "Corrections" |
| `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2` | Section guide des vis sous le graphe |

---

## Section 1 — Modèle de données

### Nouveaux settings Python (`get_settings_defaults`)

```python
screws_bed_level_guide: False,   # bool — active l'affichage du guide
bed_level_screws: [],            # list — vis configurées
```

### Structure d'une vis dans `bed_level_screws`

```json
{
  "label": "FL",
  "x": 30,
  "y": 30
}
```

### Settings réutilisés (non modifiés)

- `screw_hub` (float) — pitch de la vis en mm/tour (ex: 0.7 pour M4)
- `reverse` (bool) — sens de vissage (horaire/antihoraire pour serrer)

---

## Section 2 — Calcul JavaScript

### Nouveaux observables KnockoutJS

```javascript
self.screws_bed_level_guide = ko.observable();
self.bed_level_screws = ko.observableArray([]);
```

Chargés dans `onBeforeBinding` depuis `settingsViewModel.settings.plugins.bedlevelvisualizer.*`.
Sauvegardés dans `onSettingsBeforeSave`.

### Computed : `screw_corrections`

```javascript
self.screw_corrections = ko.computed(function() {
    // Dépend de : mesh_data(), mesh_data_x(), mesh_data_y(), bed_level_screws(), screw_hub(), reverse()
    // Pour chaque vis :
    //   1. Interpolation bilinéaire de Z aux coordonnées (x, y)
    //   2. turns = Z_interpolé / screw_hub()
    //   3. Retourne { label, x, y, z, turns, direction, outOfBounds }
});
```

### Interpolation bilinéaire

Fonction `bilinearInterpolate(x, y, xs, ys, zs)` :

1. Trouver les indices `i0`, `i1` dans `mesh_data_x` tels que `xs[i0] <= x <= xs[i1]`
2. Trouver les indices `j0`, `j1` dans `mesh_data_y` tels que `ys[j0] <= y <= ys[j1]`
3. Si `x` ou `y` est hors bounds → retourner `{ outOfBounds: true }`
4. Calculer les 4 valeurs Z aux coins : `z00, z01, z10, z11`
5. Interpoler : `Z = (1-tx)*(1-ty)*z00 + tx*(1-ty)*z10 + (1-tx)*ty*z01 + tx*ty*z11`
   - `tx = (x - xs[i0]) / (xs[i1] - xs[i0])`
   - `ty = (y - ys[j0]) / (ys[j1] - ys[j0])`

### Seuil "OK"

Si `|turns| < 0.05` → considéré comme OK (afficher `✓` au lieu de ↺/↻).

Correspond à `|Z| < 0.05 * screw_hub` (ex: < 0.035mm pour M4).

### Direction

- `Z > 0` → plateau trop haut à cet endroit → **serrer** (↻ / clockwise)
- `Z < 0` → plateau trop bas → **desserrer** (↺ / counter-clockwise)
- Si `reverse = true` → inverser le sens affiché

---

## Section 3 — Interface utilisateur

### Settings → onglet "Corrections" (ajout en bas du tab existant)

Nouveau bloc sous les contrôles existants :

```
[ ☑ ] Activer guide d'ajustement des vis

Vis configurées                          [ + Ajouter ]
┌─────────────────────────────────────────────────────┐
│ [FL ] x: [ 30 ] y: [ 30 ]                    [ ✕ ] │
│ [FR ] x: [280 ] y: [ 30 ]                    [ ✕ ] │
│ [BR ] x: [280 ] y: [290 ]                    [ ✕ ] │
│ [BL ] x: [ 30 ] y: [290 ]                    [ ✕ ] │
└─────────────────────────────────────────────────────┘
Le pitch (mm/tour) est partagé avec "Adjustment Screw Details" ci-dessus.
```

Implémentation KO : `ko.observableArray` avec push/remove, même pattern que `commands`.

### Onglet principal — Guide des vis (sous le graphe 3D)

Visible seulement si `screws_bed_level_guide() && mesh_data().length > 0`.

Grille 2×N cartes (2 colonnes) :

```
┌──────────────────┐  ┌──────────────────┐
│ FL (x=30, y=30)  │  │ FR (x=280, y=30) │
│   ↺ 0.75 tours   │  │   ↻ 0.36 tours   │
│   Desserrer      │  │   Serrer         │
│   Z = +0.525mm   │  │   Z = -0.252mm   │
└──────────────────┘  └──────────────────┘
┌──────────────────┐  ┌──────────────────┐
│ BL (x=30, y=290) │  │ BR (x=280,y=290) │
│      ✓ OK        │  │   ↻ 0.50 tours   │
│   Z = +0.021mm   │  │   Serrer         │
│                  │  │   Z = -0.350mm   │
└──────────────────┘  └──────────────────┘
```

Couleurs :
- Desserrer → orange (`#f90`)
- Serrer → bleu (`#4af`)
- OK → vert (`#4c4`)
- Hors zone mesh → jaune warning (`⚠ hors zone`)

---

## Gestion d'erreurs

| Cas | Comportement |
|---|---|
| Vis hors bounds du mesh | Badge "⚠ hors zone" à la place des tours |
| Pas de mesh chargé | Section entière masquée (`ko if`) |
| `screw_hub = 0` | Division par zéro évitée — afficher "⚠ pitch = 0" |
| `mesh_data_x` ou `mesh_data_y` vides | Section masquée |

---

## Ce qui N'est PAS dans ce scope

- Modification de `process_gcode()` — non nécessaire
- Support de la commande Klipper `SCREWS_TILT_CALCULATE` — scope futur éventuel
- Sauvegarde automatique des positions de vis via YAML direct — l'UI Settings OctoPrint suffit
- Affichage des vis sur le graphe 3D Plotly — scope futur éventuel

---

## Vis par défaut (configuration utilisateur)

```
FL: x=30,  y=30   (Avant Gauche)
FR: x=280, y=30   (Avant Droite)
BR: x=280, y=290  (Arrière Droite)
BL: x=30,  y=290  (Arrière Gauche)
Pitch: M4 — screw_hub = 0.7mm/tour
```
