// Mirror of CRM-FRONTEND/src/lib/uppercase.ts. Kept as a verbatim port so
// both apps apply the same exclusion policy for user-typed values.
//
// A `TextInput` / screen field is kept mixed-case when:
//   - the field's `name` matches a case-sensitive token (email, token,
//     url, path, otp, etc.), OR
//   - the caller passes `uppercase={false}` as an explicit opt-out.
//
// RN has no `type` attribute on TextInput the way HTML does, so this file
// omits the type-based exclusion list and relies on name + explicit opt-out.
// Callers with clear case-sensitivity (password, email, date, number) should
// either pass `uppercase={false}` OR use a `name` that matches the token list.

const CASE_SENSITIVE_NAME_TOKENS = [
  'email',
  'mail',
  'password',
  'pwd',
  'passwd',
  'username',
  'url',
  'link',
  'website',
  'domain',
  'token',
  'jwt',
  'secret',
  'apikey',
  'otp',
  'pin',
  'filename',
  'filepath',
  'path',
];

function isCaseSensitiveName(name: string): boolean {
  const fullAlnum = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const segments = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
    .split(/[_\-\s]+/)
    .filter(Boolean);
  return CASE_SENSITIVE_NAME_TOKENS.some(
    token => fullAlnum === token || segments.includes(token),
  );
}

export function shouldUppercaseField(
  name?: string,
  explicit?: boolean,
): boolean {
  if (explicit === false) {
    return false;
  }
  if (explicit === true) {
    return true;
  }
  if (name && isCaseSensitiveName(name)) {
    return false;
  }
  return true;
}

export function toUpperCaseSafe(value: unknown): string {
  if (value == null) {
    return '';
  }
  return String(value).toUpperCase();
}
