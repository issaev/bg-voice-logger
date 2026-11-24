> Update: v0.8.0 integrated draft now includes PR #21 (GAS) and PR #1 (STT), native audio Range playback with legacy fallback, and audio upload read optimization. The prior notes below are historical. No production deployment or full combined regression run has been performed.

# BG Voice Logger v0.8.0 — интегриран кандидат с инсталиране (Draft)

**Статус: кодът е подготвен, НЕ е публикуван.** Production остава докладваната от оператора v0.7.2.1. Не се прави автоматичен merge, WordPress/GAS deploy, промяна в Cloudflare, изтриване или migration на оперативни данни.

## Интегриран код

- **[PR #29](https://github.com/issaev/bg-voice-logger/pull/29)** — временни мрежови грешки: автоматично повторно четене след 5/15/30 s; опашка с постоянен `op_id`/`doc_id`, ограничени повторни опити и без повторен write, когато само последващото четене е неуспешно.
- **[PR #31](https://github.com/issaev/bg-voice-logger/pull/31)** — фиксиран избор на акция при асинхронни обновявания, race и смяна на оператор; Service Worker one-shot **best-effort** Background Sync с независима авторизация, координационно заключване, проверка на сесията и resumable media upload. Основната IndexedDB опашка остава **schema 2** за rollback съвместимост.
- **[PR #30](https://github.com/issaev/bg-voice-logger/pull/30)** — бутон „Снимай“ към съществуващ LOG, снимки за ново събитие с миниатюра, точното червено заглавие „Документ за Координация на Акция“, премахнат стар импорт бутон без изтриване на IndexedDB, и регресия за документи с различни имена в същата Drive папка. `bvlList_` вече изброява тези документи без филтър по име; тук GAS не се преправя.
- **Ново: инсталиране на телефона** в началния екран за избор на акция. Видимият бутон е **„Инсталирай приложението на телефона“**. В Android/Chromium, при наличен `beforeinstallprompt`, отваря системния прозорец **само при натискане**. При липса на промпт (включително iPhone/iPad Safari) показва инструкции за инсталиране от менюто на браузъра. При PWA standalone бутонът не се показва; `appinstalled` обновява състоянието. Има `apple-touch-icon`, `id`, `scope` и правилното заглавие в Web App Manifest, без промяна на версията на основната база.

### Какво НЕ е включено

- **[PR #21](https://github.com/issaev/bg-voice-logger/pull/21)** е отделният GAS performance кандидат. Без реални staging A/B измервания не се слива автоматично в общата версия.
- Стрийминг аудио playback по #7, по-нататъшна оптимизация на Sheets и гарантиран background upload по време на телефонен lock **не са завършени**.
- Няма реална device acceptance върху Android/iPhone; локалните симулации на `SyncManager`, `beforeinstallprompt`, IndexedDB и REST не са заместител на реалните устройства.

## Автоматични регресии

Тествайте `node tests/test-v080-install-pwa.js`, `node tests/test-v080-rc-integration.js`, `node tests/test-v080-mobile-ui.js`, `node tests/test-v080-stable-selection.js`, `node tests/test-v080-background-sw.js`, `node tests/test-v080-retry.js`, `node tests/test-v072-release.js`, `node tests/test-v070-ui.js`, `node tests/test-v063-sw.js`; PHP синтаксис чрез `php -l bg-voice-logger.php`.

Оставащите **10 стари неуспешни файла** са известни още преди този кандидат. Това не доказва, че функционалността е готова за production; всеки релевантен стар тест трябва да се разследва преди release.

## Приемателна матрица (само синтетични данни)

| Устройство / сценарий | Очакван резултат |
| --- | --- |
| Android Chrome HTTPS | Начално меню → „Инсталирай“ → системен prompt, ако е наличен; след инсталиране стартира икона с правилно заглавие и начален `/dka/` маршрут. |
| Android Chrome, липсващ `beforeinstallprompt` | Бутонът не е неактивен; показва реални стъпки за инсталиране от менюто на Chrome. |
| iPhone Safari / Home Screen PWA | Инструкции „Споделяне → Добави към началния екран“ (опция „Отвори като приложение“, ако се предлага); инсталираната PWA не показва бутона при стартиране. |
| Избор на стара акция + късна мрежова заявка | Не сменя ръчния избор; при изчезнал документ спира и изисква изричен нов избор. |
| Мобилна връзка / `Failed to fetch` | До 3 read retries; потвърдените данни и локалната опашка остават, няма дублиран LOG при неясен ACK. |
| Android background/lock / force-stop | Потвърдено изписване на действителен `op_id` в *тестов* Sheet, ако браузърът разреши фоново изпълнение. Ако не, локалните записи се възобновяват при връщане, без изгубени медийни байтове. |
| iPhone background/lock 2–10 минути | Не се твърди, че трансферът работи при заключване; при връщане приложението възобновява локалната опашка. |
| Фото/аудио на части | Последната потвърдена част и оригиналът са запазени до ACK; снимки към правилното LOG събитие. |
| Logout и login на друг Google оператор | Никога не се обработва чужда локална опашка. |
| Rollback без чистене на браузър | v0.7.2.1 отваря първоначалната IndexedDB `schema 2` и незавършените записи остават достъпни. |

## Критерии за публикуване

1. Ревю на обединения diff и отстраняване на конфликтите и релевантните наследени провали.
2. Реален Android Chrome + iOS Safari/PWA с отделна синтетична акция; 10+ read операции с потвърждение в Sheet.
3. Проверени no-duplicate `op_id` за текст, INFO, TEAM, TECH, снимка и аудио след загубен ACK, offline, login switch и shutdown.
4. Проверка на същия manifest/install flow на реално HTTPS origin и че WordPress Service Worker route не се кешира/заменя от Cloudflare.
5. Доказано успешно запазване на queued медия и снимки и непроменена структура на Google Docs.
6. Изрично одобрение за merge и отделно за deployment. Не изтривайте IndexedDB или локална опашка при обновяване/rollback.
