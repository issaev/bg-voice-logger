# BG Voice Logger v0.8.1 — обновяване (кандидат)

## Версии
- WordPress: 0.8.1; JS: 0.8.1-dcfac367badc.
- Google Apps Script: 0.8.1.
- Cloudflare STT Worker: без промяна (sar-bg-v1, същият код като v0.8.0).
- Production остава v0.8.0.1 според оператора, докато той не обнови.

## Инсталация
1. Запази текущия WP ZIP, текущия GAS revision/URL, WordPress настройки и CF Worker revision. Не деинсталирай плъгина, не изтривай IndexedDB, опашката или медии. Избери момент без активна акция/запис.
2. Google Apps Script: отвори същия проект, замени Code.gs с apps-script/Code.gs. Save. Deploy > Manage deployments > Edit съществуващия Web App > New version > Deploy. Не създавай нов /exec URL. Запази Script Properties (BVLOG_SHARED_SECRET и всички BVLOG_CREATE_*), permissions, Drive папка, шаблон и съществуващия достъп. Ако има изрично описани oauthScopes, запази всички съществуващи разрешения (включително script.external_request за аудио Range от v0.8.0).
3. WordPress: Plugins > Add New > Upload Plugin, качи bg-voice-logger-v0.8.1.zip и избери Replace current with uploaded. Запази всички настройки. Test connection трябва да показва успешно свързване с GAS 0.8.1; в приложението провери WP 0.8.1 / JS 0.8.1-dcfac367badc. Не изтривай browser storage.
4. Cloudflare: НЕ е нужно да обновяваш Worker, ако вече използваш sar-bg-v1. workers/stt-worker.mjs и wrangler.toml.example са приложени за пълнота. При необходимост обнови съществуващия Worker, без да сменяш routes, variables, secrets или AI/KV/rate-limit bindings. Примерният wrangler файл съдържа placeholder за KV namespace и не е готов за CLI deployment без реалните настройки.

## Какво да тестваш
- Нов тестов документ, дата/тип, първи запис, повторен CREATE след timeout и reload; провери, че има точно една готова акция. Измери CREATE и READ поотделно. След потвърден CREATE не трябва да има блокиращ LIST. Старите табове се зареждат чрез съществуващото четене, не се подменят с фиктивни данни.
- При прекъсване остави същата заявка и натисни „Провери / повтори създаването“. Не сменяй данните и не започвай копие. Сървърът възстановява запазената заявка/временното копие. Ако върне create_unknown или create_missing и повторението не помага, администраторът трябва да провери конкретния BVLOG_CREATE_<ID> запис и BVLOG_CREATE_PENDING_<ID> файл. Само след надеждна проверка, че предишният опит не е създал документ, администраторът може да освободи конкретната празна резервация; не изтривай всички properties, папки или файлове. При наличен pending файл първо опитай възстановяване.
- В WP Settings > BG Voice Logger > Recent Google requests > Timing phases (ms) се виждат post_ms, redirect_ms, gas_ms, gas_phases_ms. При timeout преди получаване на отговор Google фазите няма да са налични; тогава провери конкретния запис/Executions. Данните са числови и не включват оперативно съдържание.
- На Android и iPhone: иконка за инсталиране най-отдолу (скрита при installed PWA), бутоните на LOG под часа, един бутон Добави снимка > Снимай / От галерията / Отказ за нови и съществуващи записи; провери multiple selection, preview, upload, offline и анулирани записи.
- Повтори регресионните тестове за Google вход, опашка, аудио, паралелни оператори и реални Sheets данни само със синтетична акция.

## Rollback
Преди връщане към стар GAS разреши всички недовършени CREATE заявки, защото по-старият GAS не разбира новите резервации. Не трий BVLOG_CREATE_* или временни копия на сляпо. След безопасна проверка върни стария WP ZIP и предишната GAS version със същия URL. Запази локалната опашка и неизпратените медии.

Няма production secrets в архивите. Проверени са синтаксисът на JS/GAS и изолирани симулации; пълни PHP/Node и реални мобилни/Google тестове не са изпълнени. Не е измерена реална печалба в скоростта.
