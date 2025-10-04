// src/types/index.ts
import { Request, Response } from "express";
import { Options } from "http-proxy-middleware";
import { ClientRequest, IncomingMessage } from "http";

// Extender Options para incluir los callbacks con tipos correctos
export interface ProxyOptions extends Options {
  onProxyReq?: (proxyReq: ClientRequest, req: Request) => void;
  onProxyRes?: (proxyRes: IncomingMessage, req: Request, res: Response) => void;
  onError?: (err: Error, req: Request, res: Response) => void;
}