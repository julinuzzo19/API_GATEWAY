import { App } from "./app";
import { config } from "./config/config";
import { logger } from "./utils/logger";

const app = new App();

app.listen(config.port, () => {
  logger.info("🚀 API Gateway started successfully", {
    port: config.port,
    environment: config.nodeEnv,
    services: {
      auth: config.services.auth,
      ecommerce: config.services.ecommerce,
    },
  });
  
  console.log(`\n✨ API Gateway running on http://localhost:${config.port}`);
  console.log(`\n📋 Available routes:`);
  console.log(`   GET  /health - Health check`);
  console.log(`   POST /auth/login - Login`);
  console.log(`   POST /auth/register - Register`);
  console.log(`   *    /ecommerce/* - Ecommerce service (protected)\n`);
});
