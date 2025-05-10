require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const hydrantsGeoJSON = JSON.parse(fs.readFileSync('hydrants.geojson'));
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const logMessage = (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || 'нет username';
  const firstName = ctx.from.first_name || '';
  const lastName = ctx.from.last_name || '';
  const text = ctx.message.text;
  const time = new Date().toISOString();

  const logEntry = `[${time}] ID: ${userId} (@${username}), Имя: ${firstName} ${lastName}, Текст: "${text}"\n`;

  // Запись в файл
  fs.appendFileSync('bot.log', logEntry, 'utf8');

  // Дублируем в консоль для удобства
  console.log(logEntry.trim());
};



// Пример данных о гидрантах (в реальности загружай из GeoJSON/БД)
const hydrants = hydrantsGeoJSON.features.map(feature => ({
  lat: feature.geometry.coordinates[1],
  lng: feature.geometry.coordinates[0],
  label: feature.properties.label,
  ...feature.properties // Доп. данные (pressure, type и т.д.)
}));

// Функция геокодирования адреса через Яндекс.API
async function geocodeYandex(address) {
  const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${process.env.YANDEX_MAPS_API_KEY}&format=json&geocode=${encodeURIComponent(address)}`;
  const response = await axios.get(url);
  const coords = response.data.response.GeoObjectCollection.featureMember[0].GeoObject.Point.pos.split(' ');
  console.log('Полученные координаты:',{ lng: parseFloat(coords[0]), lat: parseFloat(coords[1]) });
  return { lng: parseFloat(coords[0]), lat: parseFloat(coords[1]) };
}


// Функция расчета расстояния между точками в метрах
        function getDistance(lat1, lng1, lat2, lng2) {
      const R = 6371e3; // Радиус Земли в метрах
      const φ1 = lat1 * Math.PI / 180;
      const φ2 = lat2 * Math.PI / 180;
      const Δφ = (lat2 - lat1) * Math.PI / 180;
      const Δλ = (lng2 - lng1) * Math.PI / 180;

      const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      return Math.round(R * c); // Округляем до метров
    }

// Генерация статичной карты с Яндекс.API
function generateYandexMap(center, hydrants) {
  // Маркеры с нумерацией (1-9, A-Z)
  const markers = hydrants.map((h, index) => {
    const number = index < 9 ? (index + 1).toString() :
                   String.fromCharCode(65 + index - 9); // После 9 идут буквы A,B,C...
    return `${h.lng},${h.lat},pm2blm${number}`;
  }).join('~');

  const url = `https://static-maps.yandex.ru/1.x/?l=map&pt=${markers}~${center.lng},${center.lat},pm2rdl&size=650,450&apikey=${process.env.YANDEX_MAPS_STATIC_KEY}`;
  return url;
}



// Обработчик сообщений

bot.start((ctx) => {
  ctx.reply('Привет, Тушила! Вводи адрес, и я покажу тебе ближайшие пожарные гидранты. \n \nРаботаю я пока что только по району выезда 5 ПСЧ города Орла, потому что гидранты только там в базе - да и то не все \n \nДа и вообще это тестовый бот, доработок ещё много будет');
  setTimeout(() => ctx.reply('К чёрту предисловие, вводи адрес, как будто ты вводишь его в навигаторе. Город тоже уточнить не забудь )'), 10000);
});


bot.on('text', async (ctx) => {
  try {

    logMessage(ctx);


    const address = ctx.message.text;
    const userLocation = await geocodeYandex(address);

    // Ищем ближайшие гидранты (упрощенный пример)
    const nearestHydrants = hydrants
      .map(h => ({ ...h, distance: Math.sqrt((h.lat - userLocation.lat) ** 2 + (h.lng - userLocation.lng) ** 2) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);

    // Генерируем карту
    const mapUrl = generateYandexMap(userLocation, nearestHydrants);

    // Скачиваем карту и отправляем пользователю
    const response = await axios.get(mapUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync('map.png', response.data);

    // Формируем список гидрантов для текста
   const hydrantsList = nearestHydrants.map((h, index) => {
  const distance = getDistance(userLocation.lat, userLocation.lng, h.lat, h.lng);
  const label = `Гидрант ${index + 1}`;
  return `[${label} — ${distance} м](${getYandexMapsLink(h.lng, h.lat)})`;
}).join('\n');


      // Функция для генерации ссылки
      function getYandexMapsLink(lng, lat) {
        return `https://yandex.ru/maps/?pt=${lng},${lat}&z=18`;
      }

    await ctx.replyWithPhoto(
        { source: 'map.png' },
        {
          caption: `Ближайшие гидранты:\n${hydrantsList}`,
          parse_mode: 'Markdown' // Включаем поддержку Markdown
        }
      );
  } catch (error) {
    console.error(error);
    const errorLog = `[${new Date().toISOString()}] ОШИБКА у ${ctx.from.id}: ${error.message}\n`;
    fs.appendFileSync('bot.log', errorLog, 'utf8');
    await ctx.reply('Ошибка. Проверь адрес или попробуй позже.');
  }
});

bot.launch();
console.log('Бот запущен!');