# Interpolation Fix + Reference Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Corriger le bug de coordonnées center_origin/circular. (2) Ajouter un choix de référence de calcul : Z=0, vis de référence (ancre), ou plan de référence (moindres carrés) — avec mise à jour dynamique (KO reactif).

**Architecture:** Tout en JS/Jinja2 côté frontend. Zéro modification du backend mesh. Nouveaux settings Python pour persister le mode de référence. `screw_corrections` (computed KO) mis à jour — il se recalcule automatiquement quand mesh, vis ou mode changent.

**Tech Stack:** Python (OctoPrint SettingsPlugin), JavaScript (KnockoutJS), Jinja2/Bootstrap2

---

## Contexte — état actuel du code

- `__init__.py` ligne ~110 : `screws_bed_level_guide=False`, `bed_level_screws=[]` ajoutés
- `bedlevelvisualizer.js` :
  - ligne 73 : `self.screws_bed_level_guide = ko.observable(false);`
  - lignes 505-535 : `self.bilinearInterpolate(x, y, xs, ys, zs)` — fonctionne en coordonnées absolues
  - lignes 537-585 : `self.screw_corrections = ko.computed(...)` — cible Z=0, pas de gestion center_origin
  - ligne 167 : quand `use_center_origin()` ou `bed.type === 'circular'`, `x_data` est en coordonnées centrées (`x_min - x_max/2 + ...`) pas absolues
- `bedlevelvisualizer_settings.jinja2` : bloc vis dans onglet Corrections
- `bedlevelvisualizer_tab.jinja2` : section guide sous le graphe

---

## Fichiers modifiés

| Fichier | Rôle |
|---|---|
| `octoprint_bedlevelvisualizer/__init__.py` | +3 defaults : `screw_reference_mode`, `screw_reference_index`, `screw_reference_plane_index` |
| `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js` | +observables, +`bed_info`, +`fitReferencePlane`, fix `screw_corrections` |
| `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2` | +sélecteur mode référence dans onglet Corrections |
| `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2` | +badge REF, +note mode référence |

---

## Task 1 : Fix — Stocker `bed_info` + transformer les coordonnées vis

**Problème :** Quand `use_center_origin=true` ou `bed.type === 'circular'`, `mesh_data_x`/`mesh_data_y` sont en coordonnées centrées (ex: -150..+150 pour un plateau 300mm), mais l'utilisateur entre ses vis en coordonnées absolues (ex: 30, 280). `bilinearInterpolate` retourne donc `outOfBounds: true` à tort.

**Solution :** Stocker les infos du plateau dans un observable, transformer les coordonnées vis avant interpolation.

**Files:**
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js`

- [ ] **Step 1 : Ajouter l'observable `self.bed_info` après `self.screws_bed_level_guide`**

À la ligne 73, après `self.screws_bed_level_guide = ko.observable(false);`, ajouter :

```javascript
self.bed_info = ko.observable({});
```

- [ ] **Step 2 : Remplir `bed_info` dans `onDataUpdaterPluginMessage`**

Dans `onDataUpdaterPluginMessage` (ligne ~181), après la ligne `self.mesh_data_z_height(mesh_data.bed.z_max);` et avant le `return;`, ajouter :

```javascript
self.bed_info({
    x_max: mesh_data.bed.x_max,
    y_max: mesh_data.bed.y_max,
    type: mesh_data.bed.type,
    center_origin: (mesh_data.bed.type === 'circular') ||
                   self.settingsViewModel.settings.plugins.bedlevelvisualizer.use_center_origin()
});
```

- [ ] **Step 3 : Appliquer la transformation dans `screw_corrections`**

Dans `self.screw_corrections` (ligne ~537), après la déclaration de `var zs`, avant la boucle `arrayMap`, ajouter le bloc de transformation :

```javascript
var bed = self.bed_info();
var useCentered = !!(bed.center_origin);
```

Puis dans le corps du `arrayMap`, remplacer la ligne :
```javascript
var result = self.bilinearInterpolate(x, y, xs, ys, zs);
```
par :
```javascript
var ix = useCentered ? x - bed.x_max / 2 : x;
var iy = useCentered ? y - bed.y_max / 2 : y;
var result = self.bilinearInterpolate(ix, iy, xs, ys, zs);
```

- [ ] **Step 4 : Vérifier en console (sans plateau circular, le comportement doit être identique)**

```javascript
var vm = ko.dataFor(document.getElementById('tab_plugin_bedlevelvisualizer'));
console.log(vm.bed_info());
// Attendu : objet avec x_max, y_max, type, center_origin
console.log(vm.screw_corrections());
// Attendu : tableau avec corrections (idem qu'avant si center_origin=false)
```

- [ ] **Step 5 : Commit**

```bash
git add octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js
git commit -m "fix: store bed_info and apply coordinate transform for center_origin/circular beds"
```

---

## Task 2 : Settings Python — 2 nouveaux defaults pour le mode référence

**Files:**
- Modify: `octoprint_bedlevelvisualizer/__init__.py:110-112`

- [ ] **Step 1 : Ajouter les defaults après `bed_level_screws=[]`**

Dans `get_settings_defaults()`, après `bed_level_screws=[],` (ligne 111), ajouter :

```python
screw_reference_mode='zero',
screw_reference_index=0,
```

Résultat attendu du bloc :

```python
screws_bed_level_guide=False,
bed_level_screws=[],
screw_reference_mode='zero',
screw_reference_index=0,
```

- [ ] **Step 2 : Commit**

```bash
git add octoprint_bedlevelvisualizer/__init__.py
git commit -m "feat: add screw_reference_mode and screw_reference_index settings defaults"
```

---

## Task 3 : JS — Observables + `fitReferencePlane`

**Files:**
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js`

**Principe du plan de référence :** Étant donné N vis avec leurs coordonnées (x_i, y_i, z_i), on cherche le plan `Z = a*x + b*y + c` qui minimise `Σ(z_i - (a*x_i + b*y_i + c))²`. Avec ≥3 points, solution par moindres carrés. Avec 2 points, droite (b=0 ou a=0). Avec 1 point, plan horizontal à Z=z_0.

La correction de chaque vis = `z_i - plane(x_i, y_i)` = résidu par rapport au plan.

- [ ] **Step 1 : Ajouter les observables pour le mode référence**

Après `self.screws_bed_level_guide = ko.observable(false);` (ligne 73), ajouter :

```javascript
self.screw_reference_mode = ko.observable('zero');
self.screw_reference_index = ko.observable(0);
```

- [ ] **Step 2 : Charger dans `onBeforeBinding`**

Après `self.screws_bed_level_guide(...)` dans `onBeforeBinding`, ajouter :

```javascript
self.screw_reference_mode(self.settingsViewModel.settings.plugins.bedlevelvisualizer.screw_reference_mode());
self.screw_reference_index(self.settingsViewModel.settings.plugins.bedlevelvisualizer.screw_reference_index());
```

- [ ] **Step 3 : Sauvegarder dans `onSettingsBeforeSave`**

Après `self.screws_bed_level_guide(...)` dans `onSettingsBeforeSave`, ajouter :

```javascript
self.settingsViewModel.settings.plugins.bedlevelvisualizer.screw_reference_mode(self.screw_reference_mode());
self.settingsViewModel.settings.plugins.bedlevelvisualizer.screw_reference_index(self.screw_reference_index());
```

- [ ] **Step 4 : Recharger dans `onEventSettingsUpdated`**

Après `self.screws_bed_level_guide(...)` dans `onEventSettingsUpdated`, ajouter :

```javascript
self.screw_reference_mode(self.settingsViewModel.settings.plugins.bedlevelvisualizer.screw_reference_mode());
self.screw_reference_index(self.settingsViewModel.settings.plugins.bedlevelvisualizer.screw_reference_index());
```

- [ ] **Step 5 : Ajouter la fonction `fitReferencePlane` après `bilinearInterpolate`**

Après la fin de `self.bilinearInterpolate` (ligne ~535), ajouter :

```javascript
// Fits a plane Z = a*x + b*y + c to an array of {x, y, z} points
// Returns a function zAtXY(x, y) -> z
// Falls back gracefully for 1 or 2 points
self.fitReferencePlane = function(points) {
    var n = points.length;
    if (n === 0) { return function() { return 0; }; }
    if (n === 1) {
        var z0 = points[0].z;
        return function() { return z0; };
    }

    // Build normal equations for least squares: [A^T A] [a,b,c]^T = [A^T z]
    // A rows: [x_i, y_i, 1]
    var sx = 0, sy = 0, sz = 0;
    var sxx = 0, sxy = 0, sxz = 0;
    var syy = 0, syz = 0;
    for (var i = 0; i < n; i++) {
        var xi = points[i].x, yi = points[i].y, zi = points[i].z;
        sx  += xi;     sy  += yi;     sz  += zi;
        sxx += xi * xi; sxy += xi * yi; sxz += xi * zi;
        syy += yi * yi; syz += yi * zi;
    }

    // 3x3 system: M * [a, b, c]^T = rhs
    // M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]]
    // rhs = [sxz, syz, sz]
    var M = [
        [sxx, sxy, sx],
        [sxy, syy, sy],
        [sx,  sy,  n ]
    ];
    var rhs = [sxz, syz, sz];

    // Gaussian elimination with partial pivoting
    var aug = M.map(function(row, i) { return row.concat([rhs[i]]); });
    for (var col = 0; col < 3; col++) {
        // Find pivot
        var maxRow = col;
        for (var row = col + 1; row < 3; row++) {
            if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) { maxRow = row; }
        }
        var tmp = aug[col]; aug[col] = aug[maxRow]; aug[maxRow] = tmp;

        if (Math.abs(aug[col][col]) < 1e-12) { continue; } // singular, skip

        for (var r = col + 1; r < 3; r++) {
            var factor = aug[r][col] / aug[col][col];
            for (var c2 = col; c2 <= 3; c2++) {
                aug[r][c2] -= factor * aug[col][c2];
            }
        }
    }
    // Back substitution
    var sol = [0, 0, 0];
    for (var i2 = 2; i2 >= 0; i2--) {
        if (Math.abs(aug[i2][i2]) < 1e-12) { sol[i2] = 0; continue; }
        sol[i2] = aug[i2][3];
        for (var j2 = i2 + 1; j2 < 3; j2++) {
            sol[i2] -= aug[i2][j2] * sol[j2];
        }
        sol[i2] /= aug[i2][i2];
    }
    var a = sol[0], b = sol[1], c = sol[2];
    return function(x, y) { return a * x + b * y + c; };
};
```

- [ ] **Step 6 : Tester `fitReferencePlane` en console**

```javascript
var vm = ko.dataFor(document.getElementById('tab_plugin_bedlevelvisualizer'));

// Plan horizontal Z=0.5 (3 points coplanaires)
var f1 = vm.fitReferencePlane([
    {x:0,   y:0,   z:0.5},
    {x:100, y:0,   z:0.5},
    {x:0,   y:100, z:0.5}
]);
console.log(f1(50, 50).toFixed(4));  // → "0.5000"

// Plan incliné Z = 0.001*x (x=0→z=0, x=100→z=0.1, x=200→z=0.2)
var f2 = vm.fitReferencePlane([
    {x:0,   y:0, z:0.0},
    {x:100, y:0, z:0.1},
    {x:200, y:0, z:0.2}
]);
console.log(f2(150, 0).toFixed(4));  // → "0.1500"
```

- [ ] **Step 7 : Commit**

```bash
git add octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js
git commit -m "feat: add screw_reference_mode observables and fitReferencePlane function"
```

---

## Task 4 : JS — Mettre à jour `screw_corrections` pour les 3 modes

**Files:**
- Modify: `octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js:537-585`

Le computed `screw_corrections` dépend déjà de tous les observables nécessaires via KO. En ajoutant `self.screw_reference_mode()` et `self.screw_reference_index()` dans le computed, il se recalculera automatiquement quand ces observables changent — c'est le comportement "dynamique" voulu.

- [ ] **Step 1 : Remplacer l'intégralité de `self.screw_corrections` par la version suivante**

Remplacer depuis `self.screw_corrections = ko.computed(function() {` jusqu'à `}, self);` (lignes 537-585) par :

```javascript
self.screw_corrections = ko.computed(function() {
    if (!self.screws_bed_level_guide()) { return []; }

    var screws = self.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws();
    var xs = self.mesh_data_x();
    var ys = self.mesh_data_y();
    var zs = self.mesh_data();
    var rawHub = parseFloat(self.screw_hub());
    if (isNaN(rawHub)) { return []; }
    var pitch = self.imperial() ? (rawHub !== 0 ? 25.4 / rawHub : 0) : rawHub;
    var rev = self.reverse();
    var mode = self.screw_reference_mode();
    var refIdx = parseInt(self.screw_reference_index(), 10);

    if (!xs.length || !ys.length || !zs.length || !screws.length) { return []; }

    var bed = self.bed_info();
    var useCentered = !!(bed.center_origin);

    // Pass 1 : interpoler Z pour chaque vis
    var interpolated = ko.utils.arrayMap(screws, function(screw) {
        var label = ko.unwrap(screw.label) || '?';
        var x = parseFloat(ko.unwrap(screw.x));
        var y = parseFloat(ko.unwrap(screw.y));
        var ix = useCentered ? x - bed.x_max / 2 : x;
        var iy = useCentered ? y - bed.y_max / 2 : y;
        var result = self.bilinearInterpolate(ix, iy, xs, ys, zs);
        return {
            label: label, x: x, y: y,
            z: result.outOfBounds ? null : result.z,
            outOfBounds: result.outOfBounds
        };
    });

    // Pass 2 : calculer la valeur de référence selon le mode
    var refZAt; // function(x, y, idx) -> reference Z to subtract
    if (mode === 'screw') {
        // Mode vis de référence : soustraire le Z de la vis d'ancrage
        var refEntry = (refIdx >= 0 && refIdx < interpolated.length) ? interpolated[refIdx] : null;
        var refZ = (refEntry && !refEntry.outOfBounds) ? refEntry.z : 0;
        refZAt = function(x, y, idx) { return (idx === refIdx) ? refEntry.z : refZ; };
    } else if (mode === 'plane') {
        // Mode plan de référence : plan moindres carrés sur les vis valides
        var validPoints = [];
        for (var vi = 0; vi < interpolated.length; vi++) {
            if (!interpolated[vi].outOfBounds) {
                validPoints.push({ x: interpolated[vi].x, y: interpolated[vi].y, z: interpolated[vi].z });
            }
        }
        var planeFn = self.fitReferencePlane(validPoints);
        refZAt = function(x) { return planeFn(arguments[0], arguments[1]); };
        // Rebind properly
        refZAt = (function(fn) {
            return function(x, y) { return fn(x, y); };
        })(planeFn);
    } else {
        // Mode 'zero' (défaut) : référence = 0
        refZAt = function() { return 0; };
    }

    // Pass 3 : calculer les corrections
    return ko.utils.arrayMap(interpolated, function(entry, idx) {
        if (pitch === 0) {
            return { label: entry.label, x: entry.x, y: entry.y,
                     pitchZero: true, outOfBounds: false, ok: false, isRef: false };
        }
        if (entry.outOfBounds) {
            return { label: entry.label, x: entry.x, y: entry.y,
                     outOfBounds: true, pitchZero: false, ok: false, isRef: false };
        }

        var isRef = (mode === 'screw' && idx === refIdx);
        var delta = entry.z - refZAt(entry.x, entry.y, idx);
        var turns = delta / pitch;
        var absTurns = Math.abs(turns);
        var ok = isRef || absTurns < 0.05;
        var tighten = (delta > 0) !== rev;

        return {
            label: entry.label,
            x: entry.x,
            y: entry.y,
            z: entry.z.toFixed(3),
            delta: delta.toFixed(3),
            turns: absTurns.toFixed(2),
            ok: ok,
            tighten: tighten,
            isRef: isRef,
            outOfBounds: false,
            pitchZero: false
        };
    });
}, self);
```

- [ ] **Step 2 : Tester en console**

```javascript
var vm = ko.dataFor(document.getElementById('tab_plugin_bedlevelvisualizer'));
// Après un mesh update :
console.log(vm.screw_corrections());
// Changer le mode :
vm.screw_reference_mode('plane');
console.log(vm.screw_corrections());
// Le tableau se recalcule automatiquement → dynamique
vm.screw_reference_mode('zero');
```

- [ ] **Step 3 : Commit**

```bash
git add octoprint_bedlevelvisualizer/static/js/bedlevelvisualizer.js
git commit -m "feat: update screw_corrections for zero/screw/plane reference modes (dynamic KO computed)"
```

---

## Task 5 : Settings UI — Sélecteur de mode référence

**Files:**
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2`

Ajouter sous la section vis configurées (après le `<small class="help-block">` existant), un sélecteur de mode et un dropdown pour la vis de référence.

- [ ] **Step 1 : Ajouter le bloc mode référence dans l'onglet Corrections**

Après le bloc `<div data-bind="visible: $root.screws_bed_level_guide">...</div>` existant (le bloc qui contient la liste des vis), ajouter ce bloc juste après son `</div>` fermant :

```html
<div style="padding-top: 5px;" class="row-fluid" data-bind="visible: $root.screws_bed_level_guide">
    <div class="control-group span12">
        <label style="margin-bottom: 4px; display: block; font-weight: bold;">Reference for corrections</label>
        <label class="radio inline" style="margin-right: 12px;">
            <input type="radio" name="screw_reference_mode" value="zero"
                   data-bind="checked: $root.screw_reference_mode"/> Z = 0
        </label>
        <label class="radio inline" style="margin-right: 12px;">
            <input type="radio" name="screw_reference_mode" value="screw"
                   data-bind="checked: $root.screw_reference_mode"/> Reference screw
        </label>
        <label class="radio inline">
            <input type="radio" name="screw_reference_mode" value="plane"
                   data-bind="checked: $root.screw_reference_mode"/> Best-fit plane
        </label>
    </div>
    <!-- Dropdown vis de référence (visible seulement en mode 'screw') -->
    <div class="control-group span12" style="margin-top: 4px;"
         data-bind="visible: $root.screw_reference_mode() === 'screw'">
        <label style="display: inline-block; margin-right: 8px;">Anchor screw:</label>
        <select data-bind="
            options: $root.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws(),
            optionsText: function(s){ return ko.unwrap(s.label) || '?'; },
            optionsValue: function(s, i){ return i; },
            value: $root.screw_reference_index,
            valueAllowUnset: false">
        </select>
        <small class="help-block" style="margin-top: 2px;">
            This screw stays fixed — all others are adjusted relative to it.
        </small>
    </div>
    <div class="control-group span12" style="margin-top: 2px;"
         data-bind="visible: $root.screw_reference_mode() === 'plane'">
        <small class="help-block">
            A best-fit plane is computed through all screw Z values. Corrections minimize total levelling work.
        </small>
    </div>
</div>
```

**Note sur le dropdown :** KnockoutJS ne supporte pas `optionsValue` avec un index par défaut. On utilisera `optionsCaption` en fallback si `optionsValue` ne fonctionne pas — tester en console. Alternative fiable : utiliser `optionsText` + `optionsValue` avec `ko.unwrap(s.label)` et un index calculé.

Version corrigée du select si l'index ne fonctionne pas :

```html
<select data-bind="
    foreach: $root.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws">
    <option data-bind="text: ko.unwrap($data.label) || '?',
                       value: $index(),
                       selected: $index() == $root.screw_reference_index()"></option>
</select>
```

Implémentation recommandée (la plus compatible Bootstrap2/KO) :

```html
<select data-bind="value: $root.screw_reference_index">
    <!-- ko foreach: $root.settingsViewModel.settings.plugins.bedlevelvisualizer.bed_level_screws -->
    <option data-bind="text: ko.unwrap($data.label) || ('Screw ' + $index()),
                       value: $index()"></option>
    <!-- /ko -->
</select>
```

- [ ] **Step 2 : Vérifier dans le navigateur**

1. Settings → Corrections → cocher "Enable Screw Adjustment Guide"
2. Vérifier que les 3 radios apparaissent : "Z=0", "Reference screw", "Best-fit plane"
3. Sélectionner "Reference screw" → vérifier que le dropdown apparaît
4. Le dropdown doit lister les vis configurées par leur label
5. Sélectionner "Best-fit plane" → vérifier que le dropdown disparaît, message explicatif visible
6. Sauvegarder → rouvrir Settings → vérifier persistance du choix

- [ ] **Step 3 : Commit**

```bash
git add octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_settings.jinja2
git commit -m "feat: add reference mode selector (zero/screw/plane) in Corrections settings"
```

---

## Task 6 : Main tab UI — Badge REF + affichage du delta

**Files:**
- Modify: `octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2`

- [ ] **Step 1 : Mettre à jour les cartes du guide**

Dans `bedlevelvisualizer_tab.jinja2`, dans le `foreach: $root.screw_corrections`, modifier le bloc carte pour :
1. Afficher un badge "REF" en mode vis de référence
2. Afficher `delta` (différence par rapport à la référence) au lieu du Z brut quand mode ≠ 'zero'
3. Afficher le Z brut en sous-texte dans tous les cas

Remplacer le contenu de la div carte (depuis `<div style="font-size: 10px; text-transform..."` jusqu'au `<!-- /ko -->` final) par :

```html
<!-- label + coord -->
<div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 4px;"
     data-bind="text: label + ' (x=' + x + ', y=' + y + ')'"></div>

<!-- badge REF (mode vis de référence) -->
<!-- ko if: isRef -->
<div style="display:inline-block;background:#555;color:#ccc;font-size:10px;
            padding:1px 6px;border-radius:3px;margin-bottom:4px;">REF</div>
<!-- /ko -->

<!-- hors zone mesh -->
<!-- ko if: outOfBounds -->
<div style="color: #f90; font-size: 16px; font-weight: bold;">&#9888;</div>
<div style="color: #f90; font-size: 11px;">Out of mesh area</div>
<!-- /ko -->

<!-- pitch = 0 -->
<!-- ko if: !outOfBounds && pitchZero -->
<div style="color: #f90; font-size: 16px; font-weight: bold;">&#9888;</div>
<div style="color: #f90; font-size: 11px;">Pitch = 0, check settings</div>
<!-- /ko -->

<!-- OK (ou vis de référence) -->
<!-- ko if: !outOfBounds && !pitchZero && ok -->
<div style="color: #5c5; font-size: 22px; font-weight: bold; margin: 4px 0;">&#10003;</div>
<div style="color: #5c5; font-size: 11px;"
     data-bind="text: isRef ? 'Anchor screw' : 'OK'"></div>
<div style="color: #777; font-size: 10px; margin-top: 4px;"
     data-bind="text: 'Z = ' + z + 'mm'"></div>
<!-- /ko -->

<!-- correction à appliquer -->
<!-- ko if: !outOfBounds && !pitchZero && !ok -->
<div style="font-size: 22px; font-weight: bold; margin: 4px 0;"
     data-bind="text: (tighten ? '\u21bb' : '\u21ba') + ' ' + turns,
                 style: { color: tighten ? '#4af' : '#f90' }"></div>
<div style="font-size: 11px;"
     data-bind="text: tighten ? 'turns \u2014 Tighten' : 'turns \u2014 Loosen',
                 style: { color: tighten ? '#4af' : '#f90' }"></div>
<div style="color: #777; font-size: 10px; margin-top: 4px;"
     data-bind="text: 'Z = ' + z + 'mm'"></div>
<!-- /ko -->
```

- [ ] **Step 2 : Ajouter une note sur le mode référence actif (sous le titre "Screw Adjustment Guide")**

Après le `<div style="font-size: 13px; font-weight: bold...">` du titre, ajouter :

```html
<!-- ko if: $root.screw_reference_mode() !== 'zero' -->
<div style="font-size: 10px; color: #888; margin-bottom: 8px;"
     data-bind="text: $root.screw_reference_mode() === 'screw'
         ? 'Corrections relative to anchor screw'
         : 'Corrections relative to best-fit plane'"></div>
<!-- /ko -->
```

- [ ] **Step 3 : Test end-to-end**

1. Configurer 4 vis, faire un mesh update
2. Tester chaque mode (Z=0, Reference screw, Best-fit plane) dans Settings → observer que les cartes changent immédiatement après sauvegarde
3. En mode "Reference screw" : vérifier le badge REF sur la vis d'ancrage, ses turns = 0 (ou ✓)
4. En mode "Best-fit plane" : vérifier que la somme des corrections est proche de zéro
5. Vérifier l'absence d'erreurs JS en console (F12)

- [ ] **Step 4 : Commit**

```bash
git add octoprint_bedlevelvisualizer/templates/bedlevelvisualizer_tab.jinja2
git commit -m "feat: add REF badge and reference mode note to screw guide tab UI"
```

---

## Vérification finale

- [ ] Mode Z=0 : comportement identique à avant, toutes les vis corrigées vers Z=0
- [ ] Mode Reference screw : vis d'ancrage affiche ✓ ou REF, autres vis corrigées relativement
- [ ] Mode Best-fit plane : somme algébrique des corrections ≈ 0, plan optimal
- [ ] Changement de mode dynamique : modifier le mode dans Settings et sauvegarder → cartes mises à jour instantanément
- [ ] Plates-formes center_origin : vis hors bounds avant la correction → vérifier plus d'erreur après fix Task 1
- [ ] Console navigateur sans erreur JS
