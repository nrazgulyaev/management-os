# Founder E2E Playbook — настройка и сквозной прогон платформ (2026-06-11)

> Построено статической трассировкой «кнопка → server action → zod/гейт → запись в БД» по всем
> трём платформам (4 агента, ~500 проверок). Каждый шаг помечен честно: ✅ работает end-to-end ·
> ⚠️ работает с оговоркой/обходом · ⛔ сегодня не работает (и почему). Источник — verification run.

## 0. Предусловия среды (ENV + миграции)

Без этого блока половина сценария деградирует в dry-run/заглушки.

| Переменная | Зачем | Без неё |
|---|---|---|
| `DATABASE_URL` | БД | ничего не пишется |
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` | логин | «Supabase Auth not configured» |
| `SUPABASE_SERVICE_ROLE_KEY` | signup, приём приглашений, агенты, Vault | signup/accept падают |
| `ADMIN_BOOTSTRAP_SECRET` (≥16) | 2-й+ супер-админ | первого можно без него |
| `RESEND_API_KEY` + `RESEND_FROM_EMAIL` + **`EMAIL_DRY_RUN=0`** + `APP_BASE_URL` | письма (инвайты, «выписка отправлена») | **по умолчанию dry-run: письма НЕ уходят, хотя UI говорит «sent»** |
| `NOTIFICATIONS_DRY_RUN=0` + `CRON_SECRET` | доставка in-app/email уведомлений и кода гостю | очередь висит недоставленной |
| `ANTHROPIC_API_KEY` (+ `AI_DRY_RUN=0`) или пер-org ключ | живые AI-ответы | офлайн-режим/заглушки |
| `OPENAI_API_KEY` | эмбеддинги knowledge-базы агентов | загрузка знаний падает |
| `STAY_LINK_KMS_SECRET` | шифрование AI/Wi-Fi кредов | Configure агента и reveal Wi-Fi откажут |
| `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_SMS/FROM_WHATSAPP` | SMS/WhatsApp | каналы недоступны (известно, отложено) |

Затем: `npm run db:migrate` (миграция 0071 сеет `ARCONIQUE_DEFAULT` — без неё bootstrap вернёт `arconique_default_org_missing`). Один раз: `npm run setup:agent-storage` (бакет для knowledge-базы).

---

## 1. Платформа настройки (тёмная, `/platform/**`) — только super_admin

1. **Получить супер-админа.** Войти на `/login` (Supabase-сессия) → открыть `/setup/admin-bootstrap`. Пока ни одного супер-админа нет — секрет пустой, кнопка **Bootstrap super-admin**. ✅
2. **Войти в консоль** `/platform` (любой домен — один app, тёмная тема). Sidebar: Organizations · Support · Revenue · Usage · Plans · Billing · AI agents · Feature flags · Users · Audit · System health. ✅ гейт корректен (super_admin по `user_roles`).
3. **Организация управляющей компании.** ⚠️ Кнопки «создать организацию» в консоли **нет**. Орг появляется только через публичный `/signup` (создаёт орг + super_admin + trial), либо сидом, либо legacy `POST /api/onboarding/start`. Для теста проще всего: **зарегистрироваться на `/signup`** (это и даёт вам орг + права).
4. **Продукты (mgmt/dev) и план.** ⛔ Переключения продуктов у существующей орг в UI нет (фиксируется на signup). ⛔ Привязки плана к орг из консоли нет → у орг из `/signup` нет строки `org_subscriptions`, поэтому на `/platform/[orgCode]` кнопки **Extend trial / Mark comp / Cancel** не работают, а **AI-карточки в кабинете показывают «Not in plan»**. Обход для теста: сид с подпиской (`seed:arconique-demo`) или legacy onboarding-API.
5. **Plans каталог** `/platform/plans → + New plan` ✅ (создаёт каталог, денег не списывает).
6. **AI-агенты платформы** `/platform/agents → + New agent`: provider **openai/anthropic** (google не поддержан), модель, ключ (в Supabase Vault), промпт. Вкладки: Config (Rotate/Save key — без ключа агент даст 503), Subscriptions (Enable по орг), Knowledge (PDF/DOCX — нужен `OPENAI_API_KEY` + бакет), Test chat (только super_admin), Runs. ✅
7. **Флаги / Поддержка / Здоровье / Аудит** — `/platform/feature-flags`, `/platform/support`, `/platform/system-health` (Dispatch/Replay/Clear-lock), `/platform/audit` — всё ✅.
8. **Биллинг** `/platform/billing` — read-only (pre-PSP) ✅ честно. ⛔ «Open support ticket» на карточке орг — мёртвый `mailto:example.com`.

---

## 2. Management — настройка компании, роли, AI, виллы, стоимости

**Роли — ВАЖНО: две несвязанные системы.**
- **(A) Внутренние роли** (`user_roles` → дают доступ к 22 кабинетам `/dashboard`): super_admin, director, operations_manager, property_manager, booking_manager, revenue_manager, finance_manager, accountant, concierge, housekeeping_supervisor, housekeeper, technician, procurement_manager, security, sales_manager, investor_owner/viewer, agent. ⛔ **Назначаются ТОЛЬКО скриптами/бутстрапом — UI-кнопки выдать их нет.**
- **(B) Кабинет-роли инвайта** (`app_user_roles` → кабинеты `/development-os/cabinets/*`): admin, executive_ceo, cfo_accountant, project_manager, qs_analyst, procurement_manager, warehouse_manager, site_supervisor, sales_manager, marketing_staff.
- ⛔ **Связи между (A) и (B) нет** — приглашённый сотрудник получит кабинет Dev-OS, но в `/dashboard` у него **ноль кабинетов**. Это главный пробел: «уборщика с доступом к доскам уборки» через приглашение сегодня не завести.

**Маппинг под русские названия** (есть в инвайте / только скриптом):
бухгалтер → `cfo_accountant`✅ или `accountant`(скрипт) · сметчик → `qs_analyst`✅ · прораб → `site_supervisor`✅ · снабженец → `procurement_manager`✅ · кладовщик → `warehouse_manager`✅ · РМ → `project_manager`✅ · директор → `executive_ceo`✅ / `director`(скрипт) · продажи → `sales_manager`✅ · маркетинг → `marketing_staff`✅ · **уборщик → `housekeeper`(скрипт)** · старшая по уборке → `housekeeping_supervisor`(скрипт) · техник/бассейнщик → `technician`(скрипт) · консьерж → `concierge`(скрипт) · охрана → `security`(скрипт) · менеджер броней → `booking_manager`(скрипт) · ревеню → `revenue_manager`(скрипт).

**Шаги:**
1. **Онбординг** `/dashboard/setup` → Start setup → 3 шага (виллы → проекты → команда). ✅ (⚠️ бейджи «N added» считают по всей базе, не по вашей орг).
2. **Комплекс** `/dashboard/projects → New complex`: имя, локация, типы вилл (имя, кровати, кол-во, **Rate/night $**) → «Create complex + N villas». ✅ создаёт проект + виллы с ценами и кодами.
3. **Вилла** `/dashboard/villas → Add villa`: проект, unit code, slug, статус, спальни/санузлы, модель управления, **nightly rate USD** → Create. ✅ Изменить: `/villas/<id>/edit → Save`. ⛔ **Фото загрузить нельзя** (поля нет; фото только сидом `seed:storage-photos`). ⛔ кнопка **Filter** мёртвая; ссылка **Back to project** ведёт в 404 (ходите через меню).
4. **Цены за ночь (правила)** `/dashboard/pricing/rule-sets → New rule set`: scope global/project/villa, **Base rate в МИНОРНЫХ единицах** (50000 = $500.00). Проверка: `/pricing/quote`. ✅ (⛔ пуш в каналы — заглушка).
5. **Команда** `/dashboard/settings/team` (⚠️ из хаба Settings ссылки нет — прямой URL). Invite: email + роль (только кабинет-роли Dev-OS) → Send. ⚠️ **без `RESEND_API_KEY`+`EMAIL_DRY_RUN=0` письмо не уходит, а UI пишет «sent»** — возьмите `token` из таблицы `team_invitations` и дайте ссылку `<APP_BASE_URL>/accept-invitation/<token>` вручную. Сотрудник на ней задаёт **пароль** (отдельный SMTP не нужен — аккаунт создаётся сервис-ключом).
6. **Матрица доступов** `/dashboard/settings/roles/matrix` — 22 кабинета × 14 ролей, клик по ячейке + Save. ✅ (но управляет ролями (A), которые выдаются скриптом).
7. **AI-агенты** `/dashboard/settings/ai-agents` — 14 агентов, Enable/Configure (провайдер + ключ + Test connection). ⚠️ свежей орг без подписки → «Not in plan» (нужна подписка/сид); для сохранения ключа нужен `STAY_LINK_KMS_SECRET`.
8. **Зарплаты персонала** (уборщик/бассейнщик): ⛔ payroll-модуля нет. Вносите как расходы `/dashboard/finance/expenses/new` → type `staff_allocation`/`cleaning`/`pool`, scope villa/project_pool/company. Эти строки идут в отчёты владельцев. ✅
9. **Материалы** `/dashboard/inventory/items/new` (Unit cost в минорных единицах). ✅ (⚠️ право не у procurement_manager — делайте под super_admin).
10. **Коммуналка** `/dashboard/utilities/accounts/new` (вилла, тип, провайдер PLN/PDAM, IDR, средняя стоимость, пороги). Показания → `/utilities/readings`, оплата → `/utilities/payments` (создаёт расход). ⛔ тарифа за кВт·ч нет — суммы по факту.

---

## 3. Владелец → прямая бронь → кэш → выписка

1. **Добавить владельца** `/dashboard/owners → New owner` (3 шага). ⚠️ **Сохраняются только имя/email/налог-резидентство**; Commission %, IBAN, выбор вилл и галка «invite portal» на шагах 2-3 — **сейчас выбрасываются** (декоративны).
2. **Дать владельцу логин** (⛔ автоинвайта нет — «Invite to portal» пишет только аудит): через `/dashboard/settings/team` инвайт (⚠️ роли «owner» нет — придётся дать внутреннюю, это лишний доступ), ссылку взять из `team_invitations.token`; владелец задаёт пароль на `/accept-invitation/<token>`.
3. **Привязать аккаунт к владельцу** `/dashboard/owners/[id]/access → Grant owner-portal access` (выбрать app user, тип Owner portal) → запись в `app_users_owners`. После — владелец логинится на `/owner`. ✅
   - Быстрая проверка без логина: `/dashboard/owners → View as owner →` (read-only импersонация). ✅
4. **Привязать виллу владельцу** `/dashboard/shares → New share`: Owner, Model Individual, Villa, Share 100%, дата, Active. ✅ (на карточке владельца кнопки добавления доли нет — только этот маршрут).
5. **Прямая бронь «друга»** `/dashboard/bookings/new`: Villa, уникальный Booking code, Channel **Direct (none)**, гость, даты, Status confirmed, **Gross amount = реальная цена** → Create. ✅ (проверка пересечения дат).
6. **Оплата кэшем** — ⛔ **на брони нет кнопки «оплачено»** (`booking_payments` никем не пишется, Settlement-вкладка read-only). Деньги попадут в выписку **из самой брони по месяцу check-in**, независимо от факта оплаты. Что делать в каждом кейсе: до чек-ина / по приезду (после **Check in**) / на выезде (после **Check out**) — зафиксировать `+ Add charge` («Cash received…») и/или Notes. Это след в ledger/аудите, **но не статус оплаты**.
7. **Чек-ин/чек-аут** `/dashboard/bookings/[id]` → Check in → Check out. ✅
8. **Выписка владельцу — РАБОЧИЙ путь** `/dashboard/finance` → выбрать период = месяц check-in (YYYY-MM-01) → **Generate**. Движок берёт живые брони × долю владельца, комиссия оператора **20% (жёстко в коде)**, налог 11%, резерв 3%, FX-снапшот. Открыть statement → **Approve** → email владельца → **Mark sent**. ✅
   - ⛔ **НЕ используйте** `/dashboard/finance/statements → Generate statement`: строится из ledger-строк (ваша бронь их не создаёт → пусто) И у драфта `organization_id=NULL` → кнопки Issue/Approve/Mark-paid вернут «Statement not found». Цикл там сломан.
   - ⛔ «Наш процент» зашит 20%; «Edit commission» пишет только аудит; формы для `management_fee_rules` нет.
9. **Что увидит владелец:** `/owner` и `/owner/calendar` — бронь **сразу** (живая таблица, имя гостя замаскировано) ✅. `/owner/bookings` и `/owner/revenue` — проекции: зайти в `/dashboard/jobs` → (1-й раз «Seed defaults») → job `owner_booking_projection_rebuild` → **Run now** (крон не настроен). `/owner/statements` — выписка появляется сразу (⚠️ показывает и драфты), после Mark sent → деталь, Download PDF, **Acknowledge/Dispute** (диспут открывает тред + виден вам в `/dashboard/finance/disputes`). Молчание 14 дней → авто-подтверждение (крон настроен). ✅

---

## 4. Гость → портал проживания → консьерж (кэш за доп-услуги)

0. **Подготовка (раз):** `/dashboard/guest-services/catalog → New service` (завтрак, трансфер: цена, requires date) + `/dashboard/villa-guides` (check-in, house rules, Wi-Fi, экстренные контакты). Без каталога гость видит только свободную форму.
1. **Выдать другу доступ:** ⛔ ссылки на панель выдачи нет — открыть бронь, скопировать id из URL, вручную перейти на `/dashboard/bookings/<id>/guest-stay`. В «Issue token» **обязательно заполнить email или телефон** (иначе верификация недостижима) → Issue → скопировать ссылку `/stay/<token>` (показывается один раз) → отправить другу вручную.
2. **Гость открывает ссылку** → `/stay/<token>/verify`, автогенерится 6-значный код. ⚠️ В проде код уйдёт только при `RESEND_API_KEY`/`TWILIO_*` + `NOTIFICATIONS_DRY_RUN=0` + крон `notifications-deliver`. В dev/staging код печатается на странице verify («Dev fallback · code: …») — продиктуйте другу. ✅ путь
3. **Чек-ин гостя:** `/stay/<token>/check-in` (гостей, время, паспорт) → Submit. Вы: `/dashboard/front-office/arrivals → Approve` (заблокировано, если вилла не ready — снимите блокеры readiness). После — статус checked_in, гостю откроется демо-код замка (⛔ виден только в окне −24ч…+3ч; на далёкой тест-броне честно скажет «Not available»). ✅
4. **Заказ услуги:** `/stay/<token>/services` → карточка → опция/дата → Send → «GS-…». Падает в `/dashboard/guest-services/orders` + in-app уведомление (после job «notification delivery» на `/dashboard/jobs → Run now`). ✅
5. **Закрытие заказа с кэшем:** `/dashboard/guest-services/orders/<id>` → Lifecycle: Requested → Confirmed (для on-request — проставить финальную цену в override) → Scheduled → **Fulfilled** (автопроводка суммы в финансы, Finance bridge). ⛔ отдельной «оплачено наличными» нет — зафиксируйте `Add note` «paid cash on delivery». ✅ путь
6. **Консьерж (две стороны):** гость `/stay/<token>/concierge` — AI-чат (без `ANTHROPIC_API_KEY` офлайн-режим по контенту виллы).
   - **Путь A (заявка):** гость «Ask human concierge» → создаётся SR-… → вы `/dashboard/guest-ai/handoffs` → заявка → Acknowledge → Staff reply (visibility=guest) → гость видит в `/stay/<token>/requests/<SR>` (realtime SSE), отвечает — полноценная переписка с вложениями и галочками прочтения. ✅
   - **Путь B (чат):** `/dashboard/concierge` → сессия гостя → **Take over** → ответ в композере → Send. Кнопки: Cleaning, Call technician, Add extra service, Escalate. ✅
7. **Свободный запрос:** `/stay/<token>/services → Need something we don't list?` → падает в `/dashboard/operations/service-requests`. ✅
8. **Wi-Fi/гайд/экстренные** `/stay/<token>/wifi|guide|emergency` — ваш контент; каждый показ пароля логируется в Security events (`/dashboard/guest-stays`). ✅ (в проде нужен `STAY_LINK_KMS_SECRET`).
9. **Чего сегодня не будет:** SMS/WhatsApp гостю (нужны Twilio/Meta креды — честный skip, уведомления остаются in-app у персонала); онлайн-оплаты (PSP отложен — только кэш без фиксации платежа); реальный замок (демо-код).

---

## Итог: 3 категории блокеров для вашего прогона

**A. Чинится кодом (баги, не дизайн)** — см. список в чате, кандидаты в fix-волну:
ledger-statement `organization_id=NULL`; owner-onboard визард теряет шаги 2-3; «Invite to portal» / «Edit commission» — audit-only заглушки; нет навигации на `/guest-stay`; кросс-тенант чтение в settings/team+users; сломанный last-admin guard; ложный «sent» инвайта; 404 ссылки (Back to project, New project, Capture lead); мёртвые кнопки (Filter, SSO).

**B. Продуктовые пробелы (нужна сборка):** выдача внутренних mgmt-ролей из UI; роль `owner` + owner-invite одной кнопкой; запись оплаты (cash/transfer) и статус paid на брони; payroll/прайс уборки; UI для комиссии владельца; создание орг/назначение плана/переключение продуктов из консоли.

**C. Внешние зависимости (по плану):** PSP (Xendit — на запуске), SMS/WhatsApp креды, AI-ключи, RESEND для писем.
