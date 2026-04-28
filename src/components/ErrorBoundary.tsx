import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Appearance,
  DevSettings,
  type ColorSchemeName,
  type NativeEventSubscription,
} from 'react-native';
import { Logger } from '../utils/logger';
import { RemoteLogService } from '../services/RemoteLogService';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  showDetails: boolean;
  // Appearance API can return null (never set) or undefined in some
  // environments, so mirror the SDK signature rather than force-cast.
  colorScheme: ColorSchemeName | null | undefined;
}

// ErrorBoundary is a class component (React requires
// componentDidCatch/getDerivedStateFromError for error boundaries) and
// runs OUTSIDE the ThemeContext provider — it must keep working even if
// ThemeContext itself throws. So instead of useTheme, we subscribe to
// the platform Appearance API directly and re-render when the system
// theme flips. Previously we read Appearance.getColorScheme() once at
// render which produced stale chrome on live theme changes.
class ErrorBoundary extends Component<Props, State> {
  private appearanceSubscription: NativeEventSubscription | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      showDetails: false,
      colorScheme: Appearance.getColorScheme(),
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, showDetails: false };
  }

  componentDidMount() {
    // Live-subscribe so the error screen adapts if the user toggles
    // their system theme while the crash UI is on screen.
    this.appearanceSubscription = Appearance.addChangeListener(
      ({ colorScheme }) => {
        this.setState({ colorScheme });
      },
    );
  }

  componentWillUnmount() {
    this.appearanceSubscription?.remove();
    this.appearanceSubscription = null;
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log crash details via structured logger (persisted for sync to server)
    Logger.error('ErrorBoundary', 'Unhandled React crash', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    // 2026-04-27 deep-audit fix: ship the local log ring buffer to the
    // backend telemetry endpoint so crash data actually leaves the device.
    // RemoteLogService.upload is non-blocking and swallows its own errors —
    // see file header. Cannot await here (componentDidCatch is sync).
    // eslint-disable-next-line no-void
    void RemoteLogService.upload({ source: 'crash' });

    this.setState({
      error,
      errorInfo,
    });
  }

  private getThemeColors() {
    const isDark = this.state.colorScheme === 'dark';

    if (isDark) {
      return {
        background: '#111827',
        card: '#1f2937',
        text: '#f9fafb',
        error: '#ef4444',
        warning: '#fbbf24',
        info: '#60a5fa',
        errorLight: '#f87171',
        primary: '#3b82f6',
      };
    } else {
      return {
        background: '#ffffff',
        card: '#f3f4f6',
        text: '#111827',
        error: '#dc2626',
        warning: '#d97706',
        info: '#2563eb',
        errorLight: '#ef4444',
        primary: '#3b82f6',
      };
    }
  }

  private handleRecover = () => {
    if (__DEV__) {
      DevSettings.reload();
      return;
    }

    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      showDetails: false,
    });
  };

  render() {
    if (this.state.hasError) {
      const colors = this.getThemeColors();

      return (
        <View
          style={[styles.container, { backgroundColor: colors.background }]}
        >
          <Text style={[styles.title, { color: colors.error }]}>
            Something went wrong!
          </Text>

          {__DEV__ ? (
            <>
              <TouchableOpacity
                onPress={() =>
                  this.setState({ showDetails: !this.state.showDetails })
                }
                style={styles.detailsToggle}
              >
                <Text
                  style={[styles.detailsToggleText, { color: colors.primary }]}
                >
                  {this.state.showDetails
                    ? 'Hide error details'
                    : 'Show error details'}
                </Text>
              </TouchableOpacity>

              {this.state.showDetails && (
                <ScrollView
                  style={[
                    styles.detailsContainer,
                    { backgroundColor: colors.card },
                  ]}
                >
                  <Text style={styles.detailLabel}>Error:</Text>
                  <Text style={[styles.detailValue, { color: colors.warning }]}>
                    {this.state.error && this.state.error.toString()}
                  </Text>

                  <Text style={styles.detailLabel}>Component Stack:</Text>
                  <Text style={[styles.detailValue, { color: colors.info }]}>
                    {this.state.errorInfo &&
                      this.state.errorInfo.componentStack}
                  </Text>

                  <Text style={styles.detailLabel}>Error Stack:</Text>
                  <Text
                    style={[styles.detailValue, { color: colors.errorLight }]}
                  >
                    {this.state.error && this.state.error.stack}
                  </Text>
                </ScrollView>
              )}
            </>
          ) : (
            <Text
              style={[
                styles.detailValue,
                styles.errorMessage,
                { color: colors.info },
              ]}
            >
              An unexpected error occurred. Please try again or contact support
              if the problem persists.
            </Text>
          )}

          <TouchableOpacity
            onPress={this.handleRecover}
            style={[styles.reloadBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.reloadBtnText}>
              {__DEV__ ? 'Reload App' : 'Try Again'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  detailsToggle: {
    padding: 10,
    marginBottom: 10,
  },
  detailsToggleText: {
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  detailsContainer: {
    maxHeight: 400,
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 4,
    color: '#6b7280',
  },
  detailValue: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  errorMessage: {
    textAlign: 'center',
    marginBottom: 20,
  },
  reloadBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  reloadBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ErrorBoundary;
