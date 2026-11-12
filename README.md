# FRAGZONE

Каталог игровых серверов. Ветка `feature/site-support-system` добавляет полноценную систему поддержки непосредственно на сайт без Telegram.

## Система поддержки
- Гость может отправить тикет без регистрации и получает секретную ссылку для просмотра.
- Пользователь регистрируется/входит по email и паролю, видит свои обращения и комментирует только собственные тикеты.
- Администратор входит отдельно на `/support/admin.html`, просматривает обращения, меняет статусы и приоритеты, отвечает в переписке.
- Пароли хешируются PBKDF2-SHA256 (210 000 итераций), сессии — HttpOnly/Secure cookie; в D1 хранится хеш токена.

## Установка на Cloudflare Pages
1. Создайте D1 Database.
2. Выполните `schema.sql` в D1 Console либо `npx wrangler d1 execute <DB_NAME> --remote --file=schema.sql`.
3. В Pages → Settings → Functions → D1 database bindings создайте binding с Variable name `DB`.
4. Добавьте Pages variables/secrets: `ADMIN_EMAIL` и Secret `ADMIN_PASSWORD_HASH`.
5. Сгенерируйте хеш пароля администратора: `node scripts/make-admin-hash.mjs 'длинный-пароль-от-10-символов'`.
6. Скопируйте вывод команды в Secret `ADMIN_PASSWORD_HASH` и выполните deploy после слияния ветки.

## Адреса
- `/support/` — создать обращение.
- `/support/auth.html` — регистрация и вход.
- `/support/my-tickets.html` — личные обращения.
- `/support/admin.html` — вход администратора.

Перед публичным запуском рекомендуется подключить Turnstile/rate limiting, подтверждение email, восстановление пароля и почтовые уведомления. Секретная ссылка гостевого тикета пока показывается на экране и не отправляется по email.
