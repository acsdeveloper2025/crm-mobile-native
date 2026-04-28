// 2026-04-27 deep-audit fix (D9): per-screen error boundary.
//
// The single global ErrorBoundary in App.tsx tears down the whole nav
// tree on any descendant render fault — agent loses navigation context
// and may loop into the recovery UI if the bug is data-dependent. Per-
// screen boundaries contain the fault to one screen so the rest of the
// app stays usable.
//
// Risk surface analysed before implementing:
//   1. Navigation hooks must thread through — solved by HOC pattern
//      that forwards all props verbatim. Inner screen still receives
//      `navigation` and `route` props; React Navigation context is
//      provided by NavigationContainer (not by props), so hooks like
//      useFocusEffect work inside the inner screen.
//   2. Boundary itself must not crash — fallback uses ONLY hardcoded
//      colors + plain View/Text/TouchableOpacity (no theme context, no
//      navigation hooks). The app-level ErrorBoundary remains as a
//      catch-all if even this minimal UI faults.
//   3. Loss of in-screen state on crash — inherent to React. We offer
//      a "Retry" button that resets only the boundary's hasError flag,
//      causing the wrapped screen to remount with fresh state. Agent's
//      typed form values are lost, but autosave (`useFormAutosave`)
//      restores them on next mount.
//   4. Re-mount loop on persistent crash — the Retry button increments
//      a key on the inner screen so a deterministic crash gets a fresh
//      mount. If it crashes again, agent uses Go Back instead.
//   5. Uncaught async errors — boundaries only catch render errors,
//      same as React. Async errors are caught by ErrorUtils handler in
//      App.tsx (already wired to RemoteLogService).

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Logger } from '../utils/logger';
import { RemoteLogService } from '../services/RemoteLogService';

interface Props {
  children: ReactNode;
  /** Used in telemetry + the fallback heading. */
  screenName: string;
  /** Optional callback when user taps "Go Back". */
  onGoBack?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  retryKey: number;
}

class ScreenErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, retryKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    Logger.error('ScreenErrorBoundary', 'Screen render crash', {
      screenName: this.props.screenName,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
    // eslint-disable-next-line no-void
    void RemoteLogService.upload({ source: 'crash' });
  }

  private handleRetry = () => {
    // Bump retryKey so the wrapped child remounts cleanly.
    this.setState(prev => ({
      hasError: false,
      error: undefined,
      retryKey: prev.retryKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      const message =
        this.state.error?.message?.slice(0, 200) ||
        'An unexpected error occurred on this screen.';
      return (
        <View style={styles.container}>
          <Text style={styles.title}>This screen ran into a problem</Text>
          <Text style={styles.subtitle}>{this.props.screenName}</Text>
          <Text style={styles.message} numberOfLines={6}>
            {message}
          </Text>
          <View style={styles.buttonRow}>
            {this.props.onGoBack ? (
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={this.props.onGoBack}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Text style={styles.buttonSecondaryText}>Go Back</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={this.handleRetry}
              accessibilityRole="button"
              accessibilityLabel="Retry this screen"
            >
              <Text style={styles.buttonPrimaryText}>Retry</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Crash details have been queued for support.
          </Text>
        </View>
      );
    }
    // Bumping `retryKey` on Retry forces a clean remount of the child
    // tree — fresh state, fresh effects, fresh autosave hydration.
    return (
      <React.Fragment key={this.state.retryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

// Hardcoded colors so the fallback never depends on ThemeContext (which
// might itself be the thing that crashed). Mid-tone neutrals readable in
// both light and dark system chrome.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 44,
    minWidth: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#00A950',
  },
  buttonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  buttonSecondaryText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});

/**
 * HOC that wraps a screen component in `ScreenErrorBoundary`. Use at
 * module-level so the wrapped component is a stable reference (avoids
 * remount-on-every-RootNavigator-render):
 *
 *   const SafeLoginScreen = withScreenErrorBoundary(LoginScreen, 'Auth');
 *   <Stack.Screen name="Auth" component={SafeLoginScreen} />
 */
export function withScreenErrorBoundary<P extends object>(
  Wrapped: React.ComponentType<P>,
  screenName: string,
): React.ComponentType<P> {
  const Boundary: React.FC<P> = props => (
    <ScreenErrorBoundary screenName={screenName}>
      <Wrapped {...props} />
    </ScreenErrorBoundary>
  );
  Boundary.displayName = `WithErrorBoundary(${screenName})`;
  return Boundary;
}

export default ScreenErrorBoundary;
