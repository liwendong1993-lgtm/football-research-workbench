# Compact Layout and Multiplier Takeover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish, verify, and publish the inherited multiplier, compact-layout, autosave, and Quark-compatibility changes without replacing the existing dark visual design.

**Architecture:** Keep the zero-dependency static PWA architecture. `combo-utils.js` remains the pure calculation boundary; `app.js` owns rendering, persistence, and poster generation; `index.html` owns semantic structure; `styles.css` owns responsive density; `sw.js` owns offline cache rotation. Treat the inherited dirty diff as legacy code to characterize first, and require a failing regression test before every new production correction.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Node.js built-in test runner, Local Storage, Canvas, Service Worker, GitHub Pages.

## Global Constraints

- Preserve the existing dark theme; use the white score-app screenshot only as a density reference.
- Multiplier range is integer `1–99999`, defaulting to `1` for legacy or invalid data.
- Do not change match data sources, betting-market rules, local-first storage, or add accounts/payments.
- Keep match selection autosave and the non-native Quark poster modal behavior.
- Mobile acceptance widths are exactly `360px`, `390px`, and `430px`; also verify a desktop viewport.
- New production corrections require a failing test first; inherited behavior may be covered by characterization tests.

---

## File Responsibility Map

- `combo-utils.js`: normalize multiplier inputs inside monetary calculations and return `{tickets, multiple, cost, minPrize, maxPrize, complete}`.
- `app.js`: render compact match cards and scheme controls, persist multiplier changes, autosave match research, and draw multiplier-aware posters.
- `index.html`: render the one-line hero summary and load versioned static assets.
- `styles.css`: dark-theme compact hero, two-line cards, overflow containment, and compact multiplier controls.
- `sw.js`: cache version and the exact versioned asset URLs used by `index.html`.
- `tests/combo-utils.test.js`: calculation and multiplier-boundary coverage.
- `tests/multiplier-compact-layout.test.mjs`: static acceptance checks for markup, rendering hooks, compatibility behavior, and asset-version consistency.

---

### Task 1: Characterize and Review the Inherited Functional Diff

**Files:**
- Modify: `tests/combo-utils.test.js:65-73`
- Modify: `tests/multiplier-compact-layout.test.mjs:9-29`
- Review: `app.js`, `combo-utils.js`, `index.html`, `styles.css`

**Interfaces:**
- Consumes: `schemePrizeRange(items, stake = 2, multiple = 1)` from `combo-utils.js`.
- Produces: regression coverage for multiplier boundaries, legacy defaulting, compact DOM hooks, autosave, and Quark fallback hooks.

- [ ] **Step 1: Record the inherited baseline**

Run:

```bash
git status --short --branch
git diff --check
node --test tests/*.test.js tests/*.test.mjs
```

Expected: only the known Hermes files are dirty; `git diff --check` is silent; all 28 inherited tests pass.

- [ ] **Step 2: Add multiplier boundary characterization**

Append to `tests/combo-utils.test.js`:

```js
test('方案倍数兼容旧数据并归一化异常输入', () => {
  const items=[{matchId:'1',options:[{market:'spf',pick:'h',odd:2}]}];
  assert.equal(schemePrizeRange(items,2).multiple,1);
  assert.equal(schemePrizeRange(items,2,'').multiple,1);
  assert.equal(schemePrizeRange(items,2,-3).multiple,1);
  assert.equal(schemePrizeRange(items,2,2.9).multiple,2);
  assert.equal(schemePrizeRange(items,2,100000).multiple,99999);
});
```

- [ ] **Step 3: Add inherited UI behavior characterization**

Append to `tests/multiplier-compact-layout.test.mjs`:

```js
test('紧凑卡片保留完整队名提示并限制标签区域溢出',()=>{
  assert.match(app,/class="compact-team" title="\$\{esc\(m\.home\)\}"/);
  assert.match(app,/class="compact-team" title="\$\{esc\(m\.away\)\}"/);
  assert.match(css,/\.match-detail-line \.pick-summary\{[^}]*overflow-x:auto/);
});

test('倍投保存、海报和自动保存共用持久化数据',()=>{
  assert.match(app,/combo\.multiple=normalizeMultiple/);
  assert.match(app,/drawSingleComboPoster[\s\S]*schemePrizeRange\(items,2,combo\?\.multiple\)/);
  assert.match(app,/drawPoster[\s\S]*schemePrizeRange\(items,2,c\.multiple\)/);
  assert.match(app,/function persistDraft\(\)/);
});

test('夸克海报预览失败时回退Canvas',()=>{
  assert.match(html,/<div id="posterDialog"/);
  assert.doesNotMatch(html,/<dialog id="posterDialog"/);
  assert.match(app,/image\.onerror=.*canvas\.hidden=false/);
});
```

- [ ] **Step 4: Run characterization tests**

Run:

```bash
node --test tests/combo-utils.test.js tests/multiplier-compact-layout.test.mjs
```

Expected: all characterization tests pass. If one fails, confirm whether it exposes a spec gap; do not weaken the assertion to match incorrect behavior.

---

### Task 2: Verify Responsive Layout and Interactions in a Real Browser

**Files:**
- Modify only if a defect is observed: `tests/multiplier-compact-layout.test.mjs`, then the smallest relevant file among `app.js`, `index.html`, and `styles.css`

**Interfaces:**
- Consumes: static app served from `/Users/ken/football-research-workbench`.
- Produces: verified mobile/desktop layout, autosave persistence, multiplier persistence, and clickable poster controls.

- [ ] **Step 1: Start a clean local server**

Run:

```bash
python3 -m http.server 8768 --bind 127.0.0.1
```

Expected: `Serving HTTP on 127.0.0.1 port 8768` remains running for browser checks.

- [ ] **Step 2: Verify the four target viewports**

Open `http://127.0.0.1:8768/` with the browser-control skill and inspect at:

```text
360 × 800
390 × 844
430 × 932
1280 × 900
```

For each viewport, evaluate:

```js
({
  viewport: [innerWidth, innerHeight],
  pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  heroHeight: document.querySelector('.hero-card')?.getBoundingClientRect().height,
  firstCardHeight: document.querySelector('.match-card')?.getBoundingClientRect().height,
  firstCardLines: document.querySelector('.match-card')?.querySelectorAll('.match-line,.match-detail-line').length
})
```

Expected: `pageOverflow` is `false`; `heroHeight` is compact; `firstCardLines` is `2`; team text does not overlap time or odds.

- [ ] **Step 3: Verify autosave**

In the browser:

1. Open the first match.
2. Select a 胜平负 option and a confidence value.
3. Close the sheet without finding or pressing a save button.
4. Reopen the same match.

Expected: both selections remain and the dialog reports automatic saving.

- [ ] **Step 4: Verify multiplier persistence and poster controls**

In the browser:

1. Create or open a valid scheme.
2. Enter multiplier `3`.
3. Confirm cost and both prize values become exactly three times their 1× values.
4. Reload the page and confirm multiplier `3` remains.
5. Open the single-scheme poster and click close, save/share, and open-large-image controls where the browser supports them.

Expected: values persist; the poster includes `3倍`; controls respond; no broken-image icon remains after fallback.

- [ ] **Step 5: Apply TDD to each observed defect**

For every observed defect, first add one focused assertion to `tests/multiplier-compact-layout.test.mjs`, run it and confirm the expected failure, then make the minimum change to the relevant production file and rerun:

```bash
node --test tests/multiplier-compact-layout.test.mjs
```

Expected: the new assertion fails before the correction and passes afterward; all earlier assertions remain green.

---

### Task 3: Rotate Static Asset and Service Worker Versions

**Files:**
- Modify: `tests/multiplier-compact-layout.test.mjs`
- Modify: `index.html:12,103-105`
- Modify: `app.js:238`
- Modify: `sw.js:1-2`

**Interfaces:**
- Consumes: cache release identifier `20260720-compact1` and Service Worker cache `football-workbench-v11`.
- Produces: identical asset URLs in `index.html` and `sw.js`, plus a versioned Service Worker registration URL.

- [ ] **Step 1: Write the failing cache-coherence test**

Add `const sw=...` beside the existing file reads and append:

```js
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('发布资源与Service Worker使用同一新版本',()=>{
  const release='20260720-compact1';
  for(const asset of ['styles.css','combo-utils.js','scan-utils.js','app.js']){
    assert.match(html,new RegExp(`${asset.replace('.', '\\.') }\\?v=${release}`));
    assert.match(sw,new RegExp(`${asset.replace('.', '\\.') }\\?v=${release}`));
  }
  assert.match(app,new RegExp(`sw\\.js\\?v=${release}`));
  assert.match(sw,/football-workbench-v11/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test tests/multiplier-compact-layout.test.mjs
```

Expected: FAIL because the current release is `20260717-1718` and the current cache is `football-workbench-v10`.

- [ ] **Step 3: Apply the release version**

Replace every `20260717-1718` in `index.html`, `app.js`, and `sw.js` with `20260720-compact1`. Replace `football-workbench-v10` in `sw.js` with `football-workbench-v11`.

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```bash
node --test tests/multiplier-compact-layout.test.mjs
```

Expected: all tests pass.

---

### Task 4: Complete Local Verification and Commit the Feature

**Files:**
- Verify: `app.js`, `combo-utils.js`, `index.html`, `styles.css`, `sw.js`
- Verify: `tests/combo-utils.test.js`, `tests/multiplier-compact-layout.test.mjs`

**Interfaces:**
- Consumes: all completed changes from Tasks 1–3.
- Produces: one reviewed feature commit on `main` after the already committed design specification.

- [ ] **Step 1: Run the complete automated suite**

Run:

```bash
node --test tests/*.test.js tests/*.test.mjs
git diff --check
```

Expected: every test passes and `git diff --check` is silent.

- [ ] **Step 2: Inspect scope before committing**

Run:

```bash
git status --short
git diff --stat
git diff -- app.js combo-utils.js index.html styles.css sw.js tests/combo-utils.test.js tests/multiplier-compact-layout.test.mjs
```

Expected: changes are limited to multiplier behavior, compact layout, cache rotation, and their tests; no credentials, screenshots, generated downloads, or unrelated files are staged.

- [ ] **Step 3: Commit the verified feature**

Run:

```bash
git add app.js combo-utils.js index.html styles.css sw.js tests/combo-utils.test.js tests/multiplier-compact-layout.test.mjs
git commit -m "Add multiplier controls and compact match layout"
```

Expected: one new feature commit; `git status --short` is empty.

---

### Task 5: Push, Wait for GitHub Pages, and Smoke-Test Production

**Files:**
- No local file changes expected.

**Interfaces:**
- Consumes: verified commits on local `main`.
- Produces: deployed site at `https://liwendong1993-lgtm.github.io/football-research-workbench/`.

- [ ] **Step 1: Reconfirm branch and outgoing commits**

Run:

```bash
git status --short --branch
git log --oneline origin/main..HEAD
```

Expected: clean `main`; only the design, implementation-plan, and verified feature commits are ahead of `origin/main`.

- [ ] **Step 2: Push the verified commits**

Run:

```bash
git push origin main
```

Expected: push succeeds and advances `origin/main`.

- [ ] **Step 3: Check deployment readiness**

Poll the production HTML until it contains `20260720-compact1`:

```bash
curl -fsSL 'https://liwendong1993-lgtm.github.io/football-research-workbench/' | grep '20260720-compact1'
```

Expected: the version string is returned. Stop and report deployment failure if GitHub Pages reports an error rather than repeatedly pushing.

- [ ] **Step 4: Production smoke test**

Open the production URL with browser control, verify the one-line hero and two-line first match card at `390 × 844`, navigate to 方案, and check the console.

Expected: production loads `20260720-compact1`; there is no page-level horizontal overflow or new JavaScript error; the multiplier input is visible for saved schemes.

- [ ] **Step 5: Report completion evidence**

Report the final commit hashes, automated test count, verified viewports, production URL, and any limitation of Quark-specific testing. Do not claim native Quark success unless it was actually tested in Quark on Android.
