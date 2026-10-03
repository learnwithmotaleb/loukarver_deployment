import React, { Component, ErrorInfo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * App-wide Error Boundary — catches unhandled JS render errors
 * and prevents the entire app from crashing with a white/red screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRestart = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.icon}>◈</Text>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.subtitle}>
              The app encountered an unexpected error. Tap below to try again.
            </Text>

            <Pressable style={styles.button} onPress={this.handleRestart}>
              <Text style={styles.buttonText}>TRY AGAIN</Text>
            </Pressable>

            {__DEV__ && this.state.error && (
              <ScrollView style={styles.debugBox}>
                <Text style={styles.debugText}>
                  {this.state.error.toString()}
                </Text>
              </ScrollView>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4EEE4',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    maxWidth: 340,
  },
  icon: {
    fontSize: 40,
    color: '#D35400',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1E1E1E',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#8C8C8C',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#1E1E1E',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 8,
  },
  buttonText: {
    color: '#F4EEE4',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
  debugBox: {
    marginTop: 24,
    maxHeight: 150,
    width: '100%',
    backgroundColor: '#EAE2D4',
    borderRadius: 8,
    padding: 12,
  },
  debugText: {
    fontSize: 11,
    color: '#555',
    fontFamily: 'monospace',
  },
});
