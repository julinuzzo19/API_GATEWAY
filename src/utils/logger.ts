// src/utils/logger.ts
import winston from "winston";
import { config } from "../config/config";

// Formato personalizado para development que es más legible
const developmentFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    // Si hay metadata adicional, la mostramos de forma legible
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata, null, 2)}`;
    }

    return msg;
  })
);

// Formato para production que es más estructurado y fácil de parsear
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Crear el logger con configuración diferente según el ambiente
export const logger = winston.createLogger({
  level: config.logging.level,
  format:
    config.nodeEnv === "production" ? productionFormat : developmentFormat,
  defaultMeta: {
    service: "api-gateway",
    environment: config.nodeEnv,
  },
  transports: [
    // Siempre logueamos a la consola
    new winston.transports.Console(),

    // En producción, también guardamos logs en archivos
    ...(config.nodeEnv === "production"
      ? [
          new winston.transports.File({
            filename: "logs/error.log",
            level: "error",
          }),
          new winston.transports.File({
            filename: "logs/combined.log",
          }),
        ]
      : []),
  ],
});

// Si no estamos en producción, loguear que el sistema está listo
if (config.nodeEnv !== "production") {
  logger.info("Logger initialized in development mode");
}
