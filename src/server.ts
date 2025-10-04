import { App } from "./app";
import { config } from "./config/config";

const app = new App();
app.listen(config.port, () => {
  console.log(`Server is running on port ${config.port}`);
});
