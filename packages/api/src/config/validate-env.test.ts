import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateProductionEnv } from './validate-env.js';

describe('validateProductionEnv', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('does nothing outside production', () => {
    process.env = { ...originalEnv, NODE_ENV: 'development' };
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    validateProductionEnv();

    expect(exit).not.toHaveBeenCalled();
  });

  it('exits when required vars are missing in production', () => {
    process.env = { NODE_ENV: 'production' };
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    validateProductionEnv();

    expect(error).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });
});
