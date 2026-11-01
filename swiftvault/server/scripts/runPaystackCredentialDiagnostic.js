import "dotenv/config";
import mongoose from "mongoose";
import { getCredential } from "../services/settingsService.js";
import { runPaystackCredentialDiagnostic } from "../services/paystackCredentialDiagnostic.js";

const safeResult = (result) => ({
  authenticated: result.authenticated === true,
  httpStatus: Number.isInteger(result.httpStatus) ? result.httpStatus : null,
});

const isMongoAtlasSrvUri = (uri) => {
  if (typeof uri !== "string") return false;
  try {
    const parsed = new URL(uri);
    return parsed.protocol === "mongodb+srv:" && parsed.hostname.toLowerCase().endsWith(".mongodb.net");
  } catch {
    return false;
  }
};

const printResult = (result) => console.log(JSON.stringify(safeResult(result)));

const main = async () => {
  const env = process.env;
  if (
    env.PAYSTACK_CREDENTIAL_DIAGNOSTIC_ENABLED !== "true" ||
    env.NODE_ENV !== "development" ||
    env.PAYSTACK_LIVE_PAYMENTS_ENABLED !== "false" ||
    !isMongoAtlasSrvUri(env.MONGO_URI)
  ) {
    printResult({ authenticated: false, httpStatus: null });
    process.exitCode = 1;
    return;
  }

  let connected = false;
  try {
    await mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 3000,
      readPreference: "primary",
    });
    connected = true;

    const result = await runPaystackCredentialDiagnostic({
      env,
      getSecretKey: () => getCredential("paystackSecretKey", { createSettingsIfMissing: false }),
    });
    printResult(result);
    if (!result.authenticated) process.exitCode = 1;
  } catch {
    printResult({ authenticated: false, httpStatus: null });
    process.exitCode = 1;
  } finally {
    if (connected) await mongoose.disconnect().catch(() => {});
  }
};

main();