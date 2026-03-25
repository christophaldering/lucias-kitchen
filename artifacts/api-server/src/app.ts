import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";
import jwt from "jsonwebtoken";
import type { AuthUser } from "./routes/auth";

const JWT_SECRET = process.env["JWT_SECRET"] ?? "lucias-kueche-secret-key-2026";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ extended: true, limit: "500mb" }));

app.use((req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      req.authUser = jwt.verify(token, JWT_SECRET) as AuthUser;
    } catch {
    }
  }
  next();
});

app.use("/api/uploads", express.static(path.join(process.cwd(), "public", "uploads")));
app.use("/api", router);

if (process.env["NODE_ENV"] === "production") {
  const frontendDistPath = path.resolve(__dirname, "public");
  app.use(express.static(frontendDistPath));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

export default app;
