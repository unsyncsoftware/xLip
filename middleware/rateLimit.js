import { rateLimit } from 'express-rate-limit';

export const guestShortenLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  skip: (req) => !!req.user,
  message: { error: 'Too many links created. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
