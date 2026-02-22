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

class ImageDownloadManager {
    private cacheDir = `${(FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory}webtoon_reader_cache/`;
    private activeDownloads = new Map<string, Promise<DownloadedPage>>();
    private _initPromise: Promise<void>;

    constructor() {
        this._initPromise = this.initCacheDir();
    }

    private async initCacheDir() {
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

        if (this.activeDownloads.has(cacheKey)) {
            return this.activeDownloads.get(cacheKey)!;
        }

        const downloadPromise = this._executeDownload(chapterId, url, headers);
        this.activeDownloads.set(cacheKey, downloadPromise);

        try {
            const result = await downloadPromise;
            return result;
        } finally {
            // Remove from active downloads once complete
            this.activeDownloads.delete(cacheKey);
        }
    }

    private async _executeDownload(
        chapterId: string,
        url: string,
        headers?: Record<string, string>
    ): Promise<DownloadedPage> {
        await this._initPromise;
        const localUri = this.getLocalFilePath(chapterId, url);
        const fileInfo = await FileSystem.getInfoAsync(localUri);

        if (fileInfo.exists) {
            try {
                const dimensions = await this.measureImageDimensions(localUri);
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
            const result = await FileSystem.downloadAsync(url, localUri, {
                headers: headers || {},
            });

            if (result.status !== 200) {
                throw new DownloadError(`Failed to download image, status: ${result.status}`, {
                    statusCode: result.status,
                    retriable: this.isRetriableHttpStatus(result.status),
                    code: "http_status",
                });
            }

            const dimensions = await this.measureImageDimensions(result.uri);

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
        try {
            const chapterHash = this.hashString(chapterId);
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

    public async clearAllCache() {
        await FileSystem.deleteAsync(this.cacheDir, { idempotent: true });
        await this.initCacheDir();
    }
}

export const imageDownloadManager = new ImageDownloadManager();
