'use client';

import React from 'react';
import { sendClientDiagnostic, withClientDiagnosticError } from '../lib/client-diagnostics';

type ClientErrorBoundaryProps = {
  context: string;
  children: React.ReactNode;
};

type ClientErrorBoundaryState = {
  hasError: boolean;
};

export default class ClientErrorBoundary extends React.Component<ClientErrorBoundaryProps, ClientErrorBoundaryState> {
  constructor(props: ClientErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    void sendClientDiagnostic({
      event: 'react-error-boundary',
      severity: 'error',
      source: 'react-error-boundary',
      details: {
        context: this.props.context,
        componentStack: info?.componentStack || null,
        pathname: typeof window !== 'undefined' ? window.location?.pathname || null : null,
        href: typeof window !== 'undefined' ? window.location?.href || null : null,
      },
      error: withClientDiagnosticError(error),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          A client-side error occurred while rendering this panel. Please reload and try again.
        </div>
      );
    }

    return this.props.children;
  }
}
