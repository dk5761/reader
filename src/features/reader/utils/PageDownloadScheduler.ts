import { DownloadError, imageDownloadManager } from "./ImageDownloadManager";

export type DownloadLane =
  | "manual_retry"
  | "visible_or_cursor"
  | "foreground_window"
  | "in_chapter_prefetch"
  | "next_chapter_prefetch";

export type SchedulerPageState =
  | { status: "idle" }
  | { status: "queued"; lane: DownloadLane; queuedAt: number }
  | { status: "loading"; lane: DownloadLane; attempt: number; startedAt: number }
  | {
      status: "ready";
      localUri: string;
      width: number;
      height: number;
      loadedAt: number;
    }
  | {
      status: "error";
      lane: DownloadLane;
      retriable: boolean;
      code: string;
      statusCode?: number;
      attempt: number;
      lastError: string;
      nextRetryAt?: number;
      terminal: boolean;
      failedAt: number;
    }
  | {
      status: "cancelled";
      reason: string;
      cancelledAt: number;
    };

export type SchedulerTask = {
  pageId: string;
  chapterId: string;
  pageIndex: number;
  imageUrl: string;
  headers?: Record<string, string>;
};

export type SchedulerConfig = {
  windowAhead: number;
  windowBehind: number;
  foregroundConcurrency: number;
  backgroundConcurrency: number;
  chapterPreloadLeadPages: number;
  maxAutoRetries: number;
  autoRetryBackoffMs: number[];
};

export type SchedulerDebugStats = {
  queueSizes: Record<DownloadLane, number>;
  inFlightByLane: Record<DownloadLane, number>;
  cursorToFirstReadyMs?: number;
  cancelledCount: number;
  deprioritizedCount: number;
};

export type SchedulerSnapshot = {
  pages: Record<string, SchedulerPageState>;
  debug: SchedulerDebugStats;
};

type InFlightTask = {
  pageId: string;
  lane: DownloadLane;
  token: number;
  pool: "foreground" | "background";
};

const LANE_PRIORITY: DownloadLane[] = [
  "manual_retry",
  "visible_or_cursor",
  "foreground_window",
  "in_chapter_prefetch",
  "next_chapter_prefetch",
];

const FOREGROUND_LANES: DownloadLane[] = ["manual_retry", "visible_or_cursor", "foreground_window"];
const BACKGROUND_LANES: DownloadLane[] = ["in_chapter_prefetch", "next_chapter_prefetch"];

const DEFAULT_CONFIG: SchedulerConfig = {
  windowAhead: 6,
  windowBehind: 1,
  foregroundConcurrency: 1,
  backgroundConcurrency: 1,
  chapterPreloadLeadPages: 4,
  maxAutoRetries: 2,
  autoRetryBackoffMs: [750, 2000],
};

const now = () => Date.now();

const createEmptyLaneMap = <T>(factory: () => T): Record<DownloadLane, T> => ({
  manual_retry: factory(),
  visible_or_cursor: factory(),
  foreground_window: factory(),
  in_chapter_prefetch: factory(),
  next_chapter_prefetch: factory(),
});

export class PageDownloadScheduler {
  private config: SchedulerConfig;
  private tasks = new Map<string, SchedulerTask>();
  private pageState = new Map<string, SchedulerPageState>();
  private queuedLaneByPage = new Map<string, DownloadLane>();
  private laneQueues = createEmptyLaneMap<string[]>(() => []);
  private queueSetByLane = createEmptyLaneMap<Set<string>>(() => new Set());
  private inFlight = new Map<string, InFlightTask>();
  private taskToken = new Map<string, number>();
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private attempts = new Map<string, number>();
  private listeners = new Set<() => void>();

  private chapterOrder: string[] = [];
  private cursor: { chapterId: string; pageIndex: number } | null = null;
  private cursorMovedAt?: number;
  private firstReadyAfterCursorAt?: number;
  private disposed = false;

  private evictedChapters = new Set<string>();
  private cancelledCount = 0;
  private deprioritizedCount = 0;

  constructor(
    config?: Partial<SchedulerConfig>,
    private readonly onEvictChapters?: (chapterIds: string[]) => void,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...(config ?? {}) };
  }

  public updateConfig(config: Partial<SchedulerConfig>) {
    this.config = {
      ...this.config,
      ...config,
      foregroundConcurrency: Math.max(1, Math.min(2, config.foregroundConcurrency ?? this.config.foregroundConcurrency)),
      backgroundConcurrency: Math.max(0, Math.min(2, config.backgroundConcurrency ?? this.config.backgroundConcurrency)),
      windowAhead: Math.max(3, Math.min(12, config.windowAhead ?? this.config.windowAhead)),
      windowBehind: Math.max(0, Math.min(3, config.windowBehind ?? this.config.windowBehind)),
      chapterPreloadLeadPages: Math.max(2, Math.min(8, config.chapterPreloadLeadPages ?? this.config.chapterPreloadLeadPages)),
    };
    this.recomputeQueues("config");
    this.pump();
    this.emit();
  }

  public updateTasks(tasksByPageId: Map<string, SchedulerTask> | Record<string, SchedulerTask>) {
    const incoming = tasksByPageId instanceof Map
      ? tasksByPageId
      : new Map(Object.entries(tasksByPageId));

    const removedPageIds: string[] = [];
    this.tasks.forEach((_value, pageId) => {
      if (!incoming.has(pageId)) {
        removedPageIds.push(pageId);
      }
    });

    removedPageIds.forEach((pageId) => {
      this.tasks.delete(pageId);
      this.pageState.delete(pageId);
      this.queuedLaneByPage.delete(pageId);
      this.attempts.delete(pageId);
      this.bumpToken(pageId);
      this.clearRetryTimer(pageId);
      this.removeFromAllQueues(pageId);
      const inFlight = this.inFlight.get(pageId);
      if (inFlight) {
        this.inFlight.delete(pageId);
      }
    });

    incoming.forEach((task, pageId) => {
      this.tasks.set(pageId, task);
      if (!this.pageState.has(pageId)) {
        this.pageState.set(pageId, { status: "idle" });
      }
    });

    this.recomputeQueues("updateTasks");
    this.pump();
    this.emit();
  }

  public setChapterOrder(chapterOrder: string[]) {
    this.chapterOrder = chapterOrder;
    this.evictByDistance();
    this.recomputeQueues("setChapterOrder");
    this.pump();
    this.emit();
  }

  public setCursor(chapterId: string, pageIndex: number) {
    if (!chapterId) {
      return;
    }
    const normalized = Math.max(0, Math.floor(pageIndex));
    const previous = this.cursor;
    this.cursor = { chapterId, pageIndex: normalized };
    if (!previous || previous.chapterId !== chapterId || previous.pageIndex !== normalized) {
      this.cursorMovedAt = now();
      this.firstReadyAfterCursorAt = undefined;
    }

    this.evictByDistance();
    this.recomputeQueues("setCursor");
    this.pump();
    this.emit();
  }

  public onChapterSwitch(targetChapterId: string) {
    if (!targetChapterId) {
      return;
    }
    this.setCursor(targetChapterId, 0);

    const keep = new Set(this.getDesiredQueueEntries().map((entry) => entry.pageId));
    this.tasks.forEach((task, pageId) => {
      if (task.chapterId === targetChapterId || keep.has(pageId)) {
        return;
      }
      const inFlight = this.inFlight.get(pageId);
      if (inFlight && (inFlight.lane === "in_chapter_prefetch" || inFlight.lane === "next_chapter_prefetch")) {
        this.bumpToken(pageId);
      }
      if (this.queuedLaneByPage.has(pageId)) {
        this.removeFromAllQueues(pageId);
        this.queuedLaneByPage.delete(pageId);
        this.deprioritizedCount += 1;
        this.pageState.set(pageId, {
          status: "cancelled",
          reason: "chapter_switch",
          cancelledAt: now(),
        });
      }
    });

    this.pump();
    this.emit();
  }

  public retryPage(pageId: string) {
    if (!this.tasks.has(pageId)) {
      return;
    }
    this.clearRetryTimer(pageId);
    this.enqueue(pageId, "manual_retry", "manual retry", true);
    this.pump();
    this.emit();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshot(): SchedulerSnapshot {
    const pages: Record<string, SchedulerPageState> = {};
    this.pageState.forEach((value, key) => {
      pages[key] = value;
    });

    const inFlightByLane = createEmptyLaneMap<number>(() => 0);
    this.inFlight.forEach((entry) => {
      inFlightByLane[entry.lane] += 1;
    });

    const queueSizes = createEmptyLaneMap<number>(() => 0);
    LANE_PRIORITY.forEach((lane) => {
      queueSizes[lane] = this.laneQueues[lane].length;
    });

    const cursorToFirstReadyMs =
      this.cursorMovedAt && this.firstReadyAfterCursorAt
        ? Math.max(0, this.firstReadyAfterCursorAt - this.cursorMovedAt)
        : undefined;

    return {
      pages,
      debug: {
        queueSizes,
        inFlightByLane,
        cursorToFirstReadyMs,
        cancelledCount: this.cancelledCount,
        deprioritizedCount: this.deprioritizedCount,
      },
    };
  }

  public getDebugDump() {
    const snapshot = this.getSnapshot();
    return {
      cursor: this.cursor,
      chapterOrder: this.chapterOrder,
      queueSizes: snapshot.debug.queueSizes,
      inFlightByLane: snapshot.debug.inFlightByLane,
      cursorToFirstReadyMs: snapshot.debug.cursorToFirstReadyMs,
      cancelledCount: snapshot.debug.cancelledCount,
      deprioritizedCount: snapshot.debug.deprioritizedCount,
    };
  }

  public dispose() {
    this.disposed = true;
    this.listeners.clear();
    this.tasks.clear();
    this.pageState.clear();
    this.queuedLaneByPage.clear();
    this.inFlight.clear();
    this.taskToken.clear();
    this.attempts.clear();
    this.clearAllRetryTimers();
    LANE_PRIORITY.forEach((lane) => {
      this.laneQueues[lane] = [];
      this.queueSetByLane[lane].clear();
    });
  }

  private emit() {
    if (this.disposed) {
      return;
    }
    this.listeners.forEach((listener) => listener());
  }

  private clearRetryTimer(pageId: string) {
    const timer = this.retryTimers.get(pageId);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(pageId);
    }
  }

  private clearAllRetryTimers() {
    this.retryTimers.forEach((timer) => clearTimeout(timer));
    this.retryTimers.clear();
  }

  private bumpToken(pageId: string): number {
    const next = (this.taskToken.get(pageId) ?? 0) + 1;
    this.taskToken.set(pageId, next);
    return next;
  }

  private laneIndex(lane: DownloadLane): number {
    return LANE_PRIORITY.indexOf(lane);
  }

  private removeFromAllQueues(pageId: string) {
    LANE_PRIORITY.forEach((lane) => {
      if (!this.queueSetByLane[lane].has(pageId)) {
        return;
      }
      this.queueSetByLane[lane].delete(pageId);
      this.laneQueues[lane] = this.laneQueues[lane].filter((id) => id !== pageId);
    });
  }

  private enqueue(pageId: string, lane: DownloadLane, reason: string, force = false) {
    const task = this.tasks.get(pageId);
    if (!task) {
      return;
    }

    const currentState = this.pageState.get(pageId);
    if (!force && currentState?.status === "ready") {
      return;
    }

    const inFlight = this.inFlight.get(pageId);
    if (inFlight) {
      return;
    }

    const existingLane = this.queuedLaneByPage.get(pageId);
    if (existingLane) {
      const shouldUpgrade = this.laneIndex(lane) < this.laneIndex(existingLane);
      if (!shouldUpgrade && !force) {
        return;
      }

      if (shouldUpgrade || force) {
        this.queueSetByLane[existingLane].delete(pageId);
        this.laneQueues[existingLane] = this.laneQueues[existingLane].filter((id) => id !== pageId);
        this.deprioritizedCount += 1;
      }
    }

    if (!this.queueSetByLane[lane].has(pageId)) {
      this.queueSetByLane[lane].add(pageId);
      this.laneQueues[lane].push(pageId);
    }

    this.queuedLaneByPage.set(pageId, lane);
    this.pageState.set(pageId, {
      status: "queued",
      lane,
      queuedAt: now(),
    });

    if (typeof __DEV__ !== "undefined" && __DEV__) {
      // Keep concise traces for scheduler behavior diagnostics.
      console.log("[Scheduler] enqueue", { pageId, lane, reason });
    }
  }

  private dequeue(lanes: DownloadLane[]): { pageId: string; lane: DownloadLane } | null {
    for (const lane of lanes) {
      while (this.laneQueues[lane].length > 0) {
        const pageId = this.laneQueues[lane].shift()!;
        this.queueSetByLane[lane].delete(pageId);
        const currentLane = this.queuedLaneByPage.get(pageId);
        if (!currentLane || currentLane !== lane) {
          continue;
        }
        this.queuedLaneByPage.delete(pageId);

        const state = this.pageState.get(pageId);
        if (!state) {
          continue;
        }
        if (state.status === "ready") {
          continue;
        }

        return { pageId, lane };
      }
    }
    return null;
  }

  private pump() {
    if (this.disposed) {
      return;
    }

    const foregroundInFlight = Array.from(this.inFlight.values()).filter((entry) => entry.pool === "foreground").length;
    const backgroundInFlight = Array.from(this.inFlight.values()).filter((entry) => entry.pool === "background").length;

    let availableForeground = Math.max(0, this.config.foregroundConcurrency - foregroundInFlight);
    let availableBackground = Math.max(0, this.config.backgroundConcurrency - backgroundInFlight);

    while (availableForeground > 0) {
      const next = this.dequeue(FOREGROUND_LANES);
      if (!next) {
        break;
      }
      this.dispatch(next.pageId, next.lane, "foreground");
      availableForeground -= 1;
    }

    // Foreground preempts background: only run background if no high-priority pages are waiting.
    const hasForegroundQueued = FOREGROUND_LANES.some((lane) => this.laneQueues[lane].length > 0);
    if (hasForegroundQueued) {
      return;
    }

    while (availableBackground > 0) {
      const next = this.dequeue(BACKGROUND_LANES);
      if (!next) {
        break;
      }
      this.dispatch(next.pageId, next.lane, "background");
      availableBackground -= 1;
    }
  }

  private dispatch(pageId: string, lane: DownloadLane, pool: "foreground" | "background") {
    const task = this.tasks.get(pageId);
    if (!task) {
      return;
    }

    const attempt = (this.attempts.get(pageId) ?? 0) + 1;
    this.attempts.set(pageId, attempt);
    const token = this.bumpToken(pageId);

    this.inFlight.set(pageId, { pageId, lane, token, pool });
    this.pageState.set(pageId, {
      status: "loading",
      lane,
      attempt,
      startedAt: now(),
    });

    void imageDownloadManager
      .downloadPage(task.chapterId, task.imageUrl, task.headers)
      .then((downloaded) => {
        const inFlight = this.inFlight.get(pageId);
        if (!inFlight || inFlight.token !== token) {
          return;
        }

        this.inFlight.delete(pageId);
        this.pageState.set(pageId, {
          status: "ready",
          localUri: downloaded.localUri,
          width: downloaded.width,
          height: downloaded.height,
          loadedAt: now(),
        });

        if (this.cursor && this.cursor.chapterId === task.chapterId) {
          if (
            task.pageIndex >= this.cursor.pageIndex - this.config.windowBehind &&
            task.pageIndex <= this.cursor.pageIndex + this.config.windowAhead &&
            !this.firstReadyAfterCursorAt
          ) {
            this.firstReadyAfterCursorAt = now();
          }
        }

        this.recomputeQueues("download_success");
        this.pump();
        this.emit();
      })
      .catch((error) => {
        const inFlight = this.inFlight.get(pageId);
        if (!inFlight || inFlight.token !== token) {
          return;
        }

        this.inFlight.delete(pageId);

        const normalized =
          error instanceof DownloadError
            ? error
            : new DownloadError(
                error instanceof Error ? error.message : String(error ?? "Failed to download page"),
                { retriable: true, code: "unknown", cause: error },
              );

        const retryable = normalized.retriable;
        const shouldAutoRetry = retryable && attempt <= this.config.maxAutoRetries;
        const retryDelay = shouldAutoRetry
          ? this.config.autoRetryBackoffMs[Math.min(attempt - 1, this.config.autoRetryBackoffMs.length - 1)]
          : undefined;

        this.pageState.set(pageId, {
          status: "error",
          lane,
          retriable: retryable,
          code: normalized.code,
          statusCode: normalized.statusCode,
          attempt,
          lastError: normalized.message,
          nextRetryAt: retryDelay ? now() + retryDelay : undefined,
          terminal: !shouldAutoRetry,
          failedAt: now(),
        });

        if (retryDelay) {
          this.clearRetryTimer(pageId);
          const timer = setTimeout(() => {
            this.retryTimers.delete(pageId);
            this.enqueue(pageId, "foreground_window", "auto_retry", true);
            this.pump();
            this.emit();
          }, retryDelay);
          this.retryTimers.set(pageId, timer);
        }

        this.recomputeQueues("download_error");
        this.pump();
        this.emit();
      });
  }

  private getChapterPages(chapterId: string): SchedulerTask[] {
    return Array.from(this.tasks.values())
      .filter((task) => task.chapterId === chapterId)
      .sort((a, b) => a.pageIndex - b.pageIndex);
  }

  private getDesiredQueueEntries(): Array<{ pageId: string; lane: DownloadLane }> {
    if (!this.cursor) {
      return [];
    }

    const chapterPages = this.getChapterPages(this.cursor.chapterId);
    if (chapterPages.length === 0) {
      return [];
    }
    const maxIndexInChapter = chapterPages[chapterPages.length - 1]?.pageIndex ?? 0;
    const normalizedCursorIndex = Math.max(0, Math.min(this.cursor.pageIndex, maxIndexInChapter));

    const desired: Array<{ pageId: string; lane: DownloadLane }> = [];

    const cursorPage = chapterPages.find((p) => p.pageIndex === normalizedCursorIndex);
    if (cursorPage) {
      desired.push({ pageId: cursorPage.pageId, lane: "visible_or_cursor" });
    }

    const minIndex = Math.max(0, normalizedCursorIndex - this.config.windowBehind);
    const maxIndex = normalizedCursorIndex + this.config.windowAhead - 1;

    chapterPages.forEach((task) => {
      if (task.pageIndex >= minIndex && task.pageIndex <= maxIndex) {
        if (task.pageIndex !== normalizedCursorIndex) {
          desired.push({ pageId: task.pageId, lane: "foreground_window" });
        }
      }
    });

    const inChapterPrefetchStart = maxIndex + 1;
    const inChapterPrefetchEnd = maxIndex + this.config.chapterPreloadLeadPages;

    chapterPages.forEach((task) => {
      if (task.pageIndex >= inChapterPrefetchStart && task.pageIndex <= inChapterPrefetchEnd) {
        desired.push({ pageId: task.pageId, lane: "in_chapter_prefetch" });
      }
    });

    const remainingPages = chapterPages.length - 1 - normalizedCursorIndex;
    const canPreloadNextChapter = remainingPages < this.config.chapterPreloadLeadPages;

    if (canPreloadNextChapter) {
      const currentChapterIdx = this.chapterOrder.indexOf(this.cursor.chapterId);
      const nextChapterId = currentChapterIdx >= 0 ? this.chapterOrder[currentChapterIdx + 1] : undefined;
      if (nextChapterId) {
        const nextChapterPages = this.getChapterPages(nextChapterId);
        nextChapterPages
          .slice(0, this.config.windowAhead)
          .forEach((task) => desired.push({ pageId: task.pageId, lane: "next_chapter_prefetch" }));
      }
    }

    return desired;
  }

  private recomputeQueues(reason: string) {
    const desired = this.getDesiredQueueEntries();
    const desiredLaneByPage = new Map<string, DownloadLane>(
      desired.map((entry) => [entry.pageId, entry.lane]),
    );

    // Deprioritize/drop queued items no longer in desired set.
    this.queuedLaneByPage.forEach((_lane, pageId) => {
      if (desiredLaneByPage.has(pageId)) {
        return;
      }
      this.removeFromAllQueues(pageId);
      this.queuedLaneByPage.delete(pageId);
      this.deprioritizedCount += 1;
      this.pageState.set(pageId, {
        status: "cancelled",
        reason,
        cancelledAt: now(),
      });
    });

    desiredLaneByPage.forEach((lane, pageId) => {
      const state = this.pageState.get(pageId);
      if (!state) {
        return;
      }
      if (state.status === "ready") {
        return;
      }
      if (state.status === "loading") {
        return;
      }
      if (state.status === "error" && state.terminal) {
        return;
      }
      this.enqueue(pageId, lane, reason);
    });
  }

  private evictByDistance() {
    if (!this.cursor || this.chapterOrder.length === 0 || !this.onEvictChapters) {
      return;
    }

    const cursorIdx = this.chapterOrder.indexOf(this.cursor.chapterId);
    if (cursorIdx < 0) {
      return;
    }

    const keepIndices = new Set<number>([cursorIdx - 1, cursorIdx, cursorIdx + 1]);
    const toEvict: string[] = [];

    this.chapterOrder.forEach((chapterId, idx) => {
      if (keepIndices.has(idx)) {
        this.evictedChapters.delete(chapterId);
        return;
      }

      if (this.evictedChapters.has(chapterId)) {
        return;
      }

      const hasInFlight = Array.from(this.inFlight.values()).some((entry) => {
        const task = this.tasks.get(entry.pageId);
        return task?.chapterId === chapterId;
      });
      if (hasInFlight) {
        return;
      }

      const hasManualRetry = Array.from(this.queuedLaneByPage.entries()).some(([pageId, lane]) => {
        if (lane !== "manual_retry") {
          return false;
        }
        return this.tasks.get(pageId)?.chapterId === chapterId;
      });
      if (hasManualRetry) {
        return;
      }

      toEvict.push(chapterId);
      this.evictedChapters.add(chapterId);
      this.cancelledCount += 1;
    });

    if (toEvict.length > 0) {
      this.onEvictChapters(toEvict);
    }
  }
}
