import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'react-native';
export type DownloadedPage = {
    originalUrl: string;
    localUri: string;
    width: number;
    height: number;
};

export type DownloadErrorCode =
    | "http_status"
    | "invalid_url"
    | "filesystem"
    | "decode"
    | "network"
    | "unknown";

export class DownloadError extends Error {
    statusCode?: number;
    retriable: boolean;
    code: DownloadErrorCode;

    constructor(
        message: string,
        options?: {
            statusCode?: number;
            retriable?: boolean;
            code?: DownloadErrorCode;
            cause?: unknown;
        }
    ) {
        super(message);
        this.name = "DownloadError";
        this.statusCode = options?.statusCode;
        this.retriable = options?.retriable ?? true;
        this.code = options?.code ?? "unknown";
        if (options?.cause !== undefined) {
            (this as Error & { cause?: unknown }).cause = options.cause;
        }
    }
}

export type TrimCacheOptions = {
    maxBytes?: number;
    keepChapterIds?: string[];
    keepRecentChapters?: number;
};

type CacheFileEntry = {
    path: string;
    chapterHash: string;
    size: number;
    modificationTime: number;
};

class ImageDownloadManager {
    private cacheDir = `${(FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory}webtoon_reader_cache/`;
    private activeDownloads = new Map<string, Promise<DownloadedPage>>();
    private activeDownloadCounts = new Map<string, number>();
    private chapterEvictionEpoch = new Map<string, number>();
    private chapterEvictions = new Map<string, Promise<void>>();
    private trimPromise: Promise<void> | null = null;
    private readonly defaultMaxCacheBytes = 600 * 1024 * 1024;
    private readonly defaultKeepRecentChapters = 10;
    private _initPromise: Promise<void>;

    constructor() {
        this._initPromise = this.initCacheDir();
    }

    private async initCacheDir() {
        await this.ensureCacheDirExists();
    }

    private async ensureCacheDirExists() {
        const dirInfo = await FileSystem.getInfoAsync(this.cacheDir);
        if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(this.cacheDir, { intermediates: true });
        }
    }

    private getSafeExtension(url: string): string {
        try {
            const pathname = new URL(url).pathname;
            const ext = pathname.split('.').pop()?.toLowerCase() ?? "";
            // Avoid slashes/query fragments and keep extension bounded.
            if (/^[a-z0-9]{1,5}$/.test(ext)) {
                return ext;
            }
        } catch {
            // Fall through to default when URL parsing fails.
        }
        return "jpg";
    }

    private hashString(value: string): string {
        let hash = 2166136261;
        for (let i = 0; i < value.length; i += 1) {
            hash ^= value.charCodeAt(i);
            hash +=
                (hash << 1) +
                (hash << 4) +
                (hash << 7) +
                (hash << 8) +
                (hash << 24);
        }
        return (hash >>> 0).toString(36);
    }

    private getChapterHash(chapterId: string): string {
        return this.hashString(chapterId);
    }

    private getChapterEpoch(chapterId: string): number {
        return this.chapterEvictionEpoch.get(chapterId) ?? 0;
    }

    private bumpChapterEpoch(chapterId: string): number {
        const next = this.getChapterEpoch(chapterId) + 1;
        this.chapterEvictionEpoch.set(chapterId, next);
        return next;
    }

    private beginChapterDownload(chapterId: string) {
        this.activeDownloadCounts.set(chapterId, (this.activeDownloadCounts.get(chapterId) ?? 0) + 1);
    }

    private endChapterDownload(chapterId: string) {
        const next = (this.activeDownloadCounts.get(chapterId) ?? 0) - 1;
        if (next <= 0) {
            this.activeDownloadCounts.delete(chapterId);
            return;
        }
        this.activeDownloadCounts.set(chapterId, next);
    }

    private isRetriableHttpStatus(status: number): boolean {
        if (status === 429) {
            return true;
        }
        return status >= 500 && status <= 599;
    }

    private classifyUnknownError(error: unknown): { retriable: boolean; code: DownloadErrorCode } {
        const message = (error as any)?.message ? String((error as any).message) : String(error ?? "Unknown error");
        const normalized = message.toLowerCase();

        if (normalized.includes("invalid url") || normalized.includes("malformed")) {
            return { retriable: false, code: "invalid_url" };
        }

        if (normalized.includes("no such file") || normalized.includes("does not exist")) {
            return { retriable: false, code: "filesystem" };
        }

        if (normalized.includes("decode") || normalized.includes("format") || normalized.includes("corrupt")) {
            return { retriable: false, code: "decode" };
        }

        if (
            normalized.includes("timeout") ||
            normalized.includes("network") ||
            normalized.includes("temporar") ||
            normalized.includes("timed out")
        ) {
            return { retriable: true, code: "network" };
        }

        return { retriable: true, code: "unknown" };
    }

    private isCannotCreateFileError(error: unknown): boolean {
        const message = (error as any)?.message ? String((error as any).message) : String(error ?? "");
        const normalized = message.toLowerCase();
        const errorCode = String(
            (error as any)?.code ??
            (error as any)?.nativeErrorCode ??
            (error as any)?.errno ??
            ""
        ).toLowerCase();

        return (
            errorCode === "-3000" ||
            errorCode === "nsurlerrorcannotcreatefile" ||
            normalized.includes("nsurlerrordomain code=-3000") ||
            normalized.includes("cannot create file")
        );
    }

    private async downloadFile(
        url: string,
        localUri: string,
        headers?: Record<string, string>
    ) {
        return FileSystem.downloadAsync(url, localUri, {
            headers: headers || {},
            // Page images are only needed while reader is active; foreground session avoids
            // background URLSession delegate edge-cases that can surface as iOS -3000 errors.
            sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
        });
    }

    private async downloadFileWithRetry(
        url: string,
        localUri: string,
        headers?: Record<string, string>
    ) {
        try {
            return await this.downloadFile(url, localUri, headers);
        } catch (firstError) {
            if (!this.isCannotCreateFileError(firstError)) {
                throw firstError;
            }

            await this.ensureCacheDirExists();
            await FileSystem.deleteAsync(localUri, { idempotent: true });
            return this.downloadFile(url, localUri, headers);
        }
    }

    /**
     * Generates a short, filesystem-safe filename.
     */
    private getLocalFilePath(chapterId: string, url: string): string {
        const chapterHash = this.hashString(chapterId);
        const urlHash = this.hashString(url);
        const ext = this.getSafeExtension(url);
        return `${this.cacheDir}${chapterHash}_${urlHash}.${ext}`;
    }

    /**
     * Measures the dimensions of a local image file.
     */
    private measureImageDimensions(uri: string): Promise<{ width: number, height: number }> {
        return new Promise((resolve, reject) => {
            Image.getSize(
                uri,
                (width, height) => resolve({ width, height }),
                (error) => reject(error)
            );
        });
    }

    /**
     * Downloads an image if it doesn't exist, and returns its local URI and dimensions.
     * If already downloading, returns the existing promise.
     */
    public async downloadPage(
        chapterId: string,
        url: string,
        headers?: Record<string, string>
    ): Promise<DownloadedPage> {
        await this._initPromise;
        const cacheKey = `${chapterId}_${url}`;
        const chapterEpochAtStart = this.getChapterEpoch(chapterId);

        if (this.activeDownloads.has(cacheKey)) {
            return this.activeDownloads.get(cacheKey)!;
        }

        this.beginChapterDownload(chapterId);
        const downloadPromise = this._executeDownload(chapterId, url, headers, chapterEpochAtStart);
        this.activeDownloads.set(cacheKey, downloadPromise);

        try {
            const result = await downloadPromise;
            return result;
        } finally {
            // Remove from active downloads once complete
            this.activeDownloads.delete(cacheKey);
            this.endChapterDownload(chapterId);
        }
    }

    private async ensureDownloadStillValid(chapterId: string, chapterEpochAtStart: number, localUri: string) {
        if (this.getChapterEpoch(chapterId) === chapterEpochAtStart) {
            return;
        }

        await FileSystem.deleteAsync(localUri, { idempotent: true });
        throw new DownloadError("Download invalidated by chapter eviction", {
            retriable: false,
            code: "filesystem",
        });
    }

    private async _executeDownload(
        chapterId: string,
        url: string,
        headers: Record<string, string> | undefined,
        chapterEpochAtStart: number
    ): Promise<DownloadedPage> {
        await this._initPromise;
        await this.ensureCacheDirExists();
        const localUri = this.getLocalFilePath(chapterId, url);
        const fileInfo = await FileSystem.getInfoAsync(localUri);

        if (fileInfo.exists) {
            try {
                const dimensions = await this.measureImageDimensions(localUri);
                await this.ensureDownloadStillValid(chapterId, chapterEpochAtStart, localUri);
                return {
                    originalUrl: url,
                    localUri,
                    width: dimensions.width,
                    height: dimensions.height,
                };
            } catch {
                // If measuring fails, file might be corrupted. Delete and re-download.
                await FileSystem.deleteAsync(localUri, { idempotent: true });
            }
        }

        // Download the file
        try {
            const result = await this.downloadFileWithRetry(url, localUri, headers);

            if (result.status !== 200) {
                throw new DownloadError(`Failed to download image, status: ${result.status}`, {
                    statusCode: result.status,
                    retriable: this.isRetriableHttpStatus(result.status),
                    code: "http_status",
                });
            }

            const dimensions = await this.measureImageDimensions(result.uri);
            await this.ensureDownloadStillValid(chapterId, chapterEpochAtStart, result.uri);

            return {
                originalUrl: url,
                localUri: result.uri,
                width: dimensions.width,
                height: dimensions.height,
            };
        } catch (e) {
            // Cleanup on failure
            await FileSystem.deleteAsync(localUri, { idempotent: true });

            if (e instanceof DownloadError) {
                throw e;
            }

            const classification = this.classifyUnknownError(e);
            const message = (e as any)?.message
                ? String((e as any).message)
                : "Failed to download image";
            throw new DownloadError(message, {
                retriable: classification.retriable,
                code: classification.code,
                cause: e,
            });
        }
    }

    /**
     * Cleans up entire chapters from the disk cache to free memory.
     */
    public async evictChapter(chapterId: string) {
        await this._initPromise;

        const existing = this.chapterEvictions.get(chapterId);
        if (existing) {
            await existing;
            return;
        }

        const evictionPromise = this._evictChapter(chapterId).finally(() => {
            this.chapterEvictions.delete(chapterId);
        });
        this.chapterEvictions.set(chapterId, evictionPromise);
        await evictionPromise;
    }

    private async _evictChapter(chapterId: string) {
        this.bumpChapterEpoch(chapterId);
        try {
            const chapterHash = this.getChapterHash(chapterId);
            const files = await FileSystem.readDirectoryAsync(this.cacheDir);
            const chapterFiles = files.filter(f => f.startsWith(`${chapterHash}_`));

            await Promise.all(
                chapterFiles.map(f => FileSystem.deleteAsync(`${this.cacheDir}${f}`, { idempotent: true }))
            );
            console.log(`[ImageDownloadManager] Evicted ${chapterFiles.length} files for chapter ${chapterId}`);
        } catch (e) {
            console.error(`[ImageDownloadManager] Failed to evict chapter ${chapterId}`, e);
        }
    }

    private async listCacheEntries(): Promise<CacheFileEntry[]> {
        await this._initPromise;
        let files: string[] = [];
        try {
            files = await FileSystem.readDirectoryAsync(this.cacheDir);
        } catch {
            return [];
        }

        const entries = await Promise.all(
            files.map(async (name): Promise<CacheFileEntry | null> => {
                const separatorIdx = name.indexOf("_");
                if (separatorIdx <= 0) {
                    return null;
                }

                const chapterHash = name.slice(0, separatorIdx);
                const path = `${this.cacheDir}${name}`;
                const info = await FileSystem.getInfoAsync(path);
                if (!info.exists || (info as any).isDirectory) {
                    return null;
                }

                const size = typeof (info as any).size === "number" ? Number((info as any).size) : 0;
                const modificationTime =
                    typeof (info as any).modificationTime === "number"
                        ? Number((info as any).modificationTime)
                        : 0;

                return {
                    path,
                    chapterHash,
                    size: Number.isFinite(size) ? size : 0,
                    modificationTime: Number.isFinite(modificationTime) ? modificationTime : 0,
                };
            })
        );

        return entries.filter((entry): entry is CacheFileEntry => entry !== null);
    }

    public async trimCache(options: TrimCacheOptions = {}) {
        await this._initPromise;

        if (this.trimPromise) {
            await this.trimPromise;
            return;
        }

        const run = this._trimCache(options).finally(() => {
            if (this.trimPromise === run) {
                this.trimPromise = null;
            }
        });

        this.trimPromise = run;
        await run;
    }

    private async _trimCache(options: TrimCacheOptions) {
        const maxBytes = Math.max(0, Math.floor(options.maxBytes ?? this.defaultMaxCacheBytes));
        const keepRecentChapters = Math.max(
            0,
            Math.floor(options.keepRecentChapters ?? this.defaultKeepRecentChapters)
        );

        const entries = await this.listCacheEntries();
        if (entries.length === 0) {
            return;
        }

        let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
        if (totalBytes <= maxBytes) {
            return;
        }

        const protectedChapterHashes = new Set<string>(
            (options.keepChapterIds ?? [])
                .filter((chapterId): chapterId is string => typeof chapterId === "string" && chapterId.length > 0)
                .map((chapterId) => this.getChapterHash(chapterId))
        );

        for (const chapterId of this.activeDownloadCounts.keys()) {
            protectedChapterHashes.add(this.getChapterHash(chapterId));
        }

        const chapters = new Map<
            string,
            { files: CacheFileEntry[]; totalSize: number; latestModificationTime: number }
        >();

        for (const entry of entries) {
            const existing = chapters.get(entry.chapterHash);
            if (!existing) {
                chapters.set(entry.chapterHash, {
                    files: [entry],
                    totalSize: entry.size,
                    latestModificationTime: entry.modificationTime,
                });
                continue;
            }

            existing.files.push(entry);
            existing.totalSize += entry.size;
            existing.latestModificationTime = Math.max(existing.latestModificationTime, entry.modificationTime);
        }

        const chapterGroups = Array.from(chapters.entries()).map(([chapterHash, value]) => ({
            chapterHash,
            ...value,
        }));

        const recentChapterHashes = new Set<string>();
        chapterGroups
            .slice()
            .sort((a, b) => b.latestModificationTime - a.latestModificationTime)
            .slice(0, keepRecentChapters)
            .forEach((group) => recentChapterHashes.add(group.chapterHash));

        const primaryEvictionCandidates = chapterGroups
            .filter((group) => !protectedChapterHashes.has(group.chapterHash) && !recentChapterHashes.has(group.chapterHash))
            .sort((a, b) => a.latestModificationTime - b.latestModificationTime);

        const secondaryEvictionCandidates = chapterGroups
            .filter((group) => !protectedChapterHashes.has(group.chapterHash) && recentChapterHashes.has(group.chapterHash))
            .sort((a, b) => a.latestModificationTime - b.latestModificationTime);

        let evictedBytes = 0;
        let evictedFiles = 0;
        let evictedChapters = 0;

        for (const group of primaryEvictionCandidates) {
            if (totalBytes <= maxBytes) {
                break;
            }

            await Promise.all(
                group.files.map((entry) => FileSystem.deleteAsync(entry.path, { idempotent: true }))
            );
            totalBytes -= group.totalSize;
            evictedBytes += group.totalSize;
            evictedFiles += group.files.length;
            evictedChapters += 1;
        }

        // If the retained recent set itself exceeds budget, evict oldest recent chapters
        // except chapters explicitly protected by current reader context/in-flight downloads.
        for (const group of secondaryEvictionCandidates) {
            if (totalBytes <= maxBytes) {
                break;
            }

            await Promise.all(
                group.files.map((entry) => FileSystem.deleteAsync(entry.path, { idempotent: true }))
            );
            totalBytes -= group.totalSize;
            evictedBytes += group.totalSize;
            evictedFiles += group.files.length;
            evictedChapters += 1;
        }

        if (evictedChapters > 0) {
            console.log(
                `[ImageDownloadManager] Trimmed cache by ${evictedBytes} bytes (${evictedFiles} files, ${evictedChapters} chapters). Remaining: ${totalBytes} bytes`
            );
        }
    }

    public async clearAllCache() {
        await FileSystem.deleteAsync(this.cacheDir, { idempotent: true });
        await this.initCacheDir();
    }
}

export const imageDownloadManager = new ImageDownloadManager();
