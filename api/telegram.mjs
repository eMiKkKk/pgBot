import bot from '../src/bot.mjs';

export default async (req, res) => {
  if (req.method === 'POST') {
    try {
      await bot.handleUpdate(req.body, res);
    } catch (e) {
      console.error('Error handling update:', e);
      res.status(500).send('Error');
    }
  } else {
    res.status(200).json({ ok: true });
  }
};