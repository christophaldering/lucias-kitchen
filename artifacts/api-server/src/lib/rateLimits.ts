import rateLimit from "express-rate-limit";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.",
});

export const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 Minuten
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Zu viele KI-Anfragen. Bitte kurz warten.",
});

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 Minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
