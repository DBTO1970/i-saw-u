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
