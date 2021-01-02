# productivity-checker README

Проверьте на сколько ты продуктивен, с какими файлами больше всего работаешь, сколько ты должен заработать исходя из этих данных

## Особенности

Запустите разширение из палитры команд (Вид -> палитра команд или Ctrl + Shift + P) и введите Productivity-checker
Расширение начнет отслеживать вашу активность, которую вы можете посмотреть, нажав на кнопку Work time в статус баре

\!\[Запуск\]\(images/launch.jpg\)

<!-- ## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: enable/disable this extension
* `myExtension.thing`: set to `blah` to do something -->

<!-- ## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension. -->

## Функции

- отслеживание кол-ва нажатий
- отслеживание времени работы
- если пользователь ничего не печатает уже 3 минуты, таймер работы останавливается, запускается таймер отдыха
- если пользователь 4 минуты работает в другом окне, то таймер работы останавливается
- чтобы возобновить таймер, нужно сделать 5 нажатий. После скролла файла нужно сделать всего 3 нажатия
- для каждого файла определяется язык программирования
- данные сохраняются за месяц
- страница с визуализацией данных. Далее С.В
- навигация по файлам на С.В
- переключение между различными графиками на С.В
- общее кол-во часов работы за месяц на С.В
- общее кол-во часов отдыха за месяц на С.В
- кол-во нажатий за месяц на С.В
- любимый язык за месяц на С.В
<
### 0.1.0

- исправлен баг с неправильным отслеживание времени отдыха
- добавлена общая статистика
- ускорен запуск

### 1.0.0

- исправлено заполнение данных за месяц, если человек не работал
- изменение в дизайне
- подсветка активной вкладки на C.В

### 1.0.1

- добавлена иконка часов в статус баре
- исправлен баг со сбросом просматриваемого файла при открытии другой вкладки на C.В
- активная вкладка сбрасывается при переключении между файлами
- добавлена картинка в описание расширения
