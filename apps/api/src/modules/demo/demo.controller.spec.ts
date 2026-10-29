import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoController } from './demo.controller.js';
import { DemoService } from './demo.service.js';

describe('DemoController', () => {
  let demoController: DemoController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [DemoController],
      providers: [DemoService],
    }).compile();

    demoController = app.get<DemoController>(DemoController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getSlow', () => {
    it('should return the greeting after the delay', async () => {
      await expect(demoController.getSlow('10')).resolves.toBe('Hello World!');
    });

    it('should default to a delay when none is given', async () => {
      await expect(demoController.getSlow()).resolves.toBe('Hello World!');
    });

    it('should cap the delay at 30 seconds', async () => {
      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

      const pending = demoController.getSlow('999999');
      await vi.advanceTimersByTimeAsync(0);

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);

      await vi.advanceTimersByTimeAsync(30_000);
      await expect(pending).resolves.toBe('Hello World!');
    });

    it('should ignore a non-numeric delay and use the default', async () => {
      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

      const pending = demoController.getSlow('not-a-number');
      await vi.advanceTimersByTimeAsync(0);

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

      await vi.advanceTimersByTimeAsync(2000);
      await expect(pending).resolves.toBe('Hello World!');
    });
  });

  describe('getFail', () => {
    it('should always throw', () => {
      expect(() => demoController.getFail()).toThrow(
        'Intentional demo failure',
      );
    });
  });

  describe('getUnstable', () => {
    it('should return the greeting or throw', () => {
      try {
        expect(demoController.getUnstable()).toBe('Hello World!');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Intentional demo failure');
      }
    });
  });
});
