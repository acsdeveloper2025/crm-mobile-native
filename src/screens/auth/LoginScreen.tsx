import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../context/AuthContext';
import { UppercaseTextInput } from '../../components/ui/UppercaseTextInput';
import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { validateResponse } from '../../api/schemas/runtime';
import { MobileLoginResponseSchema } from '../../api/schemas/auth.schema';
import { Logger } from '../../utils/logger';
import { AuthService } from '../../services/AuthService';
import { useTheme } from '../../context/ThemeContext';
import type { Theme } from '../../theme/Theme';
import type { MobileLoginResponse } from '../../types/api';

const TAG = 'LoginScreen';

// Resend is disabled for 60s after each code send — mirrors the web
// (OTP_RESEND_COOLDOWN_S) and the backend (OTP_RESEND_COOLDOWN_MS = 60_000).
const OTP_RESEND_COOLDOWN_S = 60;

// v1.0.7 (2026-04-22): reversed the M13 decision to hardcode dark chrome.
// Login now follows the active theme (system-respecting by default). All
// chrome colors — screen background, form card, inputs, borders, body
// text — pull from `theme.colors.*`, including the Sign-In button
// (`theme.colors.primary`, v2 brand blue). Only the brand pill (logo
// circle) stays fixed and the semantic error red is handled inline.

export const LoginScreen = () => {
  const { login } = useAuth();
  const { theme } = useTheme();
  const styles = React.useMemo(() => makeStyles(theme), [theme]);
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  // Client-side rate limiting: track failed attempts with exponential backoff
  const failedAttemptsRef = React.useRef(0);
  const lockoutUntilRef = React.useRef<number>(0);

  // ADR-0088 new-device OTP — same /auth/login path as web. A 401 OTP_REQUIRED
  // after a correct password puts the screen into an in-place code-entry step
  // (no navigation). `otpChallenge` holds the masked destinations; null = the
  // normal credential form.
  const [otpChallenge, setOtpChallenge] = React.useState<{
    email: string | null;
    sms: string | null;
  } | null>(null);
  const [otpCode, setOtpCode] = React.useState('');
  const [resendWait, setResendWait] = React.useState(0);

  // 60s resend cooldown countdown (mirrors web).
  React.useEffect(() => {
    if (resendWait <= 0) {
      return;
    }
    const t = setTimeout(() => setResendWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [resendWait]);

  const parseCredentials = React.useCallback(() => {
    const cleanUsername = username.trim();
    if (!password && cleanUsername.includes('/')) {
      const index = cleanUsername.indexOf('/');
      return {
        username: cleanUsername.slice(0, index).trim(),
        password: cleanUsername.slice(index + 1),
      };
    }
    return {
      username: cleanUsername,
      password,
    };
  }, [password, username]);

  const extractErrorMessage = React.useCallback((e: unknown): string => {
    // Handle session storage errors (from AuthService.login catch block)
    const errMsg = e instanceof Error ? e.message : String(e);
    const normalizedErrorText = errMsg.toLowerCase();
    if (errMsg.startsWith('SESSION_STORAGE_FAILED:')) {
      return errMsg.replace('SESSION_STORAGE_FAILED: ', '');
    }

    const axiosErr = e as any;
    const status = axiosErr?.response?.status;
    const responseData = axiosErr?.response?.data;
    // ADR-0054 Phase 5: the raw v2 error body is `{ error: "<CODE>", details?,
    // issues? }` — `responseData.error` is a CODE STRING (e.g. 'UNAUTHENTICATED',
    // 'VALIDATION'), there is no `message` and no nested `error.code`.
    const backendError =
      typeof responseData === 'string' ? '' : responseData?.error;

    // Specific HTTP status handlers
    if (status === 401) {
      return 'Invalid username or password.';
    }
    if (status === 423) {
      return 'Your account is temporarily locked after too many attempts. Please wait about 15 minutes and try again.';
    }
    if (status === 429) {
      return 'Too many login attempts. Please wait a few minutes before trying again.';
    }
    if (status === 403) {
      return 'Your account has been locked or disabled. Please contact your administrator.';
    }
    if (status >= 500) {
      return 'Server is temporarily unavailable. Please try again shortly.';
    }

    // Map the bare v2 error code to a friendly sentence; an unmapped code
    // falls back to a Title-Cased transform so the user never sees a raw enum.
    if (typeof backendError === 'string' && backendError.trim().length > 0) {
      const code = backendError.trim();
      const V2_LOGIN_ERROR_MESSAGES: Record<string, string> = {
        UNAUTHENTICATED: 'Invalid username or password.',
        VALIDATION: 'Please enter a valid username and password.',
        VERSION_REQUIRED:
          'This app version is no longer supported. Please update to continue.',
        FORBIDDEN:
          'Your account has been locked or disabled. Please contact your administrator.',
        ACCOUNT_LOCKED:
          'Your account is temporarily locked after too many attempts. Please wait about 15 minutes and try again.',
        // OTP_REQUIRED is intercepted upstream (routed to the code step); this
        // entry only guards against it ever falling through to the Title-Case
        // fallback ("Otp Required").
        OTP_REQUIRED: 'Enter the sign-in code we sent you.',
      };
      const mapped = V2_LOGIN_ERROR_MESSAGES[code];
      if (mapped) {
        return mapped;
      }
      return code
        .toLowerCase()
        .split(/[_\s]+/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }

    // Network-level error codes
    if (axiosErr?.code === 'ECONNABORTED') {
      return 'Request timed out. Check your internet connection and try again.';
    }
    if (axiosErr?.code === 'EPROTO' || axiosErr?.code?.startsWith?.('CERT')) {
      return 'Secure connection failed. Please check your device date/time settings or try a different network.';
    }
    if (
      normalizedErrorText.includes('handshake') ||
      normalizedErrorText.includes('trust anchor') ||
      normalizedErrorText.includes('certificate pin') ||
      normalizedErrorText.includes('cert path') ||
      normalizedErrorText.includes('ssl')
    ) {
      return 'Secure connection failed. The app could not verify the server certificate.';
    }
    if (!axiosErr?.response) {
      return 'Unable to reach server. Please check your internet connection and try again.';
    }
    return 'Login failed. Please check your credentials or internet connection.';
  }, []);

  // The single login POST — identical body for the initial attempt, the OTP
  // verify (adds otpCode), and the resend (omits otpCode). Same /auth/login
  // endpoint the web uses; OTP is purely additive (ADR-0088).
  const postLogin = async (
    parsed: { username: string; password: string },
    otpCodeArg?: string,
  ) => {
    const deviceInfo = await AuthService.getDeviceInfo();
    return ApiClient.post<MobileLoginResponse>(
      ENDPOINTS.AUTH.LOGIN,
      {
        username: parsed.username,
        password: parsed.password,
        deviceId: deviceInfo.deviceId,
        deviceInfo,
        ...(otpCodeArg ? { otpCode: otpCodeArg } : {}),
      },
      { headers: { 'Idempotency-Key': uuidv4() } },
    );
  };

  // A 401 whose body code is OTP_REQUIRED = the new-device challenge. Returns
  // the masked destinations (either may be null), or null if it isn't an OTP
  // challenge. Wire body is `{ error, details: { sentTo } }`.
  const readOtpChallenge = (
    e: unknown,
  ): { email: string | null; sms: string | null } | null => {
    const ax = e as {
      response?: {
        status?: number;
        data?: {
          error?: string;
          details?: { sentTo?: { email?: string | null; sms?: string | null } };
        };
      };
    };
    if (
      ax?.response?.status === 401 &&
      ax?.response?.data?.error === 'OTP_REQUIRED'
    ) {
      const sentTo = ax.response.data?.details?.sentTo;
      return { email: sentTo?.email ?? null, sms: sentTo?.sms ?? null };
    }
    return null;
  };

  // Finalize a successful login response (tokens present). Shared by the
  // initial, verify, and resend paths. Returns true on success.
  const finishLogin = async (
    response: MobileLoginResponse | undefined,
  ): Promise<boolean> => {
    // Drift detection at the auth boundary (non-fatal; logs, never blocks).
    validateResponse(MobileLoginResponseSchema, response, {
      service: 'auth',
      endpoint: 'POST /auth/login',
    });
    if (response?.tokens) {
      failedAttemptsRef.current = 0;
      lockoutUntilRef.current = 0;
      await login(
        response.tokens.accessToken,
        response.user,
        response.tokens.refreshToken,
        response.tokens.expiresIn,
      );
      return true;
    }
    return false;
  };

  // "We sent a code to r***@x.com and ******7890" — join whichever masked
  // channels the server actually delivered on (mirrors web otpSentToLabel).
  const otpSentToLabel = (): string =>
    otpChallenge
      ? [otpChallenge.email, otpChallenge.sms].filter(Boolean).join(' and ')
      : '';

  const handleLogin = async () => {
    const parsed = parseCredentials();
    if (!parsed.username || !parsed.password) {
      setError('Please enter both username and password');
      return;
    }

    // Client-side rate limiting with exponential backoff
    const now = Date.now();
    if (now < lockoutUntilRef.current) {
      const remainingSec = Math.ceil((lockoutUntilRef.current - now) / 1000);
      setError(
        `Too many failed attempts. Please wait ${remainingSec} seconds before trying again.`,
      );
      return;
    }

    setLoading(true);
    setError('');

    try {
      // S6 (audit 2026-04-21 round 2): plain "Attempting login" — no username
      // in the message (the logger redactor can't reach interpolated strings).
      // C20: postLogin adds a per-attempt Idempotency-Key so the backend
      // collapses duplicate sessions on impatient re-taps.
      Logger.info(TAG, 'Attempting login');
      const response = await postLogin(parsed);
      if (!(await finishLogin(response))) {
        setError('Invalid response from server');
      }
    } catch (e: unknown) {
      // New-device OTP challenge (ADR-0088): correct password, code sent —
      // switch to the in-place code step. This is NOT a failed attempt, so it
      // must return BEFORE the client backoff counter below.
      const challenge = readOtpChallenge(e);
      if (challenge) {
        setOtpChallenge(challenge);
        setOtpCode('');
        setResendWait(OTP_RESEND_COOLDOWN_S);
        return;
      }
      Logger.error(TAG, 'Login failed', e);
      // Exponential backoff: 5s, 10s, 20s, 40s, 60s max
      failedAttemptsRef.current += 1;
      if (failedAttemptsRef.current >= 3) {
        const backoffMs = Math.min(
          5000 * Math.pow(2, failedAttemptsRef.current - 3),
          60000,
        );
        lockoutUntilRef.current = Date.now() + backoffMs;
      }
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  // Answer the OTP challenge: re-POST the SAME credentials plus the code.
  const handleVerifyOtp = async () => {
    const code = otpCode.trim();
    if (!code) {
      setError('Please enter the code we sent you.');
      return;
    }
    const parsed = parseCredentials();
    setLoading(true);
    setError('');
    try {
      const response = await postLogin(parsed, code);
      if (!(await finishLogin(response))) {
        setError('Invalid response from server');
      }
    } catch (e: unknown) {
      const ax = e as {
        response?: { status?: number; data?: { error?: string } };
      };
      if (
        ax?.response?.status === 423 ||
        ax?.response?.data?.error === 'ACCOUNT_LOCKED'
      ) {
        // Too many wrong codes (server bounds attempts at 5 → 15-min lock).
        setOtpCode('');
        setError(extractErrorMessage(e));
        return;
      }
      const challenge = readOtpChallenge(e);
      if (challenge) {
        // Wrong or expired code — the same challenge is re-armed. The server
        // enforces the attempt cap; no client backoff here (mirrors web).
        setOtpChallenge(challenge);
        setOtpCode('');
        setError('Invalid or expired code. Try again.');
        return;
      }
      Logger.error(TAG, 'OTP verify failed', e);
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  // Resend the SAME code: re-POST WITHOUT otpCode. The backend re-delivers if
  // past its 60s cooldown and under the 3-send cap; the client button is also
  // 60s-gated so the two agree. If the gate has since cleared, this logs in.
  const handleResendOtp = async () => {
    if (resendWait > 0 || loading) {
      return;
    }
    const parsed = parseCredentials();
    setLoading(true);
    setError('');
    try {
      const response = await postLogin(parsed);
      if (await finishLogin(response)) {
        return;
      }
      setResendWait(OTP_RESEND_COOLDOWN_S);
    } catch (e: unknown) {
      const challenge = readOtpChallenge(e);
      if (challenge) {
        // Expected: the server re-challenges (401) — reset the cooldown.
        setOtpChallenge(challenge);
        setResendWait(OTP_RESEND_COOLDOWN_S);
        return;
      }
      Logger.error(TAG, 'OTP resend failed', e);
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  // Abandon the challenge and return to the credential form.
  const handleBackToLogin = () => {
    setOtpChallenge(null);
    setOtpCode('');
    setResendWait(0);
    setError('');
  };

  return (
    // U14 (audit 2026-04-21 round 2): wrap in SafeAreaView so on
    // notched devices the welcome text doesn't collide with the
    // status bar / home indicator.
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardContainer}
      >
        <View style={styles.content}>
          <View style={styles.headerSection}>
            <View style={styles.logoCircle}>
              <Image
                source={require('../../assets/images/company-logo-square.png')}
                style={styles.logoImage}
                resizeMode="cover"
              />
            </View>
            <Text style={styles.title}>CRM Mobile</Text>
            <Text style={styles.subtitle}>Verification Management System</Text>
          </View>

          <View style={styles.formContainer}>
            {error ? (
              <Text
                style={[styles.errorText, { color: theme.colors.danger }]}
                numberOfLines={3}
                ellipsizeMode="tail"
              >
                {error}
              </Text>
            ) : null}

            {otpChallenge ? (
              <>
                <Text style={styles.otpHint}>
                  {otpSentToLabel()
                    ? `We sent a sign-in code to ${otpSentToLabel()}.`
                    : 'We sent a sign-in code to your registered contact.'}
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    Sign-in code{' '}
                    <Text
                      style={[styles.required, { color: theme.colors.danger }]}
                    >
                      *
                    </Text>
                  </Text>
                  <UppercaseTextInput
                    name="otp"
                    uppercase={false}
                    style={styles.input}
                    placeholder="6-digit code"
                    placeholderTextColor={theme.colors.textMuted}
                    value={otpCode}
                    onChangeText={setOtpCode}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    autoFocus
                    maxLength={6}
                    editable={!loading}
                    testID="login-otp-input"
                    accessibilityLabel="Sign-in code input"
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.button,
                    { backgroundColor: theme.colors.primary },
                    (loading || !otpCode.trim()) && styles.buttonDisabled,
                  ]}
                  onPress={handleVerifyOtp}
                  disabled={loading || !otpCode.trim()}
                  testID="login-verify-button"
                  accessibilityLabel="Verify sign-in code button"
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" testID="login-loading" />
                  ) : (
                    <Text style={styles.buttonText}>Verify &amp; Sign In</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={handleResendOtp}
                  disabled={loading || resendWait > 0}
                  testID="login-resend-button"
                  accessibilityLabel="Resend sign-in code"
                >
                  <Text
                    style={[
                      styles.linkText,
                      {
                        color:
                          resendWait > 0
                            ? theme.colors.textMuted
                            : theme.colors.primary,
                      },
                    ]}
                  >
                    {resendWait > 0
                      ? `Resend code (${resendWait}s)`
                      : 'Resend code'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={handleBackToLogin}
                  disabled={loading}
                  testID="login-back-button"
                  accessibilityLabel="Use a different account"
                >
                  <Text
                    style={[styles.linkText, { color: theme.colors.textMuted }]}
                  >
                    Use a different account
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    Username{' '}
                    <Text
                      style={[styles.required, { color: theme.colors.danger }]}
                    >
                      *
                    </Text>
                  </Text>
                  <UppercaseTextInput
                    name="username"
                    uppercase={false}
                    style={styles.input}
                    placeholder="Enter your username"
                    placeholderTextColor={theme.colors.textMuted}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                    testID="login-username-input"
                    accessibilityLabel="Username input"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    Password{' '}
                    <Text
                      style={[styles.required, { color: theme.colors.danger }]}
                    >
                      *
                    </Text>
                  </Text>
                  <UppercaseTextInput
                    name="password"
                    uppercase={false}
                    style={styles.input}
                    placeholder="Enter your password"
                    placeholderTextColor={theme.colors.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    editable={!loading}
                    testID="login-password-input"
                    accessibilityLabel="Password input"
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.button,
                    { backgroundColor: theme.colors.primary },
                    loading && styles.buttonDisabled,
                  ]}
                  onPress={handleLogin}
                  disabled={loading}
                  testID="login-submit-button"
                  accessibilityLabel="Sign in button"
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" testID="login-loading" />
                  ) : (
                    <Text style={styles.buttonText}>Sign In</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

/**
 * Theme-aware stylesheet factory. Memoized by the caller so the
 * StyleSheet is only recomputed when the theme object actually swaps
 * (system light↔dark toggle, or manual user preference change).
 *
 * Colors chosen to map 1:1 to the intended visual weight across themes:
 *   container.background    → theme.colors.background  (page)
 *   formContainer           → theme.colors.surface     (elevated card)
 *   input                   → theme.colors.surfaceAlt  (recessed field)
 *   title / fieldLabel      → theme.colors.text        (primary text)
 *   subtitle                → theme.colors.textMuted   (secondary text)
 *   input border            → theme.colors.border
 *   logoCircle              → pure white pill (brand-neutral, stays same)
 *   Sign-In button          → theme.colors.primary (v2 brand blue)
 *   error / required        → theme.colors.danger (handled inline in JSX)
 */
const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    keyboardContainer: {
      flex: 1,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    headerSection: {
      alignItems: 'center',
      marginBottom: 20,
    },
    logoCircle: {
      width: 80,
      height: 80,
      backgroundColor: '#ffffff',
      borderRadius: 40,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 4,
    },
    logoImage: {
      width: '100%',
      height: '100%',
    },
    title: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 4,
    },
    subtitle: {
      color: theme.colors.textMuted,
      fontSize: 14,
      textAlign: 'center',
    },
    formContainer: {
      width: '100%',
      maxWidth: 400,
      alignSelf: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 6,
    },
    fieldGroup: {
      marginBottom: 16,
    },
    fieldLabel: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 6,
    },
    required: {
      color: theme.colors.danger,
    },
    input: {
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: 8,
      padding: 12,
      color: theme.colors.text,
      fontSize: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      minHeight: 44,
    },
    button: {
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
      padding: 14,
      alignItems: 'center',
      minHeight: 48,
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 4,
    },
    buttonDisabled: {
      backgroundColor: theme.colors.textMuted,
    },
    buttonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: 'bold',
    },
    errorText: {
      color: theme.colors.danger,
      marginBottom: 16,
      textAlign: 'center',
    },
    otpHint: {
      color: theme.colors.textMuted,
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 16,
    },
    linkButton: {
      alignItems: 'center',
      paddingVertical: 12,
      minHeight: 44,
      justifyContent: 'center',
    },
    linkText: {
      fontSize: 14,
      fontWeight: '600',
    },
  });
