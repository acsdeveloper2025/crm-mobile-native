import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ApiClient } from '../../api/apiClient';
import { ENDPOINTS } from '../../api/endpoints';
import { Logger } from '../../utils/logger';
import { AuthService } from '../../services/AuthService';
import type { MobileLoginResponse } from '../../types/api';

const TAG = 'LoginScreen';

export const LoginScreen = () => {
  const { login } = useAuth();
  const { theme } = useTheme();
  
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleLogin = async () => {
    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      Logger.info(TAG, `Attempting login for ${username}`);
      
      const deviceInfo = await AuthService.getDeviceInfo();
      const response = await ApiClient.post<MobileLoginResponse>(ENDPOINTS.AUTH.LOGIN, {
        username,
        password,
        deviceId: deviceInfo.deviceId,
        deviceInfo,
      });

      if (response && response.data && response.data.tokens) {
        await login(
          response.data.tokens.accessToken,
          response.data.user,
          response.data.tokens.refreshToken,
          response.data.tokens.expiresIn,
        );
      } else {
        setError('Invalid response from server');
      }
    } catch (e: any) {
      Logger.error(TAG, 'Login failed', e);
      setError(e.response?.data?.message || 'Login failed. Please check your credentials and internet connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.formContainer, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.title, { color: theme.colors.text }]}>CRM Mobile Native</Text>
        
        {error ? <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text> : null}

        <TextInput
          style={[styles.input, { 
            backgroundColor: theme.colors.surfaceAlt, 
            borderColor: theme.colors.border,
            color: theme.colors.text
          }]}
          placeholder="Email or Username"
          placeholderTextColor={theme.colors.textMuted}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!loading}
        />

        <TextInput
          style={[styles.input, { 
            backgroundColor: theme.colors.surfaceAlt, 
            borderColor: theme.colors.border,
            color: theme.colors.text
          }]}
          placeholder="Password"
          placeholderTextColor={theme.colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />

        <TouchableOpacity 
          style={[
            styles.button, 
            { backgroundColor: theme.colors.primary },
            loading && { backgroundColor: theme.colors.primaryLight }
          ]} 
          onPress={handleLogin}
          disabled={loading}>
          {loading ? (
             <ActivityIndicator color={theme.colors.surface} />
          ) : (
            <Text style={[styles.buttonText, { color: theme.colors.surface }]}>Sign In</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  formContainer: {
    padding: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    marginBottom: 16,
    textAlign: 'center',
  },
});
