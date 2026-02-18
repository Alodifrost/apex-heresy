# Инструкции по созданию релиза для Foundry VTT

## Что уже сделано:

1. ✅ Создан тег версии `v1.1.0`
2. ✅ Обновлен `system.json` с правильными URL
3. ✅ Создан архив `system.zip` со всей системой

## Что нужно сделать вручную на GitHub:

### 1. Создать релиз на GitHub:

1. Перейдите на страницу репозитория: https://github.com/Alodifrost/apex-heresy
2. Нажмите на "Releases" в правой панели
3. Нажмите "Create a new release"
4. Выберите тег `v1.1.0` (или создайте новый тег)
5. Заголовок релиза: `v1.1.0` или `Version 1.1.0`
6. Описание релиза (можно скопировать из README)

### 2. Загрузить файлы в релиз:

В разделе "Attach binaries" загрузите:
- **system.zip** - архив со всей системой (уже создан в корне проекта)

### 3. Опубликовать релиз:

Нажмите "Publish release"

## После создания релиза:

Foundry VTT сможет установить систему по следующему manifest URL:
```
https://raw.githubusercontent.com/Alodifrost/apex-heresy/main/system.json
```

Или пользователи могут использовать прямую ссылку на релиз:
```
https://github.com/Alodifrost/apex-heresy/releases/latest/download/system.zip
```

## Альтернативный способ через GitHub CLI:

Если у вас установлен GitHub CLI (`gh`), можно создать релиз командой:

```bash
gh release create v1.1.0 system.zip --title "Version 1.1.0" --notes "Initial release of Apex Heresy system"
```

## Проверка установки:

После создания релиза проверьте установку в Foundry VTT:
1. Откройте Foundry VTT
2. Перейдите в Setup → Add-on Modules → Install System
3. Вставьте manifest URL: `https://raw.githubusercontent.com/Alodifrost/apex-heresy/main/system.json`
4. Нажмите "Install"

Система должна установиться автоматически!
