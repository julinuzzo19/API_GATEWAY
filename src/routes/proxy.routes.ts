import { Router } from "express";
import { createProxyMiddleware, fixRequestBody } from "http-proxy-middleware";
import { config } from "../config/config";
import { logger } from "../utils/logger";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

/** Health check endpoint */
router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

/** Proxy Authentication */

router.use(
  "/auth",
  createProxyMiddleware({
    target: config.services.auth,
    changeOrigin: true,
    logger: console,
    pathRewrite: (path, _req) => {
      const newPath = `/api/auth${path}`;
      console.log(`[AUTH] Rewriting: ${path} -> ${newPath}`);
      return newPath;
    },
    on: {
      proxyReq: fixRequestBody, // Fix para reenviar el body correctamente
    },
  })
);

/** Proxy Ecommerce Protected routes */

router.use(
  "/ecommerce",
  authMiddleware,
  createProxyMiddleware({
    target: config.services.ecommerce,
    changeOrigin: true,
    logger: console,
    pathRewrite: (path, _req) => {
      const newPath = `/api/v1${path}`;
      console.log(`[ECOMMERCE] Rewriting: ${path} -> ${newPath}`);
      return newPath;
    },
    on: {
      proxyReq: fixRequestBody, // Fix para reenviar el body correctamente
    },
  })
);

// Catch-all para rutas no encontradas (al final)
router.use((req, res) => {
  logger.warn("Route not found", {
    path: req.originalUrl,
    method: req.method,
  });

  res.status(404).json({
    error: "Not Found",
    message: `El endpoint ${req.method} ${req.originalUrl} no existe`,
  });
});

export default router;
