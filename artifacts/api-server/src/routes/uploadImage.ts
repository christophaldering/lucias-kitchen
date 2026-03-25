import { Router, type IRouter } from "express";
import { imageUpload, handleImageUploadError, UPLOADS_DIR } from "../lib/imageUpload";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

const router: IRouter = Router();

function singleImageUploadMiddlewareWithWebP(req: Request, res: Response, next: NextFunction) {
  imageUpload.single("image")(req, res, async (err) => {
    if (handleImageUploadError(err, res)) return;
    if (!req.file) {
      next();
      return;
    }

    const originalPath = req.file.path;
    const webpFilename = `${randomUUID()}.webp`;
    const webpPath = path.join(UPLOADS_DIR, webpFilename);

    try {
      const sharp = (await import("sharp")).default;
      await sharp(originalPath).webp({ quality: 82 }).toFile(webpPath);
      fs.unlink(originalPath, () => {});
      req.file.filename = webpFilename;
      req.file.path = webpPath;
      req.file.mimetype = "image/webp";
    } catch {
    }

    next();
  });
}

router.post("/upload-image", singleImageUploadMiddlewareWithWebP, (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "no_file", message: "Keine Datei hochgeladen." });
    return;
  }
  const imageUrl = `/api/uploads/${req.file.filename}`;
  res.json({ imageUrl });
});

export default router;
