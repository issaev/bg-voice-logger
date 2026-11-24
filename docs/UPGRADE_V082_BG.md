# BG Voice Logger v0.8.2.1 — приемателно тестване след докладван deployment

**Статус 24.11.2026:** операторът потвърди, че v0.8.2.1 е в production. Това не е независимо потвърждение на JS/GAS/Worker или приемане на версията. Следва цялостно тестване. Инструкциите по-долу остават за повторна инсталация/проверка, ако се наложи.

## Инсталиране (Google Apps Script → WordPress)
1. Запази текущите WP ZIP, GAS revision/URL, конфигурация и CF Worker revision. Не обновявай по време на реална акция или активен запис. Не деинсталирай плъгина, не изтривай IndexedDB, опашка, снимки или аудио.
2. В същия Google Apps Script проект замени Code.gs със съдържанието на apps-script/Code.gs от backend ZIP. Save → Deploy → Manage deployments → Edit → New version → Deploy. Запази същия /exec URL и всички Script Properties, включително BVLOG_SHARED_SECRET и BVLOG_CREATE_*. Запази текущите OAuth scopes, включително script.external_request за аудио Range, ако са описани изрично. Не давай публичен достъп до оперативните документи.
3. В WordPress → Plugins → Add New → Upload Plugin качи bg-voice-logger-v0.8.2.1.zip → Replace current with uploaded. Не променяй настройките.
4. Cloudflare STT Worker не е променян. В ZIP е приложен за пълнота. Ако вече работи sar-bg-v1, не го обновявай. Не заменяй реалните bindings/secrets с примерния wrangler.toml.
5. Провери WP 0.8.2.1, JS 0.8.2.1-188c8b66fb21, GAS 0.8.2. Test connection и актуализирай PWA assets чрез reload/повторно отваряне, НЕ чрез Clear site data.

## Приемателно тестване (само синтетични акции)
- Изпълни пълната Node и PHP регресия; сравни наследените 10 failures, не ги считай за решени или безвредни само защото са наследени. Новите локални тестове: tests/test-v081-next.js и tests/test-v082-test-candidate.js.
- Google login, Android/iOS/PWA, последователен вход с различни оператори. Провери новата иконка и надпис „Инсталирай“; скрита в standalone. Нативен Android prompt/iOS инструкции.
- CREATE: дата, тип, име, точно един документ за същия create_id, timeout/reload/retry, безопасно възстановяване на pending copy; не изтривай reservations на сляпо. Bootstrap показва действителен LOG; при отказ/стар GAS се извършва нормален READ.
- LOG/INFO/TEAM/TECH: бърза смяна, просрочен отговор не сменя таба/акцията, правилни медии/история, променени INFO dropdowns, ръчни редакции в Sheets, кешираните данни не се обозначават като свежи. Offline: заредени табове достъпни от локален snapshot; незареден таб без snapshot изисква интернет. Проверка на старите whole-document snapshots. Смяна на таб с отворена редакция изисква запазване или отказ.
- LOG: гласов запис остава видим, снимки камера/галерия, едно събитие след reconnect, no-speech/noisy STT, запазени оригинали, непрекъсната опашка и безопасен retry; два оператора и паралелни ръчни промени.
- Аудио: тест с малък/голям файл, прекъсване в средата и липсваща по-ранна порция, възстановяване след reconnect/PWA restart, една крайна медия с идентични байтове. Range 200/206/416/HEAD, първи звук и full download, достъп само за упълномощени оператори. Снимки: оригинал+thumbnail, retry без дубликати, преместване/сортиране на LOG редове.
- Background Sync: реални Android и iPhone (lock/minimize/force-stop/reconnect). Не обещаваме гарантирано изпълнение при заключен екран; foreground recovery е задължителен.
- Измери поне 10 сравними повторения за CREATE, LIST, LOG, INFO, TEAM, TECH, audio first-play, audio/photo upload. Измери UI-ready, потвърдени данни, ACK отделно; p50/max/errors, p95 само при n>=40; еднакъв template/folder/network/media размер. WP Settings → Timing phases (ms). Не публикувай реални оперативни данни.
- Провери security и rollback: без изтичане на private snapshots/медии между акаунти, без публични Drive линкове, без загуба/дублиране на записи.

## Ограничения и rollback
Кодът е кандидат, не приет release. Изолираните тестове са с mock услуги; PHP lint/full suite и реални устройства не са изпълнени тук. Няма измерено реално ускорение. Cache е само за chooser и се обновява по версия/TTL; live CREATE validation остава. При sparse index fallback може да бъде прочетен целият индекс. Гарантиран native background transfer не е имплементиран. При връщане към по-стар GAS първо разреши pending CREATE reservations; не изтривай опашката/медиите. Върни предходния WP ZIP и GAS revision със същия URL; старата версия вижда старите whole-document snapshots, които може да не са актуални, докато се свърже с Google. Запази всички локални записи.
