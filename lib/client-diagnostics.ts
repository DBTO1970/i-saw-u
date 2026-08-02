type ClientDiagnosticSeverity = 'info' | 'warn' | 'error';

type ClientDiagnosticPayload = {
  event: string;
  severity?: ClientDiagnosticSeverity;
  details?: Record<string, unknown>;
  error?: {
    name?: string;
    message?: string;
    stack?: string;
  } | null;
  source?: string;
  timestamp?: string;
};

function toSerializableError(error: unknown): ClientDiagnosticPayload['error'] {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: typeof error === 'string' ? error : JSON.stringify(error),
  };
}

export async function sendClientDiagnostic(payload: ClientDiagnosticPayload): Promise<void> {
  try {
    const body = {
      event: payload.event,
      severity: payload.severity || 'error',
      details: payload.details || {},
      error: payload.error || null,
      source: payload.source || 'web-client',
      timestamp: payload.timestamp || new Date().toISOString(),
    };

    const response = await fetch('/api/client-diagnostics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });

    if (!response.ok) {
      console.warn('[CLIENT_DIAGNOSTIC_SEND_FAILED]', {
        status: response.status,
        event: payload.event,
      });
    }
  } catch (error) {
    console.warn('[CLIENT_DIAGNOSTIC_SEND_FAILED]', {
      event: payload.event,
      error: toSerializableError(error),
    });
  }
}

export function withClientDiagnosticError(error: unknown): ClientDiagnosticPayload['error'] {
  return toSerializableError(error);
}

type GlobalDiagnosticsState = {
  refCount: number;
  contexts: Set<string>;
  errorHandler: (event: ErrorEvent) => void;
  rejectionHandler: (event: PromiseRejectionEvent) => void;
};

const GLOBAL_DIAGNOSTICS_KEY = '__ISAWU_GLOBAL_DIAGNOSTICS__';

function readGlobalState(): GlobalDiagnosticsState | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return (window as unknown as Record<string, unknown>)[GLOBAL_DIAGNOSTICS_KEY] as GlobalDiagnosticsState || null;
}

function writeGlobalState(state: GlobalDiagnosticsState | null) {
  if (typeof window === 'undefined') {
    return;
  }

  const target = window as unknown as Record<string, unknown>;
  if (!state) {
    delete target[GLOBAL_DIAGNOSTICS_KEY];
    return;
  }
  target[GLOBAL_DIAGNOSTICS_KEY] = state;
}

export function installGlobalClientDiagnostics(context: string): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let state = readGlobalState();
  if (!state) {
    state = {
      refCount: 0,
      contexts: new Set<string>(),
      errorHandler: (event: ErrorEvent) => {
        const errorPayload = event.error
          ? withClientDiagnosticError(event.error)
          : withClientDiagnosticError(event.message || 'Unknown window error');
        void sendClientDiagnostic({
          event: 'window-error',
          severity: 'error',
          source: 'global-window-error',
          details: {
            contexts: Array.from(readGlobalState()?.contexts || []),
            message: event.message || null,
            filename: event.filename || null,
            line: typeof event.lineno === 'number' ? event.lineno : null,
            column: typeof event.colno === 'number' ? event.colno : null,
            pathname: window.location?.pathname || null,
            href: window.location?.href || null,
          },
          error: errorPayload,
        });
      },
      rejectionHandler: (event: PromiseRejectionEvent) => {
        const reason = event.reason;
        void sendClientDiagnostic({
          event: 'window-unhandledrejection',
          severity: 'error',
          source: 'global-window-error',
          details: {
            contexts: Array.from(readGlobalState()?.contexts || []),
            pathname: window.location?.pathname || null,
            href: window.location?.href || null,
            reasonType: reason == null ? null : typeof reason,
          },
          error: withClientDiagnosticError(reason),
        });
      },
    };

    window.addEventListener('error', state.errorHandler);
    window.addEventListener('unhandledrejection', state.rejectionHandler);
    writeGlobalState(state);
  }

  state.refCount += 1;
  state.contexts.add(context);
  writeGlobalState(state);

  return () => {
    const current = readGlobalState();
    if (!current) {
      return;
    }

    current.refCount = Math.max(0, current.refCount - 1);
    current.contexts.delete(context);
    if (current.refCount === 0) {
      window.removeEventListener('error', current.errorHandler);
      window.removeEventListener('unhandledrejection', current.rejectionHandler);
      writeGlobalState(null);
      return;
    }
    writeGlobalState(current);
  };
}
