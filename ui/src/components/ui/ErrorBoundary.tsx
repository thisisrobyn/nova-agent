import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Rendered instead of the crashed subtree. Falls back to a generic notice. */
  fallback?: ReactNode;
  /** Distinguishes boundaries in the console when several are nested. */
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Stops a render crash in `children` from unmounting the rest of the app.
 *
 * React has no default recovery from an error thrown during render: with no
 * boundary in the tree, it unmounts everything, which is what turned one
 * message with malformed content (an object where `MarkdownRenderer` expected
 * a string) into a blank page. Class components are the only way to
 * implement `getDerivedStateFromError` — there is no hook equivalent.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex items-center gap-2 rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-2 text-xs text-red-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Something went wrong rendering this.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
