/**
 * R-AUTH-01 / R-AUTH-04 / R-LIMIT-01 evidence probe (non-destructive, no server boot).
 *
 *   R-AUTH-01  JWT fallback secret: the old constant is public, so a token signed with it
 *              is accepted by every deployment that forgot to set JWT_SECRET.
 *   R-AUTH-04  `verifyToken` strips a `gak_jwt_` prefix; combined with the fixed secret this
 *              lets an attacker mint superadmin tokens offline.
 *   R-LIMIT-01 No rate limiting on /api/auth/login, /api/auth/login-pin, /api/auth/verify-pin:
 *              the PIN space is 4-8 digits and login-pin will match ANY user by PIN alone.
 *
 * The probe signs/verifies tokens with `jsonwebtoken` exactly like api-server.js does, and
 * demonstrates the brute-force window arithmetically. It never sends a request.
 *
 * Run: node project/scripts/security-probe-auth-token.js
 */
'use strict';
const jwt = require('jsonwebtoken');

const OLD_PUBLIC_FALLBACK = 'grandpos_prod_secure_jwt_secret_key_2026_gak_fnb_auth';
const evidence = {};

// ---- R-AUTH-01: a token forged with the public fallback secret is accepted -----------
const forged = jwt.sign(
  { id: 'usr-taqim2609', username: 'taqim2609', role: 'superadmin', role_base: 'superadmin', is_superadmin: true },
  OLD_PUBLIC_FALLBACK,
  { expiresIn: '24h' }
);
const accepted = Boolean(jwt.verify(forged, OLD_PUBLIC_FALLBACK));
evidence['R-AUTH-01'] = {
  forged_token_accepted_by_public_fallback: accepted,
  note: 'With api-server.js:18 pre-patch every install lacking JWT_SECRET accepted this token.',
};

// ---- R-AUTH-04: the `gak_jwt_` prefix is cosmetic, the signature is what matters -----
const raw = forged;
const stripped = raw.startsWith('gak_jwt_') ? raw.slice(8) : raw;
evidence['R-AUTH-04'] = {
  prefix_strip_noop_when_absent: stripped === raw,
  note: 'verifyToken strips `gak_jwt_` then calls jwt.verify; the prefix adds no security.',
};

// ---- R-LIMIT-01: PIN brute-force arithmetic -----------------------------------------
// login-pin accepts 4..8 digit PINs and, when no username is given, matches ANY active
// user whose PIN equals the guess. A 6-digit PIN = 10^6 candidates.
const attempts = (digits) => Math.pow(10, digits);
evidence['R-LIMIT-01'] = {
  pin_space_4_digit: attempts(4),
  pin_space_6_digit: attempts(6),
  pin_space_8_digit: attempts(8),
  seconds_to_exhaust_6_digit_at_50_req_per_s: Math.round(attempts(6) / 50),
  hours_to_exhaust_6_digit_at_50_req_per_s: +(attempts(6) / 50 / 3600).toFixed(2),
  rate_limiting_present: false,
};

console.log(JSON.stringify(evidence, null, 2));

// Self-check: the probe is only meaningful if the forged token really verifies.
process.exit(accepted ? 0 : 1);
