export const config = {
  port: Number(process.env.PORT ?? 3000),
  rpId: process.env.RP_ID ?? "localhost",
  rpName: process.env.RP_NAME ?? "Household Finance OS",
  origin: process.env.ORIGIN ?? "http://localhost:5173",
  dbPath: process.env.DB_PATH ?? "./data/app.db",
  cookieSecure: process.env.COOKIE_SECURE === "true",
};
