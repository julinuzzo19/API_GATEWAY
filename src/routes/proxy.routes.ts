// src/routes/proxy.routes.ts
import { Router, Request, Response } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { ClientRequest, IncomingMessage } from "http";
import { config } from "../config/config";
import { logger } from "../utils/logger";
import { authMiddleware } from "../middleware/auth.middleware";
import { ProxyOptions } from "../types";

const router = Router();

// Función auxiliar para crear configuración de proxy reutilizable
function createProxyConfig(
  target: string,
  pathRewrite?: { [key: string]: string }
): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    pathRewrite,

    // Interceptar la petición antes de enviarla al microservicio
    onProxyReq: (proxyReq: ClientRequest, req: Request) => {
      // Los headers ya fueron seteados por authMiddleware, solo los logueamos
      logger.debug("Proxying request to microservice", {
        target,
        path: req.path,
        userId: req.user?.id,
        requestId: req.headers["x-request-id"],
      });

      // Asegurarnos de que el Content-Type se preserve si existe
      if (req.body && Object.keys(req.body).length > 0) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader("Content-Type", "application/json");
        proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }
    },

    // Interceptar la respuesta del microservicio
    onProxyRes: (proxyRes: IncomingMessage, req: Request, res: Response) => {
      logger.debug("Received response from microservice", {
        target,
        statusCode: proxyRes.statusCode,
        requestId: req.headers["x-request-id"],
      });
    },

    // Manejar errores de conexión con el microservicio
    onError: (err: any, req: Request, res: Response) => {
      logger.error("Proxy error", {
        target,
        error: err.message,
        path: req.url,
        requestId: req.headers["x-request-id"],
      });

      // Enviar respuesta de error apropiada al cliente
      if (!res.headersSent) {
        res.status(503).json({
          error: "Service Unavailable",
          message: `The requested service is temporarily unavailable. Please try again later.`,
          service: target.split("//")[1]?.split(":")[0] || "unknown",
        });
      }
    },

    // Configuración de timeouts
    proxyTimeout: 30000, // 30 segundos
    timeout: 30000,
  };
}

// Ruta de health check del Gateway mismo (no necesita autenticación)
router.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "api-gateway",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// Rutas públicas - Auth Service (sin autenticación)
// Estas rutas permiten login, registro, etc. sin necesitar un token
router.use(
  "/api/auth",
  createProxyMiddleware(createProxyConfig(config.services.auth))
);

// Rutas protegidas - CompromisoPago Service
// Estas rutas requieren autenticación
router.use(
  "/api/v1",
  authMiddleware, // Validar JWT primero
  createProxyMiddleware(
    createProxyConfig(config.services.ecommerce, { "^/ecommerce": "" })
  )
);

// Ruta catch-all para rutas no encontradas
router.use((req, res) => {
  logger.warn("Route not found", {
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });

  res.status(404).json({
    error: "Not Found",
    message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist.`,
    availableRoutes: [
      // MOSTRAR LAS RUTAS DISPONIBLES
      "POST /auth/login",
      "POST /auth/register",
      "GET /api/compromisos",
      "POST /api/compromisos",
      "GET /api/facturas",
      "POST /api/facturas",
    ],
  });
});

export default router;
