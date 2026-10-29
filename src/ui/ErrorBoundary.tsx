import { Component, type ReactNode } from "react";

interface Props {
  fallback: (error: Error) => ReactNode;
  onError?: (error: Error) => void;
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  override render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}
