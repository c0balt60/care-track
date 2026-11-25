// The dev-only secret committed in .env.example (CMP-2 #40, "secrets only in env").
//
// It's public on purpose, so `cp .env.example .env` just works locally. That makes it useless
// as a real secret: anyone could sign a session cookie or call the cron with it. Policy says
// Vercel uses its own values (docs/auth-setup.md); this turns that policy into a check, so a
// copied .env.example fails loudly on a deployment instead of quietly shipping a public key.

/** The BETTER_AUTH_SECRET and CRON_SECRET value in .env.example. */
export const PUBLIC_DEV_SECRET = "rdlmD3AA00bCYqe5t6ifLqkRY92n982Tjf4lHfmmpqE=";

/** True on a Vercel deployment (production or preview). Local `pnpm dev` and `pnpm build` aren't. */
export const isDeployed = (vercelEnv = process.env.VERCEL_ENV) => vercelEnv === "production" || vercelEnv === "preview";

/** True when `value` is the public example secret on a deployment, where it must never be used. */
export const isPublicSecretOnDeployment = (value: string | undefined, vercelEnv = process.env.VERCEL_ENV) =>
  isDeployed(vercelEnv) && value === PUBLIC_DEV_SECRET;
