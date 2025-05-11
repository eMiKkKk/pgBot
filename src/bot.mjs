import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';




const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const geojsonPath = path.join(__dirname, 'hydrants.geojson'); // Теперь путь будет корректным

dotenv.config();

const hydrantsGeoJSON = JSON.parse(fs.readFileSync(geojsonPath));
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const app = express();
app.use(express.json());
app.post('/api/telegram', async (req, res) => {
  await bot.handleUpdate(req.body, res);  // Передаём запрос в Telegraf
});

const logMessage = (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || 'нет username';
  const firstName = ctx.from.first_name || '';
  const lastName = ctx.from.last_name || '';
  const text = ctx.message.text;
  const time = new Date().toISOString();

  const logEntry = `[${time}] ID: ${userId} (@${username}), Имя: ${firstName} ${lastName}, Текст: "${text}"\n`;

  // Дублируем в консоль для удобства
  console.log(logEntry.trim());
};

// Пример данных о гидрантах
const hydrants = hydrantsGeoJSON.features.map(feature => ({
  lat: feature.geometry.coordinates[1],
  lng: feature.geometry.coordinates[0],
  label: feature.properties.label,
  ...feature.properties
}));

// Функция геокодирования адреса через Яндекс.API
async function geocodeYandex(address) {
  const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${process.env.YANDEX_MAPS_API_KEY}&format=json&geocode=${encodeURIComponent(address)}`;
  const response = await axios.get(url);
  const coords = response.data.response.GeoObjectCollection.featureMember[0].GeoObject.Point.pos.split(' ');
  console.log('Полученные координаты:', { lng: parseFloat(coords[0]), lat: parseFloat(coords[1]) });
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
  const markers = hydrants.map((h, index) => {
    const number = index < 9 ? (index + 1).toString() :
                   String.fromCharCode(65 + index - 9);
    return `${h.lng},${h.lat},pm2blm${number}`;
  }).join('~');

  const url = `https://static-maps.yandex.ru/1.x/?l=map&pt=${markers}~${center.lng},${center.lat},pm2rdl&size=650,450&apikey=${process.env.YANDEX_MAPS_STATIC_KEY}`;
  return url;
}

app.get('/', (req, res) => {
  res.status(200).send('Bot is awake!');
});

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

    const nearestHydrants = hydrants
      .map(h => ({ ...h, distance: Math.sqrt((h.lat - userLocation.lat) ** 2 + (h.lng - userLocation.lng) ** 2) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);

    const mapUrl = generateYandexMap(userLocation, nearestHydrants);

    const response = await axios.get(mapUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data, 'binary');

    const hydrantsList = nearestHydrants.map((h, index) => {
      const distance = getDistance(userLocation.lat, userLocation.lng, h.lat, h.lng);
      const label = `Гидрант ${index + 1}`;
      return `[${label} — ${distance} м](${getYandexMapsLink(h.lng, h.lat)})`;
    }).join('\n');

    function getYandexMapsLink(lng, lat) {
      return `https://yandex.ru/maps/?pt=${lng},${lat}&z=18`;
    }
    await ctx.replyWithPhoto(
      { source: imageBuffer },
      {
        caption: `Ближайшие гидранты:\n${hydrantsList}`,
        parse_mode: 'Markdown'
      }
    );
  } catch (error) {
    console.error(error);
    const errorLog = `[${new Date().toISOString()}] ОШИБКА у ${ctx.from.id}: ${error.message}\n`;
    // fs.appendFileSync('bot.log', errorLog, 'utf8');
    await ctx.reply('Ошибка. Проверь адрес или попробуй позже.');
  }
});

console.log('Бот запущен!');
// bot.launch();
// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => console.log(`Bot is listening on port ${PORT}`));

export default bot;
