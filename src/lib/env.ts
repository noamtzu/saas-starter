/** Public base URL of the app, without a trailing slash. */
export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export const authProviders = {
  github: Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET),
  /** Magic links always work: over SMTP when EMAIL_SERVER is set, otherwise logged to the console in development. */
  email: Boolean(process.env.EMAIL_SERVER) || process.env.NODE_ENV !== "production",
};
