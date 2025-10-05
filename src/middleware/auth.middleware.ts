import { Request, Response, NextFunction } from "express";
import axios, { AxiosError } from "axios";
import { config } from "../config/config";
import { logger } from "../utils/logger";

// Interfaz para tipar la información del usuario
interface UserInfo {
  id: string;
  email: string;
  role: string;
}

// Extender el tipo Request de Express para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: UserInfo;
    }
  }
}

// Caché simple en memoria para evitar validar el mismo token múltiples veces
// En producción podrías usar Redis para compartir este caché entre instancias
interface TokenCacheEntry {
  user: UserInfo;
  expiry: number;
}

const tokenCache = new Map<string, TokenCacheEntry>();

// Limpiar tokens expirados del caché cada minuto
setInterval(() => {
  const now = Date.now();
  let deletedCount = 0;

  for (const [token, entry] of tokenCache.entries()) {
    if (entry.expiry < now) {
      tokenCache.delete(token);
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    logger.debug(`Cleaned ${deletedCount} expired tokens from cache`);
  }
}, 60000);

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const startTime = Date.now();

  try {
    console.log({ HEADERS: req.headers });
    // Extraer el token del header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      logger.warn("Request without Authorization header", {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });

      res.status(401).json({
        error: "Unauthorized",
        message:
          "No authorization token provided. Please include Authorization header with Bearer token.",
      });
      return;
    }

    if (!authHeader.startsWith("Bearer ")) {
      logger.warn("Invalid Authorization header format", {
        path: req.path,
        method: req.method,
      });

      res.status(401).json({
        error: "Unauthorized",
        message: "Authorization header must be in format: Bearer <token>",
      });
      return;
    }

    const token = authHeader.replace("Bearer ", "");

    // Verificar si el token está en caché y todavía es válido
    const cached = tokenCache.get(token);
    if (cached && cached.expiry > Date.now()) {
      logger.debug("Token found in cache", { userId: cached.user.id });

      // Setear headers para los microservicios
      req.headers["x-user-id"] = cached.user.id;
      req.headers["x-user-email"] = cached.user.email;
      req.headers["x-user-role"] = cached.user.role;
      req.headers["x-gateway-secret"] = config.security.gatewaySecret;

      req.user = cached.user;
      next();
      return;
    }

    // Token no está en caché, validar con Auth Service
    logger.debug("Validating token with Auth Service");

    const response = await axios.get(
      `${config.services.auth}/api/auth/validate`,
      {
        headers: {
          authorization: authHeader,
        },
        timeout: 5000, // Timeout de 5 segundos para evitar bloqueos largos
      }
    );

    // Verificar la respuesta del Auth Service
    if (!response.data.valid) {
      logger.warn("Token validation failed", {
        reason: response.data.error,
        path: req.path,
      });

      res.status(401).json({
        error: "Unauthorized",
        message: response.data.error || "Invalid or expired token",
      });
      return;
    }

    const user: UserInfo = response.data.user;

    // Guardar en caché por 5 minutos
    // Esto reduce significativamente la carga en el Auth Service
    tokenCache.set(token, {
      user,
      expiry: Date.now() + 5 * 60 * 1000,
    });

    logger.info("Token validated successfully", {
      userId: user.id,
      email: user.email,
      duration: `${Date.now() - startTime}ms`,
    });

    // Setear headers que los microservicios van a leer
    req.headers["x-user-id"] = user.id;
    req.headers["x-user-email"] = user.email;
    req.headers["x-user-role"] = user.role;
    req.headers["x-gateway-secret"] = config.security.gatewaySecret;

    // También adjuntar al objeto request para uso local si es necesario
    req.user = user;

    next();
  } catch (error) {
    const duration = Date.now() - startTime;

    // Manejar diferentes tipos de errores de forma específica
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.code === "ECONNREFUSED") {
        logger.error("Auth Service is unavailable", {
          url: config.services.auth,
          duration: `${duration}ms`,
        });

        res.status(503).json({
          error: "Service Unavailable",
          message:
            "Authentication service is temporarily unavailable. Please try again later.",
        });
        return;
      }

      if (axiosError.response?.status === 401) {
        logger.warn("Token rejected by Auth Service", {
          status: axiosError.response.status,
          duration: `${duration}ms`,
        });

        res.status(401).json({
          error: "Unauthorized",
          message: "Invalid or expired token",
        });
        return;
      }

      if (
        axiosError.code === "ETIMEDOUT" ||
        axiosError.code === "ECONNABORTED"
      ) {
        logger.error("Auth Service timeout", {
          duration: `${duration}ms`,
        });

        res.status(504).json({
          error: "Gateway Timeout",
          message: "Authentication service took too long to respond",
        });
        return;
      }
    }

    // Error genérico no manejado específicamente
    logger.error("Unexpected error in auth middleware", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    });

    res.status(500).json({
      error: "Internal Server Error",
      message: "An unexpected error occurred during authentication",
    });
  }
}

// Función auxiliar para limpiar el caché manualmente si es necesario
export function clearTokenCache(): void {
  const size = tokenCache.size;
  tokenCache.clear();
  logger.info(`Token cache cleared. Removed ${size} entries.`);
}
