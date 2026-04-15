# Screw Bed Level Guide — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un guide d'ajustement des vis de plateau configurable qui interpole le mesh Z à chaque position de vis et affiche le nombre de tours (↺/↻) pour ramener chaque vis à Z=0.

**Architecture:** Zéro modification du backend de collecte mesh. 2 nouveaux settings Python. Côté JS : un observable `screws_bed_level_guide`, une fonction `bilinearInterpolate`, un computed `screw_corrections`. UI Settings pour configurer les vis, section affichée sous le graphe sur l'onglet principal.

**Tech Stack:** Python (OctoPrint SettingsPlugin), JavaScript (KnockoutJS), Jinja2

---

## Fichiers modifiés

| Fichier | Rôle |
|---|---|
| `octoprint_bedlevelvisualizer/__init__.py` | +2 defaults dans `get_settings_defaults()` |
| `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js` | +observable, +`bilinearInterpolate`, +`screw_corrections`, +`addScrew`/`removeScrew` |
| `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2` | +bloc config vis dans l'onglet Corrections |
| `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2` | +section guide sous le graphe |

---

## Task 1 : Settings Python — 2 nouveaux defaults

**Files:**
- Modify: `octoprint_bedlevelvisualizer/__init__.py:74-110`

- [ ] **Step 1 : Ajouter les 2 defaults dans `get_settings_defaults()`**

Dans [__init__.py](octoprint_bedlevelvisualizer/__init__.py), la méthode `get_settings_defaults()` retourne un `dict`. Ajouter après la ligne `show_prusa_adjustments=False` (ligne 109) :

```python
screws_bed_level_guide=False,
bed_level_screws=[],
```

Résultat attendu :

```python
def get_settings_defaults(self):
    return dict(
        # ... tous les defaults existants ...
        show_prusa_adjustments=False,
        screws_bed_level_guide=False,
        bed_level_screws=[],
    )
```

- [ ] **Step 2 : Vérifier que le plugin démarre sans erreur**

Sur le Raspberry Pi :
```bash
sudo systemctl restart octoprint
sudo journalctl -u octoprint -f | grep -E "(bedlevelvisualizer|ERROR|Traceback)"
```

Attendu : `OctoPrint-BedLevelVisualizer loaded!` sans traceback.

- [ ] **Step 3 : Commit**

```bash
git add octoprint_bedlevelvisualizer/__init__.py
git commit -m "feat: add screws_bed_level_guide and bed_level_screws settings defaults"
```

---

## Task 2 : JS — Observable `screws_bed_level_guide` + helpers `addScrew`/`removeScrew`

**Files:**
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js`

- [ ] **Step 1 : Ajouter l'observable après les observables existants**

Dans [bedlevelvisualizer.js](octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js), après la ligne `self.graph_z_limits = ko.observable();` (ligne 73), ajouter :

```javascript
self.screws_bed_level_guide = ko.observable();
```

- [ ] **Step 2 : Charger dans `onBeforeBinding`**

Dans `onBeforeBinding` (après la ligne `self.graph_z_limits(self.settingsViewModel.settings.plugins.bedlevelvisualizer.graph_z_limits());`, ligne 93), ajouter :

```javascript
self.screws_bed_level_guide(self.settingsViewModel.settings.plugins.bedlevelvisualizer.screws_bed_level_guide());
```

- [ ] **Step 3 : Sauvegarder dans `onSettingsBeforeSave`**

Dans `onSettingsBeforeSave` (après la ligne `if(self.settingsViewModel.settings.plugins.bedlevelvisualizer.timeout().length === 0)...`, ligne 120), ajouter :

```javascript
self.settingsViewModel.settings.plugins.bedlevelvisualizer.screws_bed_level_guide(self.screws_bed_level_guide());
```

- [ ] **Step 4 : Recharger dans `onEventSettingsUpdated`**

Dans `onEventSettingsUpdated` (après la ligne `self.graph_z_limits(...)`, ligne 136), ajouter :

```javascript
self.screws_bed_level_guide(self.settingsViewModel.settings.plugins.bedlevelvisualizer.screws_bed_level_guide());
```

- [ ] **Step 5 : Ajouter `addScrew` et `removeScrew` après `removeCommand`**

Après la fonction `self.removeCommand` (ligne 486), ajouter :

```javascript
self.addScrew = function() {
    self.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws.push({
        label: ko.observable(''),
        x: ko.observable(0),
        y: ko.observable(0)
    });
};

self.removeScrew = function(data) {
    self.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws.remove(data);
};
```

- [ ] **Step 6 : Tester dans la console navigateur**

Ouvrir OctoPrint → F12 → Console :

```javascript
// Vérifier que l'observable existe
ko.dataFor(document.getElementById('tab_plugin_bedlevelvisualizer')).screws_bed_level_guide()
// Attendu : false (valeur par défaut)
```

- [ ] **Step 7 : Commit**

```bash
git add octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js
git commit -m "feat: add screws_bed_level_guide observable and addScrew/removeScrew helpers"
```

---

## Task 3 : JS — Fonction `bilinearInterpolate`

**Files:**
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js`

- [ ] **Step 1 : Ajouter la fonction après `removeScrew`**

Après `self.removeScrew` (ajouté en Task 2), ajouter :

```javascript
self.bilinearInterpolate = function(x, y, xs, ys, zs) {
    // xs : tableau trié des coordonnées X du mesh (longueur = nb colonnes)
    // ys : tableau trié des coordonnées Y du mesh (longueur = nb lignes)
    // zs : tableau 2D zs[j][i] = Z à (xs[i], ys[j])
    if (xs.length < 2 || ys.length < 2) { return { outOfBounds: true }; }

    var i0 = -1, i1 = -1;
    for (var i = 0; i < xs.length - 1; i++) {
        if (xs[i] <= x && x <= xs[i + 1]) { i0 = i; i1 = i + 1; break; }
    }
    var j0 = -1, j1 = -1;
    for (var j = 0; j < ys.length - 1; j++) {
        if (ys[j] <= y && y <= ys[j + 1]) { j0 = j; j1 = j + 1; break; }
    }
    if (i0 === -1 || j0 === -1) { return { outOfBounds: true }; }

    var tx = (x - xs[i0]) / (xs[i1] - xs[i0]);
    var ty = (y - ys[j0]) / (ys[j1] - ys[j0]);

    var z00 = parseFloat(zs[j0][i0]);
    var z10 = parseFloat(zs[j0][i1]);
    var z01 = parseFloat(zs[j1][i0]);
    var z11 = parseFloat(zs[j1][i1]);

    var z = (1 - tx) * (1 - ty) * z00
           + tx       * (1 - ty) * z10
           + (1 - tx) * ty       * z01
           + tx       * ty       * z11;

    return { z: z, outOfBounds: false };
};
```

- [ ] **Step 2 : Tester l'interpolation dans la console**

Ouvrir OctoPrint → F12 → Console. Tester avec un mesh fictif 2×2 :

```javascript
var vm = ko.dataFor(document.getElementById('tab_plugin_bedlevelvisualizer'));

// Mesh 2×2 : coin (0,0)=0.1, (100,0)=0.3, (0,100)=-0.1, (100,100)=0.5
var xs = [0, 100], ys = [0, 100];
var zs = [[0.1, 0.3], [-0.1, 0.5]];

// Point central (50, 50) → attendu : (0.1+0.3-0.1+0.5)/4 = 0.2
var r = vm.bilinearInterpolate(50, 50, xs, ys, zs);
console.log(r.z.toFixed(4));  // → "0.2000"

// Point hors bounds
var r2 = vm.bilinearInterpolate(200, 50, xs, ys, zs);
console.log(r2.outOfBounds);  // → true
```

Attendu : `0.2000` puis `true`.

- [ ] **Step 3 : Commit**

```bash
git add octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js
git commit -m "feat: add bilinearInterpolate function for mesh Z lookup at screw coordinates"
```

---

## Task 4 : JS — Computed `screw_corrections`

**Files:**
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js`

- [ ] **Step 1 : Ajouter le computed après `bilinearInterpolate`**

Après `self.bilinearInterpolate`, ajouter :

```javascript
self.screw_corrections = ko.computed(function() {
    if (!self.screws_bed_level_guide()) { return []; }

    var screws = self.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws();
    var xs = self.mesh_data_x();
    var ys = self.mesh_data_y();
    var zs = self.mesh_data();
    var pitch = parseFloat(self.screw_hub()) || 0;
    var rev = self.reverse();

    if (!xs.length || !ys.length || !zs.length || !screws.length) { return []; }

    return ko.utils.arrayMap(screws, function(screw) {
        var label = ko.unwrap(screw.label) || '?';
        var x = parseFloat(ko.unwrap(screw.x));
        var y = parseFloat(ko.unwrap(screw.y));

        if (pitch === 0) {
            return { label: label, x: x, y: y, pitchZero: true, outOfBounds: false, ok: false };
        }

        var result = self.bilinearInterpolate(x, y, xs, ys, zs);
        if (result.outOfBounds) {
            return { label: label, x: x, y: y, outOfBounds: true, pitchZero: false, ok: false };
        }

        var turns = result.z / pitch;
        var absTurns = Math.abs(turns);
        var ok = absTurns < 0.05;
        // Z > 0 → plateau trop haut → serrer (↻). Inversé si reverse=true.
        var tighten = (result.z > 0) !== rev;

        return {
            label: label,
            x: x,
            y: y,
            z: result.z.toFixed(3),
            turns: absTurns.toFixed(2),
            ok: ok,
            tighten: tighten,
            outOfBounds: false,
            pitchZero: false
        };
    });
}, self);
```

- [ ] **Step 2 : Tester le computed dans la console**

```javascript
var vm = ko.dataFor(document.getElementById('tab_plugin_bedlevelvisualizer'));

// Vérifier que le computed existe et retourne un tableau
console.log(Array.isArray(vm.screw_corrections()));  // → true
// Sans mesh → tableau vide
console.log(vm.screw_corrections().length);           // → 0
```

- [ ] **Step 3 : Commit**

```bash
git add octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js
git commit -m "feat: add screw_corrections computed for per-screw turn guidance"
```

---

## Task 5 : Settings UI — Configuration des vis

**Files:**
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2:146-211`

- [ ] **Step 1 : Ajouter le bloc dans l'onglet Corrections**

Dans [bedlevelvisualizer_settings.jinja2](octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2), dans le div `id="bedlevelvisualizer_corrections"`, **après** le div fermant du bloc `<div style="padding-top: 5px;" class="row-fluid">` (ligne ~211, juste avant `</div>` qui ferme le tab-pane), ajouter :

```html
<hr/>
<div class="row-fluid" style="padding-top: 5px;">
    <div class="control-group span12">
        <input class="input-checkbox" type="checkbox"
               id="screws_bed_level_guide"
               title="Display a per-screw turn guide below the graph."
               data-toggle="tooltip"
               data-bind="checked: $root.screws_bed_level_guide"
               style="display: inline-block; margin-bottom: 5px;"/> Enable Screw Adjustment Guide
    </div>
</div>
<div style="padding-top: 5px;" class="row-fluid" data-bind="visible: $root.screws_bed_level_guide">
    <div class="control-group">
        <label class="row-fluid" style="margin-bottom: 4px;">
            <span class="span10" style="font-weight: bold;">Configured Screws</span>
            <span class="span2" style="text-align: right;">
                <button class="btn btn-mini" data-bind="click: $root.addScrew" title="Add screw">
                    <i class="fa fa-plus"></i> Add
                </button>
            </span>
        </label>
        <div data-bind="foreach: settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws">
            <div class="row-fluid" style="margin-bottom: 4px;">
                <div class="input-prepend input-append">
                    <span class="add-on">Label</span>
                    <input type="text" class="input-mini" style="width: 3em;"
                           data-bind="value: label" placeholder="FL"/>
                    <span class="add-on">X</span>
                    <input type="number" class="input-mini" style="width: 4em;"
                           data-bind="value: x"/>
                    <span class="add-on">Y</span>
                    <input type="number" class="input-mini" style="width: 4em;"
                           data-bind="value: y"/>
                    <button class="btn btn-mini btn-danger"
                            data-bind="click: $root.removeScrew"
                            title="Remove screw">
                        <i class="fa fa-times"></i>
                    </button>
                </div>
            </div>
        </div>
        <small class="help-block">
            Pitch (mm/turn) is shared with <em>Adjustment Screw Details</em> above.
            Leave the list empty to hide the guide.
        </small>
    </div>
</div>
```

- [ ] **Step 2 : Vérifier dans le navigateur**

OctoPrint → Settings → Bed Visualizer → onglet "Corrections" → cocher "Enable Screw Adjustment Guide" → vérifier que le bloc avec le bouton "+ Add" apparaît → cliquer "Add" → vérifier qu'une ligne Label/X/Y s'ajoute → cliquer ✕ → vérifier suppression → sauvegarder → rouvrir les settings → vérifier persistance.

- [ ] **Step 3 : Commit**

```bash
git add octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2
git commit -m "feat: add screw configuration UI in Corrections settings tab"
```

---

## Task 6 : Main tab UI — Section guide des vis

**Files:**
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2`

- [ ] **Step 1 : Ajouter la section sous le bouton "Update Mesh Now"**

Dans [bedlevelvisualizer_tab.jinja2](octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2), après la ligne contenant le div `id="bedlevelvisualizerbutton"` (ligne 24), avant le `</div>` qui ferme le `row-fluid` principal (ligne 25), ajouter :

```html
<!-- Screw Adjustment Guide -->
<!-- ko if: $root.screws_bed_level_guide() && $root.screw_corrections().length > 0 -->
<div class="row-fluid" style="padding-top: 12px;">
    <hr style="margin: 8px 0;"/>
    <div style="font-size: 13px; font-weight: bold; margin-bottom: 8px;">
        <i class="fa fa-wrench"></i> Screw Adjustment Guide
    </div>
    <div style="display: flex; flex-wrap: wrap; gap: 8px;"
         data-bind="foreach: $root.screw_corrections">
        <div style="flex: 1 1 calc(50% - 8px); min-width: 140px; border: 1px solid #555;
                    border-radius: 6px; padding: 10px; text-align: center; box-sizing: border-box;">
            <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 4px;"
                 data-bind="text: label + ' (x=' + x + ', y=' + y + ')'"></div>

            <!-- ko if: outOfBounds -->
            <div style="color: #f90; font-size: 16px; font-weight: bold;">⚠</div>
            <div style="color: #f90; font-size: 11px;">Out of mesh area</div>
            <!-- /ko -->

            <!-- ko if: pitchZero -->
            <div style="color: #f90; font-size: 16px; font-weight: bold;">⚠</div>
            <div style="color: #f90; font-size: 11px;">Pitch = 0, check settings</div>
            <!-- /ko -->

            <!-- ko if: !outOfBounds && !pitchZero && ok -->
            <div style="color: #5c5; font-size: 22px; font-weight: bold; margin: 4px 0;">✓</div>
            <div style="color: #5c5; font-size: 11px;">OK</div>
            <div style="color: #777; font-size: 10px; margin-top: 4px;"
                 data-bind="text: 'Z = ' + z + 'mm'"></div>
            <!-- /ko -->

            <!-- ko if: !outOfBounds && !pitchZero && !ok -->
            <div style="font-size: 22px; font-weight: bold; margin: 4px 0;"
                 data-bind="text: (tighten ? '↻' : '↺') + ' ' + turns,
                             style: { color: tighten ? '#4af' : '#f90' }"></div>
            <div style="font-size: 11px;"
                 data-bind="text: tighten ? 'turns — Tighten' : 'turns — Loosen',
                             style: { color: tighten ? '#4af' : '#f90' }"></div>
            <div style="color: #777; font-size: 10px; margin-top: 4px;"
                 data-bind="text: 'Z = ' + z + 'mm'"></div>
            <!-- /ko -->
        </div>
    </div>
</div>
<!-- /ko -->
```

- [ ] **Step 2 : Test end-to-end**

1. Settings → Corrections → cocher "Enable Screw Adjustment Guide"
2. Ajouter 4 vis : FL(30,30), FR(280,30), BR(280,290), BL(30,290)
3. Sélectionner M4 (0.7mm) dans "Adjustment Screw Details"
4. Sauvegarder
5. Onglet Bed Visualizer → cliquer "Update Mesh Now" → attendre fin
6. Vérifier que la section "Screw Adjustment Guide" apparaît avec 4 cartes
7. Vérifier que les valeurs ↺/↻ ou ✓ s'affichent sans erreur console

- [ ] **Step 3 : Tester la gestion d'erreur "hors mesh"**

Ajouter une vis à x=500, y=500 → vérifier que la carte affiche "⚠ Out of mesh area".

- [ ] **Step 4 : Commit**

```bash
git add octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2
git commit -m "feat: add screw adjustment guide section to main tab"
```

---

## Task 7 : Désactiver `show_prusa_adjustments` par défaut (nettoyage)

**Files:**
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2`

> Cette task est optionnelle si l'utilisateur n'utilise pas la feature Prusa. Elle évite la confusion entre les deux modes.

- [ ] **Step 1 : Renommer le label "Show Prusa Correction Values"**

Dans [bedlevelvisualizer_settings.jinja2](octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2), ligne 164, changer :

```html
/> Show Prusa Correction Values
```

en :

```html
/> Show Prusa-style Correction Values (legacy)
```

- [ ] **Step 2 : Commit**

```bash
git add octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2
git commit -m "chore: clarify Prusa correction values label as legacy"
```

---

## Vérification finale

- [ ] Ouvrir OctoPrint, aller sur l'onglet Bed Visualizer
- [ ] Lancer un mesh update complet
- [ ] Confirmer que le guide des 4 vis s'affiche avec les bonnes valeurs
- [ ] Désactiver le guide dans Settings → vérifier qu'il disparaît de l'onglet
- [ ] Vérifier que l'ancienne feature `show_prusa_adjustments` fonctionne encore
- [ ] Vérifier l'absence d'erreurs JS dans la console navigateur (F12)
