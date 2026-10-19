/**
 * Jest stand-in for Python's unittest.mock.MagicMock.
 * Call `.fn` where the code under test expects a function.
 */
export class MagicMock<TArgs extends unknown[] = unknown[], TResult = unknown> {
  readonly fn: jest.Mock<TResult, TArgs>;

  constructor(impl?: (...args: TArgs) => TResult) {
    this.fn = impl ? jest.fn(impl) : jest.fn();
  }

  mockReturnValue(value: TResult): this {
    this.fn.mockReturnValue(value);
    return this;
  }

  mockResolvedValue(value: Awaited<TResult>): this {
    this.fn.mockResolvedValue(value as TResult);
    return this;
  }

  mockRejectedValue(error: unknown): this {
    this.fn.mockRejectedValue(error);
    return this;
  }

  mockImplementation(impl: (...args: TArgs) => TResult): this {
    this.fn.mockImplementation(impl);
    return this;
  }

  reset(): this {
    this.fn.mockReset();
    return this;
  }

  get called(): boolean {
    return this.fn.mock.calls.length > 0;
  }

  get callCount(): number {
    return this.fn.mock.calls.length;
  }

  get callArgsList(): TArgs[] {
    return this.fn.mock.calls;
  }

  assertCalled(): void {
    expect(this.fn).toHaveBeenCalled();
  }

  assertCalledOnce(): void {
    expect(this.fn).toHaveBeenCalledTimes(1);
  }

  assertCalledWith(...args: TArgs): void {
    expect(this.fn).toHaveBeenCalledWith(...args);
  }

  assertNotCalled(): void {
    expect(this.fn).not.toHaveBeenCalled();
  }
}
