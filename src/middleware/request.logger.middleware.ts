// src/middleware/request-logger.middleware.ts
import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

// Generar un ID único para cada petición
// Esto nos permite rastrear una petición a través de múltiples servicios
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Obtener o generar request ID
  const requestId =
    (req.headers["x-request-id"] as string) || generateRequestId();
  req.headers["x-request-id"] = requestId;

  const startTime = Date.now();

  // Crear un logger específico para esta petición con contexto
  const requestLogger = logger.child({
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  // Loguear inicio de la petición
  requestLogger.info("Incoming request", {
    query: req.query,
    // No logueamos el body completo por seguridad (puede contener passwords)
    hasBody: Object.keys(req.body || {}).length > 0,
  });

  // Interceptar el método json de la respuesta para loguear cuando termine
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    const duration = Date.now() - startTime;

    requestLogger.info("Request completed", {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id || "anonymous",
    });

    return originalJson(body);
  };

  // También capturar si se envía la respuesta con send() en lugar de json()
  const originalSend = res.send.bind(res);
  res.send = function (body: any) {
    const duration = Date.now() - startTime;

    requestLogger.info("Request completed", {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id || "anonymous",
    });

    return originalSend(body);
  };

  next();
}
