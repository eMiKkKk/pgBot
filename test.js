require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Пример данных о гидрантах (в реальности загружай из GeoJSON/БД)
const hydrants = [
  { lat: 52.964795, lng: 36.061997, label: 'Гидрант 1' },
  { lat: 52.965530, lng: 36.065635, label: 'Гидрант 2' },
  { lat: 52.966737, lng: 36.065193, label: 'Гидрант 2' },
];

// Функция геокодирования адреса через Яндекс.API
async function geocodeYandex(address) {
  const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${process.env.YANDEX_MAPS_API_KEY}&format=json&geocode=${encodeURIComponent(address)}`;
  console.log('url', url);
  const response = await axios.get(url);
  console.log('RRRESPONSE', response);
  const coords = response.data.response.GeoObjectCollection.featureMember[0].GeoObject.Point.pos.split(' ');
  console.log('ДААААААААТААААААААААААА',{ lng: parseFloat(coords[0]), lat: parseFloat(coords[1]) });
  return { lng: parseFloat(coords[0]), lat: parseFloat(coords[1]) };
}

// Генерация статичной карты с Яндекс.API
function generateYandexMap(center, hydrants) {
    // Синие маркеры для гидрантов, красный дом для центра
    const markers = hydrants.map(h =>
      `${h.lng},${h.lat},pm2blm`  // Синие маркеры
    ).join('~');

    const url = `https://static-maps.yandex.ru/1.x/?l=map&pt=${markers}~${center.lng},${center.lat},pm2rdl&size=650,450&apikey=${process.env.YANDEX_MAPS_STATIC_KEY}`;
    return url;
  }

// Обработчик сообщений
bot.on('text', async (ctx) => {
  try {
    const address = ctx.message.text;
    const userLocation = await geocodeYandex(address);
    
    // Ищем ближайшие гидранты (упрощенный пример)
    const nearestHydrants = hydrants
      .map(h => ({ ...h, distance: Math.sqrt((h.lat - userLocation.lat) ** 2 + (h.lng - userLocation.lng) ** 2) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);




    // Генерируем карту
    const mapUrl = generateYandexMap(userLocation, nearestHydrants);
    
    // Скачиваем карту и отправляем пользователю
    const response = await axios.get(mapUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync('map.png', response.data);
    
    // Формируем список гидрантов для текста
    const hydrantsList = nearestHydrants.map((h, i) =>
    `${i+1}. [${h.label}](${getYandexMapsLink(h.lng, h.lat)})`
    ).join('\n');

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
    await ctx.reply('Ошибка. Проверь адрес или попробуй позже.');
  }
});

bot.launch();
console.log('Бот запущен!');