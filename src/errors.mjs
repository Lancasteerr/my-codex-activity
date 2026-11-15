export class ActivityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ActivityError';
    this.code = code;
  }
}

export function fail(code, message) {
  throw new ActivityError(code, message);
}

// Never expose error.message from an arbitrary HTTP, RPC, filesystem or child error.
export function safeError(error) {
  return error instanceof ActivityError
    ? `[${error.code}] ${error.message}`
    : '[UNEXPECTED] 操作失败；原始错误已隐藏，避免泄露敏感信息。';
}
