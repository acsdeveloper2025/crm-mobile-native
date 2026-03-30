import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Appearance, DevSettings } from 'react-native';
import { Logger } from '../utils/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  showDetails: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, showDetails: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log crash details via structured logger (persisted for sync to server)
    Logger.error('ErrorBoundary', 'Unhandled React crash', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    this.setState({
      error,
      errorInfo,
    });
  }

  private getThemeColors() {
    const isDark = Appearance.getColorScheme() === 'dark';
    
    if (isDark) {
      return {
        background: '#111827',
        card: '#1f2937',
        text: '#f9fafb',
        error: '#ef4444',
        warning: '#fbbf24',
        info: '#60a5fa',
        errorLight: '#f87171',
        primary: '#3b82f6'
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
        primary: '#3b82f6'
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
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.error }]}>Something went wrong!</Text>
          
          {__DEV__ ? (
            <>
              <TouchableOpacity
                onPress={() => this.setState({ showDetails: !this.state.showDetails })}
                style={styles.detailsToggle}>
                <Text style={[styles.detailsToggleText, { color: colors.primary }]}>
                    {this.state.showDetails ? 'Hide error details' : 'Show error details'}
                </Text>
              </TouchableOpacity>

              {this.state.showDetails && (
                <ScrollView style={[styles.detailsContainer, { backgroundColor: colors.card }]}>
                  <Text style={styles.detailLabel}>Error:</Text>
                  <Text style={[styles.detailValue, { color: colors.warning }]}>
                    {this.state.error && this.state.error.toString()}
                  </Text>

                  <Text style={styles.detailLabel}>Component Stack:</Text>
                  <Text style={[styles.detailValue, { color: colors.info }]}>
                    {this.state.errorInfo && this.state.errorInfo.componentStack}
                  </Text>

                  <Text style={styles.detailLabel}>Error Stack:</Text>
                  <Text style={[styles.detailValue, { color: colors.errorLight }]}>
                    {this.state.error && this.state.error.stack}
                  </Text>
                </ScrollView>
              )}
            </>
          ) : (
            <Text style={[styles.detailValue, styles.errorMessage, { color: colors.info }]}>
              An unexpected error occurred. Please try again or contact support if the problem persists.
            </Text>
          )}
          
          <TouchableOpacity 
            onPress={this.handleRecover}
            style={[styles.reloadBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.reloadBtnText}>{__DEV__ ? 'Reload App' : 'Try Again'}</Text>
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
  }
});

export default ErrorBoundary;
