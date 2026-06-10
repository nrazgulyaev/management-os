# cc-functional-handoff — полный инвентарь пакета (2026-06-10)

> Машинный обход всех **219 файлов** пакета `cc-functional-handoff/` (10 агентов, 397 проверок):
> каждый HTML вскрыт, экраны перечислены, для каждого мока проверено — есть ли промпт,
> строка в очереди и живой роут. **Этот файл — git-tracked манифест пакета**: сам пакет
> в `.gitignore`, поэтому без этого документа сборочные сессии его «не видят».
>
> Статусы live: `built` — роут существует и близок к моку · `partial` — есть часть/в другом
> виде · `missing` — нет ничего · `n/a` — не экран (хаб/токены/промпт).

## 0. Главные числа

- **73 кабинет-мока** в `cabinets/` (9 групп) + Auth Suite + 16 корневых моков + 8 шаблонов-примитивов.
- **59 промптов** (10 функциональных блоков + 49 pixel) и **2 очереди — обе 100% `todo` и обе ВРУТ**: блоки 01/02/05/09 фактически построены, 03/04/06/07/08/10 — частично; pixel-волна закрыла ~62% суб-экранов. Ledger-цикл из RUNBOOK не запускался ни разу.
- **9 интерактивных «Live»-прототипов** (самое ценное — поведенческие контракты) **не имеют ни одного промпта** — описаны только внутри `ПОЛНЫЙ-ПРОМПТ.md`. Ещё 3 файла (`bookings-calendar.html`, `owner-topnav.html`, `mobile-qa.html`) не упомянуты вообще нигде.
- **При «супersession» супер-админа потеряны целые поверхности**: support-inbox (нигде), billing/refunds/dunning (нигде), plans-редактор, rollout-матрица фич-флагов, per-org AI-spend матрица — их нет ни в актуальных моках, ни в промптах, ни в живом коде.
- Контакт-лист `All Designs.html` («все экраны одним листом») **дрейфанул**: в нём нет ни одного из 10 функциональных прототипов, 9 гранулярных dev-экранов, полного Owner Portal, Platform Admin Live и System Health. Полный индекс — только объединение пер-системных листов.

---

## 1. cabinets/new — 11 новых кабинетов

| Мок | Тип | Live | Промпт / очередь | Примечание |
|---|---|---|---|---|
| mgmt-workspace.html | pixel | **built 5/5** | mgmt/14 · #17 todo | /dashboard: AttentionFeed, today-strip, AgentActivityCard, CabinetMap — с комментами-ссылками на мок |
| mgmt-documents.html | pixel | partial | mgmt/15 · #18 | folders/timeline появились после аудита; upload — legacy; mobile-фид нет |
| mgmt-inventory-procurement.html | pixel | partial 3/6 | mgmt/16 · #19 | hero DS, PO-detail с FLOW-степпером; /inventory/calendar и 1-tap reorder нет |
| mgmt-owner-intelligence.html | pixel | **built 2026-06-10** (4.5/5) | mgmt/17 · #20 | hero per-owner + tier-matrix + cohort+LTV + drill-in [ownerId] (PR feat/pixel-owner-intelligence-depth); остался только 06:00-push |
| mgmt-utilities.html | pixel | partial 1/5 | mgmt/18 · #21 | hero DS; rollup-варианты и drill-in — нет/legacy |
| dev-workspace.html | pixel | partial 1/4 | dev/12 · #33 | лендинг DS; 9-ролевой свитчер и /workspace/project/[id] нет |
| dev-executive.html | pixel | **missing 0/5** | dev/13 · #34 | роута /executive нет вообще — самый большой провал группы |
| dev-marketing.html | pixel | partial 1/6 | dev/14 · #35 | лендинг DS; campaign-detail/kanban/attribution legacy; /performance нет |
| dev-warehouse.html | pixel | partial 1/6 | dev/15 · #36 | лендинг DS упрощённый; receive/[po], stock, picks, movements, bins нет |
| **Keystone.html** | **live-прототип** | partial | prompts/08 · блок 1 | setup-wizard и cabinet-gate есть; ролевой логин, RBAC-матрица 14×5, общее ядро — нет |
| **Documents Live.html** | **live-прототип** | partial | **НЕТ ПРОМПТА** | ядро прототипа — «скормить документ AI-агенту в knowledge base» — не построено |

## 2. cabinets/mgmt-p1 + p2 — 15 моков

| Мок | Тип | Live | Промпт / очередь | Примечание |
|---|---|---|---|---|
| bookings.html | live-прототип | built | mgmt/01 · #04 | /dashboard/bookings + [id]/new/calendar/rates/sync |
| **bookings-calendar.html** | live-прототип | partial | **НИГДЕ НЕ УПОМЯНУТ** | календарь built, но нет 7/14/30/мес-переключателя, prev/next/today, ховер-тултипа |
| finance.html | pixel («gold standard») | built | mgmt/02 · #05 | statements + payouts |
| **Finance Live.html** | **live-прототип** | partial | **НЕТ ПРОМПТА** | единого P&L-экрана с CRUD транзакций в mgmt нет |
| **Owner Statements Live.html** | **live-прототип** | built | **НЕТ ПРОМПТА** | statements/[id]/new + disputes + payouts есть; lifecycle-контракт никем не отслежен |
| operations.html | live-прототип | built | mgmt/03 · #06 | + tasks/housekeeping/maintenance/turnovers |
| owners.html | pixel | built | mgmt/04 · #07 | + owner-intelligence |
| **AI Inbox.html** | **live-прототип** | partial | prompts/03 | concierge + AI-hub есть; омниканального 3-pane и no-code билдера агентов нет |
| **Channel Manager.html** | **live-прототип** | built | prompts/06 | /channels/manager: ARI-grid, conflict-resolver, sync-health |
| **Channels Live.html** | **live-прототип** | built | mention-only | connect-wizard построен |
| **Dynamic Pricing Live.html** | **live-прототип** | built | **НЕТ ПРОМПТА** | /pricing + rule-sets/calendar/channel-push/logs |
| channels.html | pixel | built | mgmt/05 · #08 | |
| concierge.html | live-прототип | built | mgmt/08 · #11 | workspace с whatsapp/omnichannel |
| dynamic-pricing.html | pixel | built | mgmt/06 · #09 | comp-set не верифицирован |
| front-office.html | live-прототип | built | mgmt/07 · #10 | arrivals/checkin/departures/in-house |

## 3. cabinets/mgmt-p3 — 7 моков + инфраструктура

| Мок | Тип | Live | Промпт / очередь | Примечание |
|---|---|---|---|---|
| Availability and Intelligence.html | pixel | partial | mgmt/13 · #16 | роуты все есть; pixel-pass не применён |
| Distribution and Payments.html | pixel | partial | mgmt/10 · #13 | direct-bookings/payments/service-fulfilment/integrations есть |
| Guest Stays.html | pixel | partial | mgmt/09 · #12 | все 4 кластера есть; глубокие страницы legacy |
| **Integrations Hub.html** | **live-прототип** | built | prompts/10 | 3-tier trust badge + честный test реализованы (PR #108–110) |
| **Integrations.html** (OTA-wizard) | **live-прототип** | partial | mention-only | manage-drawer/pause/listing-mapping не верифицированы |
| Portfolio.html | pixel | partial | mgmt/11 · #14 | villas/projects/shares есть; pixel todo |
| Security and System.html | pixel | partial | mgmt/12 · #15 | security/jobs/notifications/audit/settings есть; pixel todo |
| chrome.css / p24-primitives.css | токены | **built** | 00-MASTER | p24 портирован **байт-в-байт** (751/751 строк); chrome.css → tokens.css с мелким дрейфом (--inverted-*) |
| design-canvas.jsx | тулинг | n/a | — | авторский канвас-редактор артбордов, не продуктовый мок |

## 4. cabinets/dev-p1..p3 — 16 моков

| Мок | Тип | Live | Промпт / очередь | Примечание |
|---|---|---|---|---|
| Accounting.html | live-прототип | partial | prompts/05 | GL есть (0122/0136), но англ., без журнала проводок, спрятан, пустой без seed:gl-coa |
| Coordination.html | live-прототип | partial | prompts/04 | построен 06-09; зарыт в «Knowledge base», требует растровый чертёж, без сидов |
| **Estimator.html** | live-прототип | **built** | prompts/09 | /boq/takeoff: 610-строчный workbench + DrawingViewer + полигоны |
| **Projects Live.html** (захватки) | **live-прототип** | partial | **НЕТ ПРОМПТА** | захватки/ползунки/Cut-zone — нет совсем; вехи есть без dependency-гейта |
| boq-qs.html | live-прототип | built | dev/03 · #24 | inline-edit parity не верифицирован |
| cfo.html | live-прототип | partial | dev/02 · #23 | расщеплён: /cfo (рескин, waterfall захардкожен, не в сайдбаре) + /finance/transactions |
| procurement.html | live-прототип | partial | dev/04 · #25 | 4-ролевой request-loop FSM не верифицирован |
| projects.html | pixel | built | dev/01 · #22 | [slug] + milestones/rfis/change-orders/permits/risks |
| **Buyer Money.html** | live-прототип | partial | prompts/02 | 3×404 закрыты (payments/documents/contract); PSP отложен до launch — manual mark-paid |
| investors.html | live-прототип | partial | dev/06 · #27 | расщеплён по 4 роутам; единой консоли waterfall нет |
| sales.html | live-прототип | partial | dev/05 · #26 | sales+installments+buyers есть; reminder-loop не верифицирован |
| site-supervisor.html | live-прототип | partial | dev/07 · #28 | site-reports + field есть; mobile capture-loop не верифицирован |
| Dev Contracts.html | pixel | built | dev/09 · #30 | contracts/invoices/discounts/commitments |
| Dev Finance.html | pixel | built | dev/08 · #29 | cfo/cashflow/profitability/banking/tax-reports |
| Dev Knowledge and Docs.html | pixel | built | dev/10 · #31 | knowledge/drawings/method-statements/materials |
| Dev Ops.html | pixel | built | dev/11 · #32 | marketing/inbox/project-cycle/productivity |

## 5. cabinets/owner-p1 + auth — 14 файлов

| Мок | Тип | Live | Промпт / очередь | Примечание |
|---|---|---|---|---|
| 01-home … 06-documents | pixel ×6 | **built** | owner/01–06 · #37–42 | весь owner-портал жив на DS |
| 07-settings.html | pixel | partial | owner/07 · #43 | живёт на /owner/preferences (не /settings) |
| **Owner Portal.html** (единый React-апп) | **live-прототип** | partial | **НЕТ ПРОМПТА** | per-line «спросить → тред в Inbox», repair-request с виллы, payout-request тред, 2FA-гейт — не построены |
| **owner-topnav.html** | template | partial | **НИГДЕ НЕ УПОМЯНУТ** | owner-shell несёт 7 пунктов, но 1-й назван «Portfolio» вместо «Home» |
| Auth Suite.html (+4 jsx/css) | live-прототип | partial | auth/01 · #45 | AuthShell на login/signup/forgot/reset/mfa; admin-bootstrap и investor/buyer-логины БЕЗ AuthShell |

## 6. cabinets/super-admin — 15 файлов (⚠️ потери при супersession)

Промпт `platform/01-platform-console.md:36` объявил черновики 01–10+hub «superseded» — но Platform Console покрывает НЕ всё. **Потеряно безвозвратно** (нет ни в актуальных моках, ни в промптах):

| Черновик | Live | Что потеряно при супersession |
|---|---|---|
| 01-organizations | partial | org-suspend flow (impersonation есть) |
| 02-users | partial | в Console нет экрана Users вообще (живой /platform/users есть); reset-MFA flow |
| 03-plans | partial (49 строк) | редактор планов + мост план→фич-флаги |
| **04-billing** | **missing** | **очередь failed-payments, леджер инвойсов, refund, dunning — НИГДЕ** |
| 05-feature-flags | partial | rollout-матрица + scheduled rollout |
| **06-support-inbox** | **missing** | **вся поверхность платформенной поддержки — НИГДЕ** |
| 07-audit-log | partial | before/after diff одного действия + chain-of-evidence |
| 08-system-health | partial | сетка статусов сервисов + channel-sync-errors drill (наследник — System Health.html) |
| 09-ai-overview | partial | **per-org AI-spend матрица + троттлинг** (Console Usage явно отсылает в Dev OS) |
| 10-mobile | unknown | мобильный триаж failed-payments + reset-MFA |

Актуальное поколение: **Platform Console.html** (#44 — 5 роутов built, но `(platform-app)/layout.tsx` ставит `data-product="management"` → тёмная платформенная тема НЕ рендерится); **Agent Studio.html** (#44a — built, нет вкладки Sources&triggers); **Platform Admin Live.html** (**НЕТ ПРОМПТА** — поведенческий контракт никем не отслежен); **System Health.html** (prompts/07 — /platform/system-health 574 строки, без delivery-метрик и one-click restart).

## 7. templates/ + дизайн-система — фундамент построен

| Шаблон | Live-эквивалент |
|---|---|
| mobile-tabbar | ✅ dashboard/mobile-tabbar.tsx + development/mobile-tabbar.tsx, смонтированы в оба шелла |
| empty-state | ✅ ui/empty-state.tsx + variants |
| pagination | ✅ pager-numbered/-loadmore/-cursor |
| list-filter | ✅ list-page + filter-bar + facet-panel + bulk-bar + saved-views |
| detail-page | ✅ dashboard/detail/* + detail-page-hero |
| modal | ✅ ui/modal.tsx — импортируется из 63 файлов |
| ai-agent | ✅ ai-agents/* + /dashboard/ai |
| cmd-k | ✅ command-palette, смонтирован в root layout |

`design-system.html`/`chrome.css` → tokens.css (Layer B, 37 data-product блоков). `ds-2.4-primitives.html`: все 5 примитивов (ChannelGrid, PricingCurve, StoryboardLog, PipelineBoard, WaterfallChart) построены, но живут в feature-папках, не в `ui/primitives/`. `Паттерны-Состояния`: state-kit построен (7 компонентов + error.tsx ×5 зон) — **queue говорит todo, это ложь**.

## 8. Корневые моки + mobile

- `management.html` / `development.html` / `subscription.html` — **лендинги built** (/products/*, public landing) — промптов нет, в очередях нет.
- `Guest Stay Portal.html` (#47) / `Investor Portal.html` (#48) — scope-gated; роуты есть, pixel-волна не начата; investor-portal до 06-09 не получал DS-CSS.
- **9 mobile-pass файлов + mobile-qa.html**: единственная очередь — item #46 (todo). Шелл-уровень (таббары) есть; **ни один 390px-pass по кабинетам не верифицирован**. mobile-qa.html не упомянут нигде.

## 9. Навигационный и аналитический слой

- `index.html` / `Designs by System` / 11 контакт-листов — iframe-навигация (нужен preview-token). Счётчики на карточках дрейфуют от содержимого листов.
- **`All Designs.html` неполон** — единственный полный индекс это объединение пер-системных листов.
- 5 русских аналитических карт: `Карта покрытия функций` (134 действия без UI) — зеркалирована в PLATFORM-AUDIT §G и отработана PR #111–118 ✅; `Функциональный аудит` — дух перенесён в FUNCTIONAL-DEPTH-AUDIT ✅; **`Функциональная архитектура` (7 слоёв, 4 сквозных потока) и `Функциональный статус` (поведенческий контракт per-menu-item) зеркала в docs/ НЕ имеют** — их содержимое не участвует в планировании репо.
- `feature-inventory/` — колонки статусов **пустые**, diff-цикл не выполнялся. `_ground-truth-2026-05-29.md` — устарел на 12 дней (до GL/takeoff/coordination/security-волн).

## 10. Сводный список «невидимых» артефактов (что чинить процессом)

**Нет промпта и нет очереди (12):** Projects Live.html · Finance Live.html · Owner Statements Live.html · Dynamic Pricing Live.html · Documents Live.html · Owner Portal.html · Platform Admin Live.html · Channels Live.html (mention-only) · Integrations.html (mention-only) · bookings-calendar.html · owner-topnav.html · mobile-qa.html.

**Очереди врут (всё `todo`, но):** блоки 01/02/05/09 built · 03/04/06/07/08/10 partial · pixel ~62% закрыт. Ledger-цикл RUNBOOK ни разу не исполнялся.

**Контент потерян при супersession:** billing-консоль · support-inbox · plans-редактор · rollout-матрица флагов · per-org AI-spend.

**Системные дыры:** пакет в .gitignore (агенты/CI/свежий клон не видят) · Platform Console рендерится без тёмной темы (data-product=management) · investor/buyer-логины без AuthShell · ни одного visual-baseline для кабинетов.

## 12. Волна 2 выполнена (2026-06-10, PR #208–#210)

| PR | Что закрыто |
|---|---|
| **#208** | CFO transactions полный паритет (все колонки мока оказались с реальным storage; Profit KPI, чипы, поиск, breakdown-rail + баг-фикс Tax-статуса); **Налоги ID + миграция 0164** (PPN Keluaran/Masukan/netto + PPh, DJP-референсы, File taxes, закрытие периода блокируется неподанными декларациями, cron больше не перезаписывает поданные); warehouse gap-fill (поиск стока, поиск движений, живая занятость бинов — 0165 не понадобилась) |
| **#209** | Keystone: матрица «кто что видит» (15 ролей × 22 кабинета, подсветка своей роли, исправлен lockout); ролевой dev-лендинг «Acting as» (pm/cfo/warehouse/supervisor — честно из своих запросов); project drill-in углублён (budget/вехи/координация + карта суб-роутов); marketing /performance + первый UI над recordCampaignCost |
| **#210** | Front-office: watch с legacy на DS, чек-ин на вертикальный 4-степпер (CSS существовал, потребителей не было), KPI-стрипы на 5 суб-страницах; pricing rule-sets: редактор завершён (6 типов правил, lifecycle, archive, preview-link), calendar/channel-push/logs на DS; documents: legacy флаг-only «Feed to AI» заменён на реальный поток, ✦-кнопка на строках |

**Честные пропуски волны 2:** Coretax-файл e-Faktur, NPWP-валидация, bukti potong (нужен отдельный дизайн-пасс) · revenue-колонка в rep-скорборде (нет колонки) · per-rule enable/disable и drag-reorder приоритета (нет экшенов) · A/B креативы кампаний (нет таблицы) · feed-to-AI в форме загрузки (createDocumentAction redirect'ит без id — нужен 1 правка в features/documents/actions.ts) · cookie-персист роли · capacity-гейджи бинов.

**Остаток (волна 3):** billing-консоль + support-inbox (сначала дизайн — superseded-моки как старт) · investor/guest pixel-волны (#47/#48) · mobile 390px pass (#46) · оставшиеся present-not-pixel глубокие страницы (direct-bookings detail, guest-services deep, settings deep и пр.) · visual-baselines кабинетов · 06:00 push.

## 13. Волна 3 выполнена (2026-06-10, PR #211–#213)

| PR | Что закрыто |
|---|---|
| **#211** | Investor-портал: реально оставшиеся пиксель-дыры (wallet withdraw/reinvest на award-язык, forecasts на PortalKpi, знаковые суммы в леджерах) — большинство LP-экранов уже было закрыто pixel-блицем, аудит 3/13 устарел |
| **#212** | **41 глубокая страница** legacy→DS с нулевым изменением поведения: settings (9), security/jobs/notifications (12), guest-services/journey/ai (20) |
| **#213** | **Support-inbox** (потерян при супersession; миграция 0165): org-сторона /dashboard/settings/support + платформенная /platform/support с lifecycle open→pending→closed, всё аудируется; upload→AI select на форме документов (createDocumentAction теперь возвращает id); вычищен фейковый setDocumentAiFedAction; orphan-cleanup с верификацией (2 из 3 кандидатов оказались живыми — отчёты предыдущих агентов исправлены) |

**Миграции волны 3:** 0165 (support_threads/support_messages) — выполнить `npm run db:migrate`.

**Осталось (волна 4 / отдельные решения):** billing-консоль (нужен PSP/Stripe — отложено до launch по решению фаундера) · guest pixel-волна #47 (по аудиту 11/12 уже ок) · mobile 390px pass + visual-baselines (нужен запущенный браузер/стейджинг) · 06:00 push (notification-инфра) · roles/matrix внутренний рестайл · Coretax-экспорт/NPWP/bukti potong (дизайн-пасс).
