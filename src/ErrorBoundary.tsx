import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props  { children: ReactNode; }
interface State  { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-8">
          <div className="bg-[#1E293B] border border-rose-500/30 rounded-xl p-6 max-w-lg w-full">
            <h1 className="text-rose-400 font-bold text-lg mb-2">Something went wrong</h1>
            <p className="text-slate-400 text-sm mb-4">
              The app crashed. Check the browser console for details.
            </p>
            <pre className="text-rose-300 text-xs bg-[#0F172A] rounded-lg p-4 overflow-auto whitespace-pre-wrap border border-rose-500/20">
              {this.state.error.message}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 w-full py-2.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-sm font-semibold border border-rose-500/30 transition-colors cursor-pointer"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
