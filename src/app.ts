import express, { Request, Response, NextFunction, Application } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config/config";
import { logger } from "./utils/logger";
import proxyRoutes from "./routes/proxy.routes";
import { requestLoggerMiddleware } from "./middleware/request.logger.middleware";

export class App {
  private app: Application;

  constructor() {
    this.app = express();
    this.initializeSecurityMiddleware();
    this.initializeParsingMiddleware();
    this.initializeLoggingMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeSecurityMiddleware(): void {
    // Helmet agrega varios headers de seguridad HTTP
    this.app.use(
      helmet({
        // Configuración personalizada de helmet
        contentSecurityPolicy: config.nodeEnv === "production",
        crossOriginEmbedderPolicy: false,
      })
    );

    // CORS - Configurar qué dominios pueden acceder a nuestra API
    this.app.use(
      cors({
        origin: (origin, callback) => {
          // Permitir peticiones sin origin (como Postman, curl, etc.) en desarrollo
          if (!origin && config.nodeEnv === "development") {
            return callback(null, true);
          }

          // Verificar si el origin está en la lista permitida
          if (!origin || config.cors.allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            logger.warn("CORS blocked request", { origin });
            callback(new Error("Not allowed by CORS"));
          }
        },
        credentials: true, // Permitir cookies y headers de autenticación
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
      })
    );

    // Rate limiting global - prevenir ataques de fuerza bruta
    const limiter = rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.maxRequests,
      message: {
        error: "Too Many Requests",
        message: `Too many requests from this IP, please try again after ${
          config.rateLimit.windowMs / 60000
        } minutes.`,
      },
      standardHeaders: true, // Retornar info de rate limit en headers RateLimit-*
      legacyHeaders: false, // Desactivar headers X-RateLimit-*
      // Función personalizada para generar la key (por defecto usa IP)
      keyGenerator: (req) => {
        // En producción podrías usar el user ID si está autenticado
        return req.user?.id || req.ip || "unknown";
      },
      // Función que se ejecuta cuando se alcanza el límite
      handler: (req, res) => {
        logger.warn("Rate limit exceeded", {
          ip: req.ip,
          userId: req.user?.id,
          path: req.path,
        });

        res.status(429).json({
          error: "Too Many Requests",
          message: "You have exceeded the rate limit. Please try again later.",
          retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
        });
      },
    });

    this.app.use(limiter);
  }

  private initializeParsingMiddleware(): void {
    // Parsear JSON bodies (con límite de tamaño para prevenir ataques)
    this.app.use(express.json({ limit: "10mb" }));

    // Parsear URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  }

  private initializeLoggingMiddleware(): void {
    this.app.use(requestLoggerMiddleware);
  }

  private initializeRoutes(): void {
    // Todas las rutas están definidas en proxy.routes.ts
    this.app.use("/", proxyRoutes);
  }

  private initializeErrorHandling(): void {
    // Este middleware captura cualquier error que no fue manejado antes
    this.app.use(
      (err: Error, req: Request, res: Response, next: NextFunction) => {
        logger.error("Unhandled error", {
          error: err.message,
          stack: err.stack,
          path: req.path,
          method: req.method,
          requestId: req.headers["x-request-id"],
        });

        // No exponer detalles del error en producción
        const message =
          config.nodeEnv === "production"
            ? "An internal server error occurred"
            : err.message;

        res.status(500).json({
          error: "Internal Server Error",
          message,
          requestId: req.headers["x-request-id"],
        });
      }
    );
  }

  public listen(port: number, callback?: () => void): void {
    this.app.listen(port, callback);
  }
}
