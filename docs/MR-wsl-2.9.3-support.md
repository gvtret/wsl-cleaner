# MR: WSL 2.9.3 support & host containers cleanup (v1.9.0)

**Branch:** `feat/wsl-2.9.3-support`  
**Base:** `main` (или `security-hardening`, если MR идёт туда первым)  
**Версия:** `1.9.0`

---

## Summary

Добавляет поддержку **WSL 2.9.3** и **WSL Containers (`wslc`)**: очистка dangling-артефактов на хосте, карточка в Health Dashboard, отображение версии WSL. Исправляет Config Editor — experimental-ключи `.wslconfig` пишутся в `[experimental]`, а не в `[wsl2]` (устраняет предупреждения WSL об unknown keys). Включает регрессионные тесты для старых версий WSL без `wsl --version` и без `wslc`.

Также в ветке (если ещё не в `main`): security-hardening для WSL-команд, live-output logging, VHDX через реестр Lxss, retry при `Wsl/Service/0x8007274c`, фиксы `vscode-old-bins` / `git-gc`.

---

## Контекст

[WSL 2.9.3](https://github.com/microsoft/WSL/releases/tag/2.9.3) (pre-release) добавляет:

- **WSL Containers (WSLC)** — нативный `wslc` CLI (аналог docker prune на хосте)
- Режим сети **Consomme** (бывший VirtioProxy)
- Улучшения memory reclaim, virtiofs, стабильности shutdown/migrate

Пользователи **без** WSL 2.9 не должны заметить регрессий: новые фичи опциональны и отключаются через детект инструментов.

---

## Изменения

### WSL Containers (`wslc`)

| Компонент | Что сделано |
|-----------|-------------|
| `lib/wsl-ops.js` | `detectHostTools()`, `getWslHostInfo()`, `runHostCleanupTask()` с allowlist prune-команд |
| `renderer/tasks.js` | Задача `wslc-prune` (`host: true`, `requires: 'wslc'`) |
| `renderer/app.js` | Host-задачи выполняются один раз на хосте; merge host + distro tools |
| `cli.js` | Host tools + host task execution |
| Health UI | Карточка WSL Containers (running/stopped/total) |
| Status bar | `WSL 2 Ready — N distro(s) — v2.9.3.0` при наличии `wsl --version` |

### Config Editor (`.wslconfig`)

- `autoMemoryReclaim`, `sparseVhd` → секция **`[experimental]`** (по [MS Learn](https://learn.microsoft.com/en-us/windows/wsl/wsl-config))
- При загрузке читаются legacy-значения из `[wsl2]`
- Удалён **`pageReporting`** (нет в актуальной документации, вызывал unknown key)
- Добавлены режимы сети: **Consomme**, **VirtioProxy (legacy)**

### Прочие фиксы задач

- **`vscode-old-bins`** — `find -printf` + `cut` вместо `awk` (ошибка quoting через `bash -lc`)
- **`git-gc`** — пропуск пустых путей в цикле `find`

### Версионность и документация

- `package.json` → **1.9.0**
- `CHANGELOG.md` — секция 1.9.0
- `README.md` — WSLC, Consomme, experimental-секция
- `locales/en.json` — новые ключи (остальные языки: `npm run translate`)

---

## Обратная совместимость

| Сценарий | Поведение |
|----------|-----------|
| Нет `wsl --version` (старый inbox WSL) | `checkWsl()` OK, `version: null`, UI без номера версии |
| Нет `wslc` | `wslc-prune` скрыта/disabled; `runHostCleanupTask` skip с `ok: true` |
| Legacy `.wslconfig` с experimental в `[wsl2]` | Читается; при Save — перенос в `[experimental]` |
| Docker без daemon | `docker-prune` по-прежнему skip (exit 0) |

Покрыто тестами: `tests/wsl-compat.test.js`, `tests/wsl-config.test.js`, `tests/wsl-host.test.js`.

---

## Тесты

```bash
npm test
```

**224 теста**, в т.ч.:

- `wsl-compat.test.js` — старый WSL без version/wslc
- `wsl-config.test.js` — секции INI
- `wsl-host.test.js` — парсинг версий 2.0.x / 2.7.x / 2.9.x
- `tasks.test.js` — регрессии команд задач
- `security.test.js` — allowlist `runHostCleanupTask`

---

## Test plan (ручная проверка)

### Уже проверено

- [x] **Status bar**: `WSL 2 Ready — N distro(s) — v2.9.3.0`
- [x] **Health → System Info**: WSL Version отображается (не `--`)
- [x] **Health → WSL Containers**: карточка видна (0/0/0 — OK)
- [x] **Health → авто-обновление**: версия не сбрасывается в `--` через ~15 с
- [x] **Config → Experimental**: `sparseVhd` / `autoMemoryReclaim` в `[experimental]`
- [x] **Config → Networking**: Consomme / VirtioProxy сохраняется
- [x] **Legacy config**: experimental-ключи переезжают из `[wsl2]` в `[experimental]`
- [x] **`vscode-old-bins`**: OK в Simple Clean (без ошибки awk)
- [x] **`git-gc`**: OK — `Git compaction complete` в Live Output

### Новое в 1.9.0

| Что | Как проверить | Статус |
|-----|----------------|--------|
| **`wslc-prune`** | Settings → включить → Clean. В Live Output — prune на хосте, без падения | ⏳ после перезапуска GUI (fix `-f` → без флага) |
| **Config → Experimental** | `sparseVhd` / `autoMemoryReclaim` → Save → `%UserProfile%\.wslconfig` → `[experimental]` | ✅ |
| **Config → Networking** | Consomme / VirtioProxy → Save | ✅ |
| **Legacy config** | Ключи из `[wsl2]` → `[experimental]` после Save | ✅ |

### Остальное

- [x] **Simple mode**: одна кнопка Clean завершается без ошибок (Clean & Compact ~10 мин, `WSL restarted` в логе)
- [x] **Старая WSL / без wslc**: приложение стартует, Clean работает, `wslc-prune` недоступна (покрыто автотестами)
- [x] **Config Editor**: Save + unknown keys — OK (ручная проверка)
- [x] `npm run build` → `dist/WSL Cleaner Setup 1.9.0.exe`

---

## Файлы (основные)

```
lib/wsl-ops.js          # version, host tools, wslc stats, runHostCleanupTask
main.js, preload.js     # IPC
cli.js                  # CLI host tasks
renderer/app.js         # UI, config sections, cleanup loop
renderer/tasks.js       # wslc-prune, command fixes
renderer/index.html     # Health wslc card, config options
locales/en.json         # i18n (en only)
tests/wsl-*.test.js     # новые регрессии
CHANGELOG.md, README.md, package.json
```

---

## Перед merge

1. **Не коммитить** `.claude/settings.local.json` (локальные настройки IDE)
2. Закоммитить изменения 1.9.0 на `feat/wsl-2.9.3-support`
3. `npm run translate` — если нужны все локали в релизе
4. Убедиться, что CI зелёный (`npm test`)

---

## Предлагаемый title

```
feat: WSL 2.9.3 support, wslc cleanup, and .wslconfig experimental sections (v1.9.0)
```

## Предлагаемое описание для GitHub (краткое)

```markdown
## Summary
- Add WSL Containers (`wslc`) prune task and Health dashboard card (WSL 2.9+)
- Fix `.wslconfig` editor: write experimental keys to `[experimental]`; add Consomme networking mode
- Show WSL version in status bar and Health; graceful fallback on older WSL
- Fix `vscode-old-bins` awk quoting regression and `git-gc` empty path logs
- Bump version to 1.9.0; 224 tests including backward-compat suite

## Test plan
- [x] Status bar and Health show WSL version; auto-refresh does not reset to `--`
- [x] Health → WSL Containers card visible (WSL 2.9.3+)
- [ ] `wslc-prune`: Advanced → Clean — host prune in log, no failure
- [ ] Config Editor: `sparseVhd` / `autoMemoryReclaim` saved under `[experimental]`; Consomme networking persists
- [ ] Legacy `[wsl2]` experimental keys migrate to `[experimental]` on Save
- [ ] `npm test` (224 passing)
- [ ] Clean & Compact on WSL 2.9.3 — `vscode-old-bins` succeeds
- [ ] App works on WSL without `wslc` (task hidden, no errors)
```
