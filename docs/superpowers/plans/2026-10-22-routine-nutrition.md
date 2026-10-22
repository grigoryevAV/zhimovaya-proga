# Режим дня и питание — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Встроить в PWA «Жимовая прога» недельный режим дня, питание-ориентир с целью ккал/БЖУ, велосипед и подсказки по тренду веса.

**Architecture:** Новый модуль чистых функций `src/domain/routine/` (шаблон дня, велосипед, питание, тренд) и тонкий слой UI
`src/ui/routine/`, подключённый к «Сегодня», «План → Неделя» и «Настройкам». Данные — из существующего `AppData`
(профиль, вес, тренировки, план); в профиль добавляются два необязательных поля.

**Tech Stack:** TypeScript, React 19, Dexie (IndexedDB), Vitest + Testing Library (jsdom), Vite.

**Spec:** `docs/superpowers/specs/2026-10-22-routine-nutrition-design.md` (исполнитель читает её целиком).
Источник расписания и меню: `nedelnyy-grafik.md` в корне проекта.

## Global Constraints

- Не менять: `src/domain/calculations/*`, `src/domain/program/engine.ts`, `src/domain/program/definition.ts`, формат записей тренировок, `SCHEMA_VERSION`, `*.xlsx`, `tests/fixtures/*`, `scripts/*`.
- Новые npm-пакеты не ставить. Git в проекте нет — шаг «Commit» = проверка `npm test` (коммит не делать).
- Субботняя строка — только **«Личное время»** (не другие формулировки: репозиторий публичный).
- Цели (ккал): recomp — strength 2700 / bike 2450 / rest 2200; maintenance — 2870 / 2740 / 2480. Белок 190 (rest 185), жиры 72, углеводы = (ккал − 4·Б − 9·Ж)/4, округлить до целого.
- Поддержание автоматически в недели программы 4, 8, 12. Поправка `nutritionAdjustKcal` прибавляется к цели; итог зажат в [1980, 2980].
- Время строк после полуночи (`00:xx`, `01:00`) относится к тому же дню расписания (сравнивать как минуты + 1440 при часах < 9).
- UI: существующие токены `styles.css`, зоны нажатия ≥ 44 px, контраст ≥ 4,5:1, без горизонтальной прокрутки на 360 px.
- Тексты интерфейса — по-русски; строка-оговорка «Цифры — ориентир, не медицинская рекомендация».

## Review Focus

1. **После полуночи** (Вс 00:30) «Сейчас» должно показывать субботнее «Личное время», а не воскресный подъём → тест в Task 3.
2. **Нерегулярный вес** (несколько записей в день, пропуски дней) — среднее по записям окна, пропуски не ломают тренд → тест в Task 4.
3. **Программа пройдена или не начата** (`next` нет / неделя `P1`) — велосипед недели 3 / 1, строка силовой без списка упражнений → тест в Task 1 и Task 3.
4. **Поправка накопилась** (несколько «Применить») — цель не выходит за [1980, 2980] → тест в Task 2.
5. **Неделя 12 + «вес стоит»** — подсказка `stalled` не показывается (поддержание) → тест в Task 4.

---

### Task 1: Велосипед — `bike.ts`

**Files:**
- Create: `src/domain/routine/bike.ts`
- Test: `tests/routine.bike.test.ts`

**Interfaces:**
- Consumes: `WeekId` из `src/domain/program/definition.ts`.
- Produces:
  ```ts
  export type BikeWeek = 1|2|3|4|5|6|7|8
  export interface BikeDay { minutes: number; label: string }       // label: 'Z2 40 мин' | 'Z2 55 мин + 4×2 мин Z3 (отдых 3 мин)'
  export function bikeWeekFor(programWeek: WeekId | 'done'): BikeWeek
  export function bikeDay(week: BikeWeek, weekday: Weekday): BikeDay | null   // только 2 (Вт), 4 (Чт), 6 (Сб)
  export type Weekday = 1|2|3|4|5|6|7   // 1 = понедельник (экспортировать отсюда)
  ```

- [ ] **Step 1: Write the failing test** — `tests/routine.bike.test.ts`:
  - `bikeWeekFor`: `'P1'→1, 'P2'→1, 'T'→1`, `1..8→1..8`, `9→3, 10→5, 11→6, 12→8`, `'done'→3`.
  - `bikeDay(w, 2).minutes` для w=1..8: `[35,40,40,35,45,45,50,35]`.
  - `bikeDay(w, 4)`: `null` для w ∈ {1,2,4,8}; `25` для 3; `30` для 5,6,7.
  - `bikeDay(w, 6).minutes` (полная длительность субботы, по времени окончания графика): `[45,55,60,50,72,82,88,40]`; `bikeDay(5,6).label` содержит `'4×2 мин Z3'`, недели 6 — `'5×3'`, 7 — `'6×3'`.
  - `bikeDay(w, 1|3|5|7)` → `null`.
- [ ] **Step 2: Run** `npx vitest run tests/routine.bike.test.ts` — Expected: FAIL (модуль не найден).
- [ ] **Step 3: Implement** таблицу недель из раздела 8 графика и обе функции в `bike.ts`.
- [ ] **Step 4: Run** тот же тест — Expected: PASS.
- [ ] **Step 5: Run** `npm test` — все зелёные.

### Task 2: Питание — `nutrition.ts`

**Files:**
- Create: `src/domain/routine/nutrition.ts`
- Test: `tests/routine.nutrition.test.ts`

**Interfaces:**
- Consumes: `Weekday`, `BikeDay` (Task 1); `WeekId`.
- Produces:
  ```ts
  export type DayType = 'strength' | 'bike' | 'rest'
  export type NutritionMode = 'recomp' | 'maintenance'
  export type MealId = 'breakfast' | 'lunch' | 'post' | 'snack' | 'dinner' | 'evening' | 'hungry'
  export interface MealItem { food: string; amount: string; kcal: number }
  export interface Meal { id: MealId; time: string; title: string; items: MealItem[]; kcal: number; optional?: boolean; note?: string }
  export interface DayTarget { kcal: number; protein: number; fat: number; carbs: number; mode: NutritionMode; autoMaintenance: boolean; adjustKcal: number }
  export function dayTypeOf(weekday: Weekday, bike: BikeDay | null): DayType   // 1,3,5 strength; bike≠null → bike; иначе rest
  export function dayTarget(type: DayType, mode: NutritionMode, programWeek: WeekId | 'done', adjustKcal: number): DayTarget
  export function dayMenu(weekday: Weekday, type: DayType, mode: NutritionMode): Meal[]
  export const SUBSTITUTIONS: { protein: { food: string; kcal: number; protein: number; fat: number }[]; carbs: { food: string; kcal: number; carbs: number }[]; breakfasts: string[] }
  export const MEAL_NOTE = 'Ориентир: белок и гарнир можно менять на любой из списка замен'
  ```

- [ ] **Step 1: Write the failing test** — `tests/routine.nutrition.test.ts`:
  - `dayTarget('strength','recomp',5,0)` → `{ kcal: 2700, protein: 190, fat: 72, carbs: 323 }` ((2700 − 4·190 − 9·72)/4 = 323); `dayTarget('rest','recomp',5,0).protein === 185`.
  - `dayTarget(t,'recomp',w,0)` для w ∈ {4,8,12} равен целям maintenance и `autoMaintenance === true`; для w=5 — `false`.
  - Поправка: `dayTarget('bike','recomp',5,150).kcal === 2600`; `dayTarget('rest','recomp',5,-900).kcal === 1980`; `dayTarget('strength','maintenance',5,900).kcal === 2980`.
  - Меню ±5 %: для всех weekday 1..7 и обоих режимов (Чт — и с велосипедом, и без) `sum(meals без optional).kcal` в пределах 5 % от `dayTarget(type, mode, 5, 0).kcal`.
  - Состав по спецификации 3.3: в recomp strength `post` содержит хлеб `40 г`, ужин гречка `75 г`; recomp bike (Вт) `snack` без хлеба; recomp Сб `evening` — творог `150 г`, время `21:30`; recomp Вс ужин картофель `250 г`, есть `hungry` с `optional: true`; Пт `dinner.time === '19:00'`, `evening.time === '21:45'`.
  - `lunch` (предтренировочный обед) в strength одинаков в обоих режимах.
- [ ] **Step 2: Run** `npx vitest run tests/routine.nutrition.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** в `nutrition.ts`. Продукты и ккал — из графика (разделы 1, 2, 6, 7, 9); recomp-правки — таблица 3.3 спецификации.
  Ккал приёма = сумма `items`. Времена приёмов: будни 09:50 / 13:05 (Вт, Чт — 13:00) / 17:20 (strength) или 16:50 (bike) /
  19:45 / 22:15; Пт — ужин 19:00, вечерний 21:45; Сб — 09:50 / 14:15 / 17:00 / 19:30 / 22:30 (recomp 21:30);
  Вс — 09:50 / 13:30 / 17:30 / 19:30 / hungry. Чт без велосипеда — меню bike без `snack`, тип `rest`.
- [ ] **Step 4: Run** тот же тест — PASS.
- [ ] **Step 5: Run** `npm test` — все зелёные.

### Task 3: Шаблон дня — `template.ts` и `index.ts`

**Files:**
- Create: `src/domain/routine/template.ts`, `src/domain/routine/index.ts`
- Test: `tests/routine.template.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 2.
- Produces:
  ```ts
  // template.ts
  export type RoutineKind = 'work' | 'food' | 'strength' | 'bike' | 'family' | 'rest' | 'sleep' | 'personal'
  export interface RoutineItem { start: string; end?: string; title: string; detail?: string; kind: RoutineKind; meal?: MealId }
  export interface StrengthDay { day: 1 | 2 | 3; exercises: string[] }
  export function dayRoutine(weekday: Weekday, ctx: { bike: BikeDay | null; strength: StrengthDay | null; meals: Meal[] }): RoutineItem[]
  export function minutesOf(hhmm: string): number                     // 'HH:MM' → минуты; часы < 9 → +1440
  export function nowNext(items: RoutineItem[], prevItems: RoutineItem[], minutesNow: number): { now: RoutineItem | null; next: RoutineItem | null }
  // index.ts
  export interface DayPlan { weekday: Weekday; dayType: DayType; items: RoutineItem[]; target: DayTarget; menu: Meal[]; bike: BikeDay | null; bikeWeek: BikeWeek }
  export function planDay(weekday: Weekday, opts: { programWeek: WeekId | 'done'; strengthByDay: Partial<Record<1 | 2 | 3, string[]>>; mode: NutritionMode; adjustKcal: number }): DayPlan
  export function weekdayOf(date: Date): Weekday                        // getDay: 0 (вс) → 7
  ```

- [ ] **Step 1: Write the failing test** — `tests/routine.template.test.ts`:
  - Для weekday 1..7 × programWeek {1, 3, 'done'}: `planDay(...).items` — `minutesOf(start)` неубывает, `end` (если есть) ≥ `start`, последняя строка `{ start: '01:00', kind: 'sleep' }`.
  - Есть утренняя прогулка `09:35–09:50` в каждом дне.
  - Пт (5): ни одна строка не содержит `'ребёнк'` и `'Площадка'`; есть строка `start: '17:45', end: '19:00'`, `kind: 'family'`.
  - Пн (1): есть строка `'17:50'` с текстом «за ребёнком» и `'18:00'` «Площадка».
  - Сб (6): строка `{ start: '23:30', end: '01:00', title: 'Личное время', kind: 'personal' }`; велосипед `12:20–13:05` при programWeek 1 и `12:20–13:48` при 7.
  - Чт (4) при programWeek 1 — нет строки `kind: 'bike'`; при 3 — `15:30–15:55`.
  - Пн с `strengthByDay: { 1: ['Жим штанги лёжа', 'Подтягивания с отягощением'] }` — строка `15:15–16:45` `kind: 'strength'`, `detail` содержит оба названия; без данных — `title` 'Силовая, день 1', `detail` без «undefined».
  - `nowNext`: Пн, 12:20 → now «Перерыв» (12:15), next начинается в 12:25; Вс 00:30 (`minutesNow = 30`, `prevItems` = субботние) → now.title === 'Личное время'.
- [ ] **Step 2: Run** `npx vitest run tests/routine.template.test.ts` — FAIL.
- [ ] **Step 3: Implement** `dayRoutine` по разделам 1–7 графика и правкам спецификации 3.1 (строки еды берут время и название из `ctx.meals`); `planDay` собирает bikeWeek → bike → dayType → target → menu → items.
- [ ] **Step 4: Run** тот же тест — PASS.
- [ ] **Step 5: Run** `npm test` — все зелёные.

### Task 4: Тренд веса и предохранитель силы — `trend.ts`

**Files:**
- Create: `src/domain/routine/trend.ts`
- Test: `tests/routine.trend.test.ts`

**Interfaces:**
- Consumes: `BodyweightRow`, `WorkoutRow` (`src/storage/types.ts`); `setE1rm` (`src/domain/progression/analytics.ts`); `WeekId`.
- Produces:
  ```ts
  export interface TrendAdvice { kind: 'need-data' | 'ok' | 'too-fast' | 'stalled' | 'strength-guard'; deltaKcal: number; text: string; ratePerWeek: number | null }
  export function weightTrend(rows: BodyweightRow[], today: string): { avg7: number | null; prevAvg7: number | null; ratePerWeek: number | null }
  export function advice(rows: BodyweightRow[], workouts: WorkoutRow[], today: string, programWeek: WeekId | 'done'): TrendAdvice
  ```
  Окна: avg7 — записи с датой в [today−6, today], prevAvg7 — [today−13, today−7] (даты `YYYY-MM-DD`, локальные).

- [ ] **Step 1: Write the failing test** — `tests/routine.trend.test.ts` (вес строить хелпером по датам от `today = '2026-11-30'`):
  - 1 неделя записей → `need-data`, `deltaKcal 0`; нет записей за последние 7 дней → `need-data`.
  - Ровно −0,2 кг/нед → `ok`, `deltaKcal 0`, `text` содержит `'−0,2'`.
  - −0,5 кг/нед → `too-fast`, `+150`.
  - |Δ| < 0,1 в трёх подряд недельных окнах (4 недели данных) → `stalled`, `−150`; при `programWeek = 12` — не `stalled` (`ok`).
  - Несколько записей в один день и пропуски дней — среднее по записям, результат как у ровного ряда с тем же средним.
  - Жим: недельный лучший `setE1rm` по завершённым тренировкам `exerciseId 'bench'` за 2 последние завершённые недели оба < 0,975 × максимум двух предыдущих → `strength-guard`, `+200`, приоритетнее `too-fast`.
- [ ] **Step 2: Run** `npx vitest run tests/routine.trend.test.ts` — FAIL.
- [ ] **Step 3: Implement** `weightTrend` и `advice` (недели для силы — календарные недели Пн–Вс по `finishedAt`; «завершённые» = до недели `today`; учитывать `bench` и `squat`).
- [ ] **Step 4: Run** тот же тест — PASS.
- [ ] **Step 5: Run** `npm test` — все зелёные.

### Task 5: Профиль и настройки питания

**Files:**
- Modify: `src/storage/types.ts` (`ProfileRow`), `src/storage/repo.ts`, `src/ui/screens/Settings.tsx`
- Test: `tests/storage.test.ts`, `tests/ui.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // ProfileRow
  nutritionMode?: NutritionMode; nutritionAdjustKcal?: number
  // repo.ts
  export async function setNutritionMode(mode: NutritionMode): Promise<void>        // logChange 'settings'
  export async function applyNutritionAdvice(deltaKcal: number, reason: string): Promise<void>  // += , logChange 'settings'
  export async function resetNutritionAdjust(): Promise<void>
  ```

- [ ] **Step 1: Write the failing test** — в `tests/storage.test.ts`: `applyNutritionAdvice(150,'…')` дважды → `profile.nutritionAdjustKcal === 300`, в `changes` две записи `kind 'settings'`; `resetNutritionAdjust()` → 0; резервная копия без этих полей проходит `validateBackup` и импортируется (поля отсутствуют → режим `recomp`, поправка 0).
- [ ] **Step 2: Run** `npx vitest run tests/storage.test.ts` — FAIL.
- [ ] **Step 3: Implement** поля и функции; в «Настройках» — карточка «Питание»: сегмент «Мягкая рекомпозиция / Поддержание», строка «Поправка: +N ккал» с кнопкой «Сбросить» (disabled при 0), строки «Недели 4/8/12 — поддержание автоматически» и оговорка из Global Constraints.
- [ ] **Step 4: Run** тесты — PASS; `npx tsc -p tsconfig.json --noEmit` — без ошибок.

### Task 6: «Сегодня» — режим дня, цель, велосипед, подсказка

**Files:**
- Create: `src/ui/routine/useDayPlan.ts`, `src/ui/routine/NowNext.tsx`, `src/ui/routine/DayTimeline.tsx`, `src/ui/routine/DayTargetCard.tsx`, `src/ui/routine/TrendAdviceCard.tsx`
- Modify: `src/ui/screens/Today.tsx`, `src/ui/styles.css`
- Test: `tests/ui.test.tsx`

**Interfaces:**
- Consumes: `planDay`, `weekdayOf`, `nowNext` (Task 3), `advice` (Task 4), `applyNutritionAdvice` (Task 5), `AppData` (`active`, `next`, `engine`, `profile`, `bodyweights`, `workouts`).
- Produces: `useDayPlan(date: Date): DayPlan` — programWeek = `(d.active ? неделя активной : d.next?.week) ?? 'done'`; `strengthByDay[n]` = названия упражнений `d.engine.session(programWeek, n)` (для `'done'`/`T`/`P*` — пусто).
  `NowNext({ plan, prevPlan, now }: { …; now?: Date })` — обновление раз в 60 с через собственный `setInterval`.

- [ ] **Step 1: Write the failing test** — в `tests/ui.test.tsx` (375 px): на «Сегодня» есть текст `'Сейчас'`, цель дня с `'ккал'` и `'Б 19'`; карточка подсказки при 1 неделе веса — `'внесите вес'`; при подготовленном ряде −0,5 кг/нед — кнопка «Применить», нажатие → `profile.nutritionAdjustKcal === 150`, до нажатия — 0; на странице нет `NaN|undefined|Infinity`; «Начать тренировку» по-прежнему есть.
- [ ] **Step 2: Run** `npx vitest run tests/ui.test.tsx` — FAIL.
- [ ] **Step 3: Implement** компоненты (порядок на экране — спецификация, раздел 5) и подключение в `Today.tsx`; лента — 6 ближайших строк, «Весь день» раскрывает остальное; велодень — карточка «Велосипед: Z2 40 мин · разговорный темп, вентилятор»; силовой день — существующая карточка тренировки.
- [ ] **Step 4: Run** тест — PASS; `npm test` — все зелёные.

### Task 7: «План → Неделя»

**Files:**
- Create: `src/ui/routine/RoutineWeek.tsx`
- Modify: `src/ui/screens/Plan.tsx`, `src/ui/styles.css`
- Test: `tests/ui.test.tsx`

**Interfaces:**
- Consumes: `planDay` (Task 3), `bikeDay`/`bikeWeekFor` (Task 1), `SUBSTITUTIONS`/`MEAL_NOTE` (Task 2).
- Produces: маршрут `#/plan/routine` (в `PlanScreen`: `week === 'routine'` → `<RoutineWeek/>`); сегмент «Тренировки | Неделя» вверху «Плана» (`go('plan')` / `go('plan/routine')`).

- [ ] **Step 1: Write the failing test** — `#/plan/routine`: 7 строк дней (`'Пн'…'Вс'`), у Пн `'2700 ккал'` (recomp, неделя 1), строка «неделя велосипеда 1 из 8»; нажатие на «Сб» раскрывает расписание с `'Личное время'` и меню с `'Творог'`; без `NaN|undefined`; сегмент возвращает на «Тренировки».
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `RoutineWeek` (таблица велосипеда текущей недели Вт/Чт/Сб, список дней, раскрытие — расписание + меню + замены свёрнутым блоком).
- [ ] **Step 4: Run** — PASS; `npm test` — все зелёные.

### Task 8: Итоговая проверка

- [ ] **Step 1:** `npx tsc -p tsconfig.json --noEmit` — без ошибок.
- [ ] **Step 2:** `npm test` — все зелёные (прежние 86 + новые).
- [ ] **Step 3:** `npm run build` — успешно.
- [ ] **Step 4:** Ручная проверка в браузере на 360 и 390 px: «Сегодня», «План → Неделя», «Настройки» — без горизонтальной прокрутки, зоны нажатия ≥ 44 px, тёмная и светлая темы.
