# Публичный HTTPS-сайт Medoyv.App

Cloudflare Pages собирает сайт из GitHub-репозитория `medoyv/medoyv.app`. Текущий адрес: [https://medoyv-app.pages.dev](https://medoyv-app.pages.dev). Репозиторий и сайт публичные; для просмотра каталога пароль не нужен.

## Сборка Cloudflare Pages

- Production branch: `main`
- Framework preset: `None`
- Build command: `bash cloudflare-pages-build.sh`
- Build output directory: `public`
- Root directory: пустой

Новые коммиты в `main` автоматически пересобирают сайт. `cloudflare-pages-build.sh` извлекает статический сайт из `Medoyv.App-deploy.zip`, исключает серверные файлы и добавляет Worker для выдачи файлов по HTTPS.

## Открыть на iPhone

1. Откройте [https://medoyv-app.pages.dev](https://medoyv-app.pages.dev) в Safari.
2. Нажмите **Поделиться → На экран Домой**.
3. Включите **Открывать как веб-приложение** и выберите **Добавить**.

## IPA

Сайт показывает каталог и значки. Кнопки нативной установки IPA отключены. Исходные IPA, `.p12` и `.mobileprovision` в репозиторий и сборку сайта не включайте. Подпись Ad Hoc работает только с устройствами, перечисленными в профиле; установка приложений издателей требует разрешённого ими канала распространения.
