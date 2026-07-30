import { TestBed } from '@angular/core/testing';
import { Router, NavigationEnd } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TourService } from './tour.service';
import { TourId } from './tour-step.interface';
import { TOUR_LIFECYCLE_HOOKS, TourLifecycleHook } from './tour-lifecycle-hook';

// Mock shepherd.js to avoid DOM dependencies in unit tests.
// We capture the constructor args + event listeners so tests can simulate
// `complete` / `cancel` events and inspect the steps that were built.
type CapturedTour = {
  options: any;
  start: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
  next: ReturnType<typeof vi.fn>;
  back: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  __listeners: Record<string, Array<() => void>>;
};

const capturedTours: CapturedTour[] = [];

vi.mock('shepherd.js', () => {
  const TourCtor = vi.fn().mockImplementation(function (this: any, options: any) {
    const listeners: Record<string, Array<() => void>> = {};
    const inst: CapturedTour = {
      options,
      start: vi.fn(),
      cancel: vi.fn(),
      complete: vi.fn(),
      next: vi.fn(),
      back: vi.fn(),
      on: vi.fn((event: string, cb: () => void) => {
        (listeners[event] ??= []).push(cb);
      }),
      __listeners: listeners,
    };
    capturedTours.push(inst);
    return inst;
  });
  // Shepherd v15 exposes a default singleton with `Tour` as a property.
  // Service uses `new Shepherd.Tour(...)`, so the default export must
  // carry `Tour` on it. We also re-export `Tour` as a named export for
  // any consumers that prefer that import shape.
  const Shepherd = { Tour: TourCtor };
  return { default: Shepherd, Tour: TourCtor };
});

/** Helper: mock router.navigate + router.events so startTour resolves */
function mockRouterNavigation(router: Router): void {
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  Object.defineProperty(router, 'events', {
    get: () => of(new NavigationEnd(1, '/', '/')),
    configurable: true,
  });
}

/** Fire the named Shepherd event on the most-recently created Tour. */
function fireShepherdEvent(event: 'complete' | 'cancel'): void {
  const last = capturedTours[capturedTours.length - 1];
  last?.__listeners[event]?.forEach((cb) => cb());
}

describe('TourService', () => {
  let service: TourService;
  let router: Router;

  const mockUserId = 'user-123';
  const consoleTourId: TourId = 'console';
  const adminTourId: TourId = 'admin';

  beforeEach(() => {
    localStorage.clear();
    capturedTours.length = 0;

    TestBed.configureTestingModule({
      imports: [RouterTestingModule.withRoutes([])],
      providers: [TourService],
    });

    service = TestBed.inject(TourService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  // --- isCompleted ---

  describe('isCompleted()', () => {
    it('should return false when tour has not been completed', () => {
      expect(service.isCompleted(consoleTourId, mockUserId)).toBe(false);
    });

    it('should return true after markCompleted is called', () => {
      service.markCompleted(consoleTourId, mockUserId);
      expect(service.isCompleted(consoleTourId, mockUserId)).toBe(true);
    });

    it('should be scoped per tourId — console completed does not affect admin', () => {
      service.markCompleted(consoleTourId, mockUserId);
      expect(service.isCompleted(adminTourId, mockUserId)).toBe(false);
    });

    it('should be scoped per userId — user-123 completed does not affect user-456', () => {
      service.markCompleted(consoleTourId, 'user-123');
      expect(service.isCompleted(consoleTourId, 'user-456')).toBe(false);
    });
  });

  // --- markCompleted ---

  describe('markCompleted()', () => {
    it('should persist console tour completion in localStorage with correct key', () => {
      service.markCompleted(consoleTourId, mockUserId);
      expect(localStorage.getItem('guiders_tour_console_user-123')).toBe('true');
    });

    it('should persist admin tour with its own key', () => {
      service.markCompleted(adminTourId, mockUserId);
      expect(localStorage.getItem('guiders_tour_admin_user-123')).toBe('true');
    });
  });

  // --- resetTour ---

  describe('resetTour()', () => {
    it('should remove the completion entry from localStorage', () => {
      service.markCompleted(consoleTourId, mockUserId);
      service.resetTour(consoleTourId, mockUserId);
      expect(service.isCompleted(consoleTourId, mockUserId)).toBe(false);
    });

    it('should only remove the specified tour, not others', () => {
      service.markCompleted(consoleTourId, mockUserId);
      service.markCompleted(adminTourId, mockUserId);
      service.resetTour(consoleTourId, mockUserId);
      expect(service.isCompleted(adminTourId, mockUserId)).toBe(true);
    });
  });

  // --- storageKey (indirect via behavior) ---

  describe('storage key format', () => {
    it('should use format guiders_tour_{tourId}_{userId}', () => {
      service.markCompleted('console', 'abc-def');
      expect(localStorage.getItem('guiders_tour_console_abc-def')).toBe('true');
    });
  });

  // --- startTour ---

  describe('startTour()', () => {
    it('should mark tour as completed when Shepherd emits complete', async () => {
      mockRouterNavigation(router);
      await service.startTour(consoleTourId, mockUserId);

      fireShepherdEvent('complete');

      expect(service.isCompleted(consoleTourId, mockUserId)).toBe(true);
    });

    it('should mark tour as completed when Shepherd emits cancel', async () => {
      mockRouterNavigation(router);
      await service.startTour(consoleTourId, mockUserId);

      fireShepherdEvent('cancel');

      expect(service.isCompleted(consoleTourId, mockUserId)).toBe(true);
    });

    it('should navigate to /atencion for console tour first step', async () => {
      mockRouterNavigation(router);
      const navigateSpy = router.navigate as ReturnType<typeof vi.fn>;

      await service.startTour(consoleTourId, mockUserId);

      expect(navigateSpy).toHaveBeenCalledWith(['/atencion']);
    });

    it('should navigate to /dashboard for admin tour first step', async () => {
      mockRouterNavigation(router);
      const navigateSpy = router.navigate as ReturnType<typeof vi.fn>;

      await service.startTour(adminTourId, mockUserId);

      expect(navigateSpy).toHaveBeenCalledWith(['/dashboard']);
    });

    it('should not start a second tour if one is already running', async () => {
      mockRouterNavigation(router);

      await Promise.all([
        service.startTour(consoleTourId, mockUserId),
        service.startTour(consoleTourId, mockUserId),
      ]);

      expect(capturedTours).toHaveLength(1);
      expect(capturedTours[0].start).toHaveBeenCalledTimes(1);
    });

    it('should call tour.start() to launch the tour', async () => {
      mockRouterNavigation(router);
      await service.startTour(consoleTourId, mockUserId);

      expect(capturedTours[0].start).toHaveBeenCalled();
    });

    it('should not start a second time for the same user even after the first tour finished', async () => {
      mockRouterNavigation(router);

      await service.startTour(consoleTourId, mockUserId);
      fireShepherdEvent('complete');
      await service.startTour(consoleTourId, mockUserId);

      expect(capturedTours).toHaveLength(1);
    });

    it('should allow restart after resetTour() is called', async () => {
      mockRouterNavigation(router);

      await service.startTour(consoleTourId, mockUserId);
      fireShepherdEvent('complete');

      service.resetTour(consoleTourId, mockUserId);

      await service.startTour(consoleTourId, mockUserId);

      expect(capturedTours).toHaveLength(2);
    });

    it('should run console and admin tours independently for the same user', async () => {
      mockRouterNavigation(router);

      await service.startTour(consoleTourId, mockUserId);
      fireShepherdEvent('complete');

      await service.startTour(adminTourId, mockUserId);
      fireShepherdEvent('complete');

      expect(capturedTours).toHaveLength(2);
    });
  });

  describe('step button + advance configuration', () => {
    it('should configure every step with Prev/Next buttons (no auto-advance)', async () => {
      // Decision: the tour is fully informational. No step uses advanceOn;
      // every step renders at least one button (Next or Done), and steps
      // after the first additionally render a Prev button.
      mockRouterNavigation(router);
      await service.startTour(consoleTourId, mockUserId);

      const steps = capturedTours[0].options.steps as any[];
      expect(steps.length).toBeGreaterThan(0);

      steps.forEach((step, idx) => {
        expect(
          step.advanceOn,
          `step ${idx} should not auto-advance`
        ).toBeUndefined();
        expect(
          Array.isArray(step.buttons),
          `step ${idx} should have buttons array`
        ).toBe(true);
        const expectedBtnCount = idx === 0 ? 1 : 2;
        expect(
          step.buttons.length,
          `step ${idx} should have ${expectedBtnCount} button(s)`
        ).toBe(expectedBtnCount);
      });
    });

    it('should mark the last step Next button as the completion ("Done") button', async () => {
      mockRouterNavigation(router);
      await service.startTour(consoleTourId, mockUserId);

      const steps = capturedTours[0].options.steps as any[];
      const lastStep = steps[steps.length - 1];
      const lastBtn = lastStep.buttons[lastStep.buttons.length - 1];
      expect(lastBtn.text).toContain('Entendido');
    });

    it('should keep targets non-interactive by default (canClickTarget false)', async () => {
      mockRouterNavigation(router);
      await service.startTour(consoleTourId, mockUserId);

      const steps = capturedTours[0].options.steps as any[];
      // No step in the new informational console tour opts in to
      // `allowInteraction`, so all should report canClickTarget === false.
      steps.forEach((step, idx) => {
        expect(
          step.canClickTarget,
          `step ${idx} canClickTarget`
        ).toBe(false);
      });
    });
  });

  describe('hasStartedFor()', () => {
    it('should return false before any startTour call', () => {
      expect(service.hasStartedFor(consoleTourId, mockUserId)).toBe(false);
    });

    it('should return true after startTour is called', async () => {
      mockRouterNavigation(router);
      await service.startTour(consoleTourId, mockUserId);
      expect(service.hasStartedFor(consoleTourId, mockUserId)).toBe(true);
    });

    it('should be reset after resetTour is called', async () => {
      mockRouterNavigation(router);
      await service.startTour(consoleTourId, mockUserId);
      service.resetTour(consoleTourId, mockUserId);
      expect(service.hasStartedFor(consoleTourId, mockUserId)).toBe(false);
    });

    it('should be scoped per user', async () => {
      mockRouterNavigation(router);
      await service.startTour(consoleTourId, 'user-A');
      expect(service.hasStartedFor(consoleTourId, 'user-B')).toBe(false);
    });

    it('should be scoped per tour — console started does not affect admin', async () => {
      mockRouterNavigation(router);
      await service.startTour(consoleTourId, mockUserId);
      expect(service.hasStartedFor(adminTourId, mockUserId)).toBe(false);
    });
  });
});

describe('TourService — lifecycle hooks', () => {
  let router: Router;

  const mockUserId = 'user-789';
  const consoleTourId: TourId = 'console';

  function setupTestBedWithHooks(hooks: TourLifecycleHook[]): TourService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [RouterTestingModule.withRoutes([])],
      providers: [
        TourService,
        ...hooks.map((hook) => ({
          provide: TOUR_LIFECYCLE_HOOKS,
          useValue: hook,
          multi: true,
        })),
      ],
    });
    const svc = TestBed.inject(TourService);
    router = TestBed.inject(Router);
    mockRouterNavigation(router);
    return svc;
  }

  beforeEach(() => {
    localStorage.clear();
    capturedTours.length = 0;
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should invoke onTourStart for every registered hook with tourId and userId', async () => {
    const hookA: TourLifecycleHook = {
      onTourStart: vi.fn(),
      onTourEnd: vi.fn(),
    };
    const hookB: TourLifecycleHook = {
      onTourStart: vi.fn(),
      onTourEnd: vi.fn(),
    };

    const service = setupTestBedWithHooks([hookA, hookB]);
    await service.startTour(consoleTourId, mockUserId);

    expect(hookA.onTourStart).toHaveBeenCalledWith(consoleTourId, mockUserId);
    expect(hookB.onTourStart).toHaveBeenCalledWith(consoleTourId, mockUserId);
  });

  it('should invoke onTourEnd for every registered hook when Shepherd completes', async () => {
    const hook: TourLifecycleHook = {
      onTourStart: vi.fn(),
      onTourEnd: vi.fn(),
    };

    const service = setupTestBedWithHooks([hook]);
    await service.startTour(consoleTourId, mockUserId);
    fireShepherdEvent('complete');

    await Promise.resolve();
    expect(hook.onTourEnd).toHaveBeenCalledWith(consoleTourId, mockUserId);
  });

  it('should still complete the tour even if a hook throws on onTourStart', async () => {
    const failingHook: TourLifecycleHook = {
      onTourStart: vi.fn(() => {
        throw new Error('boom');
      }),
      onTourEnd: vi.fn(),
    };

    const service = setupTestBedWithHooks([failingHook]);
    await expect(service.startTour(consoleTourId, mockUserId)).resolves.toBeUndefined();
    expect(service.hasStartedFor(consoleTourId, mockUserId)).toBe(true);
  });

  it('should not throw when no hooks are registered', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [RouterTestingModule.withRoutes([])],
      providers: [TourService],
    });
    const service = TestBed.inject(TourService);
    router = TestBed.inject(Router);
    mockRouterNavigation(router);

    await expect(service.startTour(consoleTourId, mockUserId)).resolves.toBeUndefined();
  });

  // --- onBeforeStep wiring ---
  // Each Shepherd step must run `hook.onBeforeStep(stepIndex, tourId, userId)`
  // inside its `beforeShowPromise` (after route navigation, before render)
  // so cross-domain side effects (open visitor panel, select demo chat,
  // etc.) happen automatically without the user having to click anything.
  // The hook method is OPTIONAL — service must work with old hooks too.

  it('should call onBeforeStep on every step before it is shown', async () => {
    const hook: TourLifecycleHook = {
      onTourStart: vi.fn(),
      onTourEnd: vi.fn(),
      onBeforeStep: vi.fn().mockResolvedValue(undefined),
    };

    const service = setupTestBedWithHooks([hook]);
    await service.startTour(consoleTourId, mockUserId);

    const steps = capturedTours[0].options.steps as any[];
    // Trigger every step's beforeShowPromise as Shepherd would.
    for (const step of steps) {
      if (step.beforeShowPromise) {
        await step.beforeShowPromise();
      }
    }

    expect(hook.onBeforeStep).toHaveBeenCalledTimes(steps.length);
    steps.forEach((_, idx) => {
      expect(hook.onBeforeStep).toHaveBeenNthCalledWith(
        idx + 1,
        idx,
        consoleTourId,
        mockUserId
      );
    });
  });

  it('should await the onBeforeStep promise so async setup completes before render', async () => {
    let resolveStep0!: () => void;
    const step0Promise = new Promise<void>((res) => {
      resolveStep0 = res;
    });
    const callOrder: string[] = [];

    const hook: TourLifecycleHook = {
      onTourStart: vi.fn(),
      onTourEnd: vi.fn(),
      onBeforeStep: vi.fn(async (idx: number) => {
        callOrder.push(`hook-start-${idx}`);
        if (idx === 0) await step0Promise;
        callOrder.push(`hook-end-${idx}`);
      }),
    };

    const service = setupTestBedWithHooks([hook]);
    await service.startTour(consoleTourId, mockUserId);

    const step0 = (capturedTours[0].options.steps as any[])[0];
    const beforeShow = step0.beforeShowPromise();

    // While beforeShowPromise is pending, hook is still running.
    await Promise.resolve();
    expect(callOrder).toEqual(['hook-start-0']);

    resolveStep0();
    await beforeShow;

    expect(callOrder).toEqual(['hook-start-0', 'hook-end-0']);
  });

  it('should not crash when the hook does not implement onBeforeStep (backwards compat)', async () => {
    const legacyHook: TourLifecycleHook = {
      onTourStart: vi.fn(),
      onTourEnd: vi.fn(),
      // no onBeforeStep
    };

    const service = setupTestBedWithHooks([legacyHook]);
    await service.startTour(consoleTourId, mockUserId);

    const steps = capturedTours[0].options.steps as any[];
    for (const step of steps) {
      if (step.beforeShowPromise) {
        await expect(step.beforeShowPromise()).resolves.toBeUndefined();
      }
    }
  });

  it('should swallow errors thrown by onBeforeStep so tour keeps running', async () => {
    const hook: TourLifecycleHook = {
      onTourStart: vi.fn(),
      onTourEnd: vi.fn(),
      onBeforeStep: vi.fn().mockRejectedValue(new Error('setup failed')),
    };

    const service = setupTestBedWithHooks([hook]);
    await service.startTour(consoleTourId, mockUserId);

    const step0 = (capturedTours[0].options.steps as any[])[0];
    await expect(step0.beforeShowPromise()).resolves.toBeUndefined();
  });
});
