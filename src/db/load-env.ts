// Scripts run outside Next.js, which would otherwise load .env for us.
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment (CI, containers).
}
