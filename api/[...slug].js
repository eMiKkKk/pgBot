const bot = require('../index');

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      const update = req.body;
      await bot.handleUpdate(update);
      res.status(200).send('OK');
    } else {
      res.status(200).json({
        message: 'This is a Telegram bot webhook endpoint',
      });
    }
  } catch (error) {
    console.error('Error processing update:', error);
    res.status(500).send('Error processing update');
  }
};