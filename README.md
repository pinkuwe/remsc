# RE:MUSIC

локальный музыкальный сервер с веб-интерфейсом.

## Требования

- [Rust](https://www.rust-lang.org/tools/install) (cargo)
- Папка с музыкой (mp3, flac, m4a, ogg, opus и др.)

## Быстрый запуск (для преподавателя)

1. Соберите один раз: `cargo build --release`
2. Скопируйте в одну папку для демо:
   - `target\release\remsc.exe`
   - `target\release\remsc-launch.exe`
   - папку `RE-MUSIC` (положите туда mp3)
   - `Start-RE-MUSIC.bat`
3. Дважды щёлкните  `remsc-launch.exe

Лаунчер сам подставит IP в локальной сети, запустит сервер, покажет QR в консоли и откроет браузер.

**Важно:** mp3 кладите в `RE-MUSIC` в **корне проекта**. Лаунчер ищет эту папку рядом с exe и выше по каталогам (старая `demo-music` тоже подойдёт).

## Сборка и ручной запуск

```powershell
cargo build --release

.\target\release\remsc.exe serve ".\RE-MUSIC" --bind 127.0.0.1 --port 8080
```

Откройте в браузере `http://127.0.0.1:8080/`.

### Доступ с телефона / другого ПК в Wi‑Fi

```powershell
.\target\release\remsc.exe serve ".\RE-MUSIC" --bind 0.0.0.0 --port 8080 --qr
```

На **других устройствах** открывайте адрес вида `http://192.168.x.x:8080/` (из консоли), **не** `localhost` и **не** `127.0.0.1`.

Если QR ведёт не туда (VPN, Cloudflare WARP, виртуальный адаптер), укажите IP вручную:

```powershell
.\target\release\remsc.exe serve ".\RE-MUSIC" --bind 0.0.0.0 --port 8080 --public-url http://192.168.1.50:8080/
```

Узнать IP: `ipconfig` → «Адаптер беспроводной сети» → IPv4.

**Брандмауэр Windows:** при первом запуске разрешите входящие для `remsc.exe` в частной сети, или:

```powershell
netsh advfirewall firewall add rule name="RE:MUSIC" dir=in action=allow protocol=TCP localport=8080
```

**Проверка с телефона:** в браузере `http://192.168.x.x:8080/api/folder` — должен быть JSON, не пустая страница.

### Параметры

| Параметр | Описание |
|----------|----------|
| `serve <папка>` | Корневая папка с музыкой |
| `--port` | Порт (по умолчанию 8080) |
| `--bind` | IP для прослушивания (`127.0.0.1` — только этот ПК, `0.0.0.0` — доступ в локальной сети) |
| `--public-url` | URL в плейлистах M3U8, если сервер за прокси |
| `--qr` | QR-код с адресом UI в консоли |
| `-v` | Подробные логи |

## Возможности

- Веб-интерфейс: папки, плеер, обложки
- Автосканирование аудиофайлов
- Плейлисты M3U8: `http://localhost:8080/api/folder.m3u8?path=<путь>`
- Пересканирование: кнопка Rescan или `GET /admin/rescan`

## Брендинг

Логотип и иконка: `src/static/logo.png`, `src/static/icon.png`. Название **RE:MUSIC** — в `index.html`, `manifest.webmanifest`, `app.js`. Папка с музыкой: `RE-MUSIC`, кэш сканирования: `.re-music` внутри неё.
