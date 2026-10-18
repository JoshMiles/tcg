# lib/env-health.ts

- EnvLevel · type · L4-L4 — type EnvLevel = 'required' | 'recommended' | 'optional';
- EnvGroup · type · L5-L5 — type EnvGroup = 'Admin' | 'Database' | 'Storage' | 'Twitch Extension' | 'Twitch API' | 'Website login' | 'Bot protection' | 'Legal pages' | 'Notifications';
- EnvSpec · interface · L7-L7 — interface EnvSpec
- EnvCheck · interface · L8-L8 — interface EnvCheck extends EnvSpec
- checkEnv · function · L42-L47 — function checkEnv(env: Record<string, string | undefined>, specs: EnvSpec[] = ENV_SPECS): EnvCheck[]
- EnvSummary · interface · L49-L49 — interface EnvSummary
- summarizeEnv · function · L51-L59 — function summarizeEnv(checks: EnvCheck[]): EnvSummary
- readEnv · function · L62-L64 — function readEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string | undefined>
