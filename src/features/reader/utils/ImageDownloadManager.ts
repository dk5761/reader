import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'react-native';
export type DownloadedPage = {
    originalUrl: string;
    localUri: string;
    width: number;
    height: number;
};

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

    /**
     * Generates a safe local filename based on the URL and Chapter ID
     */
    private getLocalFilePath(chapterId: string, url: string): string {
        // Simple hash/encode to avoid invalid characters
        const encodedChapterId = encodeURIComponent(chapterId);
        const encodedUrl = encodeURIComponent(url);
        const ext = url.split('.').pop()?.split('?')[0] || 'jpg';
        return `${this.cacheDir}${encodedChapterId}_${encodedUrl}.${ext}`;
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
            } catch (e) {
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
                throw new Error(`Failed to download image, status: ${result.status}`);
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
            throw e;
        }
    }

    /**
     * Cleans up entire chapters from the disk cache to free memory.
     */
    public async evictChapter(chapterId: string) {
        try {
            const encodedChapterId = encodeURIComponent(chapterId);
            const files = await FileSystem.readDirectoryAsync(this.cacheDir);
            const chapterFiles = files.filter(f => f.startsWith(`${encodedChapterId}_`));

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
