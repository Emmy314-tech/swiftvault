export const getMongoDatabaseName = (mongoUri) => {
  try {
    const parsed = new URL(mongoUri);
    if (!["mongodb:", "mongodb+srv:"].includes(parsed.protocol)) {
      const error = new Error("MONGO_URI must be a valid MongoDB connection URI.");
      error.code = "MONGO_URI_INVALID";
      throw error;
    }
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0]);
  } catch {
    const error = new Error("MONGO_URI must be a valid MongoDB connection URI.");
    error.code = "MONGO_URI_INVALID";
    throw error;
  }
};

export const assertMongoDatabaseTarget = (mongoUri, nodeEnv) => {
  const databaseName = getMongoDatabaseName(mongoUri);
  if (nodeEnv === "staging" && databaseName !== "swiftvault_staging") {
    const error = new Error("NODE_ENV=staging requires the dedicated swiftvault_staging database.");
    error.code = "MONGO_STAGING_TARGET_INVALID";
    throw error;
  }
  return databaseName;
};
