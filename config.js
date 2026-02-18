/**
 * Конфигурация для развёртывания на сервере.
 * Каждый пользователь входит через свой аккаунт Яндекса.
 *
 * 1. Создайте приложение на https://oauth.yandex.ru/client/new
 * 2. Права: iot:view, iot:control
 * 3. Callback URI: https://ВАШ_ДОМЕН/ (точный URL вашего сайта)
 * 4. Укажите client_id ниже
 *
 * API_USE_PROXY = true — обязательно при размещении в интернете (обход CORS)
 * OAUTH_REDIRECT_URI — если не указан, используется текущий адрес страницы
 */
var YANDEX_OAUTH_CLIENT_ID = '5326f1996a4c4139b8abe1343a06600f';
var API_USE_PROXY = true;
// var OAUTH_REDIRECT_URI = 'https://ваш-домен.com/';
