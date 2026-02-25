import React, { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View } from 'react-native';

import {
    OnChapterChangedEventPayload,
    OnEndReachedEventPayload,
    OnImageErrorEventPayload,
    OnLoadingStateChangedEventPayload,
    OnPageChangedEventPayload,
    OnRetryRequestedEventPayload,
    WebtoonPage,
    WebtoonReaderView
} from '../../../../modules/webtoon-reader';

export type NativeWebtoonReaderRef = {
    seekTo: (chapterId: string, index: number) => Promise<boolean>;
    getPosition: () => Promise<{ chapterId: string; pageIndex: number } | null>;
    setZoom: (scale: number) => Promise<void>;
    resetZoom: () => Promise<void>;
    resetSession: () => Promise<void>;
};

type NativeWebtoonReaderProps = {
    data: WebtoonPage[];
    onEndReached?: (chapterId: string) => void;
    onChapterChanged?: (chapterId: string) => void;
    onSingleTap?: () => void;
    onPageChanged?: (chapterId: string, pageIndex: number) => void;
    onScrollBegin?: () => void;
    onLoadingStateChanged?: (pageId: string, isLoading: boolean) => void;
    onImageError?: (pageId: string, error: string) => void;
    onRetryRequested?: (pageId: string) => void;
};

export const NativeWebtoonReader = forwardRef<NativeWebtoonReaderRef, NativeWebtoonReaderProps>(({
    data,
    onEndReached,
    onChapterChanged,
    onSingleTap,
    onPageChanged,
    onScrollBegin,
    onLoadingStateChanged,
    onImageError,
    onRetryRequested,
}, ref) => {
    const nativeViewRef = React.useRef<any>(null);

    useImperativeHandle(ref, () => ({
        seekTo: async (chapterId: string, index: number) => {
            // Expo Modules automatically attach AsyncFunctions defined in the ViewBuilder
            // precisely to the native view component instance.
            const nativeView = nativeViewRef.current;
            if (!nativeView?.scrollToIndex) {
                return false;
            }

            try {
                await nativeView.scrollToIndex(chapterId, index);
                return true;
            } catch (error) {
                console.warn("[NativeWebtoonReader] seekTo failed", { chapterId, index, error });
                return false;
            }
        },
        getPosition: async () => {
            const nativeView = nativeViewRef.current;
            if (!nativeView?.getCurrentPosition) {
                return null;
            }

            try {
                const result = await nativeView.getCurrentPosition();
                if (!result.chapterId) {
                    return null;
                }
                return {
                    chapterId: result.chapterId,
                    pageIndex: result.pageIndex
                };
            } catch (error) {
                console.warn("[NativeWebtoonReader] getPosition failed", { error });
                return null;
            }
        },
        setZoom: async (scale: number) => {
            const nativeView = nativeViewRef.current;
            if (!nativeView?.setZoomScale) {
                return;
            }

            try {
                await nativeView.setZoomScale(scale);
            } catch (error) {
                console.warn("[NativeWebtoonReader] setZoom failed", { scale, error });
            }
        },
        resetZoom: async () => {
            const nativeView = nativeViewRef.current;
            if (!nativeView?.resetZoom) {
                return;
            }

            try {
                await nativeView.resetZoom();
            } catch (error) {
                console.warn("[NativeWebtoonReader] resetZoom failed", { error });
            }
        },
        resetSession: async () => {
            const nativeView = nativeViewRef.current;
            if (!nativeView?.resetSession) {
                return;
            }

            try {
                await nativeView.resetSession();
            } catch (error) {
                console.warn("[NativeWebtoonReader] resetSession failed", { error });
            }
        }
    }), []);
    const handleChapterChanged = React.useCallback(
        (event: { nativeEvent: OnChapterChangedEventPayload }) => {
            onChapterChanged?.(event.nativeEvent.chapterId);
        },
        [onChapterChanged]
    );

    const handleEndReached = React.useCallback(
        (event: { nativeEvent: OnEndReachedEventPayload }) => {
            onEndReached?.(event.nativeEvent.chapterId);
        },
        [onEndReached]
    );

    const handlePageChanged = React.useCallback(
        (event: { nativeEvent: OnPageChangedEventPayload }) => {
            onPageChanged?.(event.nativeEvent.chapterId, event.nativeEvent.pageIndex);
        },
        [onPageChanged]
    );

    const handleScrollBegin = React.useCallback(
        () => {
            onScrollBegin?.();
        },
        [onScrollBegin]
    );

    const handleLoadingStateChanged = React.useCallback(
        (event: { nativeEvent: OnLoadingStateChangedEventPayload }) => {
            onLoadingStateChanged?.(event.nativeEvent.pageId, event.nativeEvent.isLoading);
        },
        [onLoadingStateChanged]
    );

    const handleImageError = React.useCallback(
        (event: { nativeEvent: OnImageErrorEventPayload }) => {
            onImageError?.(event.nativeEvent.pageId, event.nativeEvent.error);
        },
        [onImageError]
    );

    const handleRetryRequested = React.useCallback(
        (event: { nativeEvent: OnRetryRequestedEventPayload }) => {
            onRetryRequested?.(event.nativeEvent.pageId);
        },
        [onRetryRequested]
    );

    return (
        <View style={styles.container}>
            <WebtoonReaderView
                ref={nativeViewRef}
                style={styles.reader}
                data={data}
                onEndReached={handleEndReached}
                onChapterChanged={handleChapterChanged}
                onSingleTap={onSingleTap}
                onPageChanged={handlePageChanged}
                onScrollBegin={handleScrollBegin}
                onLoadingStateChanged={handleLoadingStateChanged}
                onImageError={handleImageError}
                onRetryRequested={handleRetryRequested}
            />
        </View>
    );
});

NativeWebtoonReader.displayName = 'NativeWebtoonReader';

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black', // Typically webtoons have dark backgrounds
    },
    reader: {
        flex: 1,
    },
});
