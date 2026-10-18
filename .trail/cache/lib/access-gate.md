# lib/access-gate.ts

- GateOutcome · type · L6-L10 — type GateOutcome = | 'pass' // let the request through | 'refresh' // signed in but no usable access cookie: /auth/access checks the lists and issues one | 'closed' // nobody signed in: the /closed page | 'forbidden';
- gateDecision · function · L16-L24 — function gateDecision(input: { pathname: string; settings: AccessSettings | null; access: AccessToken | null; staffCookie: boolean; hasSession: boolean }): GateOutcome
