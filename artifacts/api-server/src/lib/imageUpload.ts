import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

export const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const imageUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Ungültiger Dateityp: ${file.mimetype}. Erlaubt sind nur Bilder (JPEG, PNG, WebP, GIF, HEIC).`));
    }
  },
});

export function handleImageUploadError(err: unknown, res: Response): boolean {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "file_too_large", message: "Datei zu groß. Maximal 10 MB erlaubt." });
    } else {
      res.status(400).json({ error: "upload_error", message: (err as multer.MulterError).message });
    }
    return true;
  }
  if (err) {
    res.status(400).json({ error: "invalid_file", message: (err as Error).message });
    return true;
  }
  return false;
}

export function singleImageUploadMiddleware(req: Request, res: Response, next: NextFunction) {
  imageUpload.single("image")(req, res, (err) => {
    if (handleImageUploadError(err, res)) return;
    next();
  });
}
