// @ts-check
import { module } from "@prisma/composer";
import tradeautomateAiService from "./service.mjs";

export default module("tradeautomate-ai", ({ provision }) => {
  provision(tradeautomateAiService, { id: "tradeautomateai" });
});
