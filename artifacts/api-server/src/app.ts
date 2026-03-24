import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import jwt from "jsonwebtoken";
import type { AuthUser } from "./routes/auth";

const JWT_SECRET = process.env["JWT_SECRET"] ?? "lucias-kueche-secret-key-2026";

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

export default app;
