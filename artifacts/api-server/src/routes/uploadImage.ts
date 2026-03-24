import { Router, type IRouter } from "express";
import { singleImageUploadMiddleware } from "../lib/imageUpload";

const router: IRouter = Router();

router.post("/upload-image", singleImageUploadMiddleware, (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "no_file", message: "Keine Datei hochgeladen." });
    return;
  }
  const imageUrl = `/api/uploads/${req.file.filename}`;
  res.json({ imageUrl });
});

export default router;
