import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { Logger } from '../../utils/logger';
import { AuthService } from '../../services/AuthService';
import type { MobileLoginResponse } from '../../types/api';

const TAG = 'LoginScreen';

export const LoginScreen = () => {
  const { login } = useAuth();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  // Client-side rate limiting: track failed attempts with exponential backoff
  const failedAttemptsRef = React.useRef(0);
  const lockoutUntilRef = React.useRef<number>(0);

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
    if (errMsg.startsWith('SESSION_STORAGE_FAILED:')) {
      return errMsg.replace('SESSION_STORAGE_FAILED: ', '');
    }

    const axiosErr = e as any;
    const status = axiosErr?.response?.status;
    const responseData = axiosErr?.response?.data;
    const backendMessage =
      typeof responseData === 'string' ? '' : responseData?.message;
    const backendError =
      typeof responseData === 'string' ? '' : responseData?.error;
    const nestedError =
      typeof responseData === 'string' ? '' : responseData?.data?.error;

    // Specific HTTP status handlers
    if (status === 401) {
      return 'Invalid username or password.';
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

    if (typeof backendError === 'string' && backendError.trim().length > 0) {
      return backendError;
    }
    if (typeof nestedError === 'string' && nestedError.trim().length > 0) {
      return nestedError;
    }
    if (typeof backendMessage === 'string' && backendMessage.trim().length > 0) {
      return backendMessage;
    }

    // Network-level error codes
    if (axiosErr?.code === 'ECONNABORTED') {
      return 'Request timed out. Check your internet connection and try again.';
    }
    if (axiosErr?.code === 'EPROTO' || axiosErr?.code?.startsWith?.('CERT')) {
      return 'Secure connection failed. Please check your device date/time settings or try a different network.';
    }
    if (!axiosErr?.response) {
      return 'Unable to reach server. Please check your internet connection and try again.';
    }
    return 'Login failed. Please check your credentials or internet connection.';
  }, []);

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
      setError(`Too many failed attempts. Please wait ${remainingSec} seconds before trying again.`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      Logger.info(TAG, `Attempting login for ${parsed.username}`);

      const deviceInfo = await AuthService.getDeviceInfo();
      const response = await ApiClient.post<MobileLoginResponse>(ENDPOINTS.AUTH.LOGIN, {
        username: parsed.username,
        password: parsed.password,
        deviceId: deviceInfo.deviceId,
        deviceInfo,
      });

      if (response?.data?.tokens) {
        // Reset rate limiting on successful login
        failedAttemptsRef.current = 0;
        lockoutUntilRef.current = 0;
        await login(
          response.data.tokens.accessToken,
          response.data.user,
          response.data.tokens.refreshToken,
          response.data.tokens.expiresIn,
        );
      } else {
        setError('Invalid response from server');
      }
    } catch (e: unknown) {
      Logger.error(TAG, 'Login failed', e);
      // Exponential backoff: 5s, 10s, 20s, 40s, 60s max
      failedAttemptsRef.current += 1;
      if (failedAttemptsRef.current >= 3) {
        const backoffMs = Math.min(5000 * Math.pow(2, failedAttemptsRef.current - 3), 60000);
        lockoutUntilRef.current = Date.now() + backoffMs;
      }
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardContainer}>
        <View style={styles.content}>
          <View style={styles.headerSection}>
            <View style={styles.logoCircle}>
              <Image source={require('../../assets/images/company-logo-square.png')} style={styles.logoImage} resizeMode="cover" />
            </View>
            <Text style={styles.title}>CaseFlow Mobile</Text>
            <Text style={styles.subtitle}>Verification Management System</Text>
          </View>

          <View style={styles.formContainer}>
            {error ? (
              <Text style={styles.errorText} numberOfLines={3} ellipsizeMode="tail">
                {error}
              </Text>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                Username <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your username"
                placeholderTextColor="#9CA3AF"
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
                Password <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!loading}
                testID="login-password-input"
                accessibilityLabel="Password input"
              />
            </View>

            <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleLogin} disabled={loading} testID="login-submit-button" accessibilityLabel="Sign in button">
              {loading ? <ActivityIndicator color="#ffffff" testID="login-loading" /> : <Text style={styles.buttonText}>Sign In</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
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
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: '#1F2937',
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
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  required: {
    color: '#ef4444',
  },
  input: {
    backgroundColor: '#374151',
    borderRadius: 8,
    padding: 12,
    color: '#ffffff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#4B5563',
    minHeight: 44,
  },
  button: {
    backgroundColor: '#00a950',
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
    backgroundColor: '#6B7280',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#ef4444',
    marginBottom: 16,
    textAlign: 'center',
  },
});
