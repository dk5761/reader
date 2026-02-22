import React, { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View } from 'react-native';

import {
    OnChapterChangedEventPayload,
    OnEndReachedEventPayload,
    OnPageChangedEventPayload,
    WebtoonPage,
    WebtoonReaderView
} from '../../../../modules/webtoon-reader';

export type NativeWebtoonReaderRef = {
    seekTo: (chapterId: string, index: number) => Promise<boolean>;
};

type NativeWebtoonReaderProps = {
    data: WebtoonPage[];
    onEndReached?: (chapterId: string) => void;
    onChapterChanged?: (chapterId: string) => void;
    onSingleTap?: () => void;
    onPageChanged?: (chapterId: string, pageIndex: number) => void;
    onScrollBegin?: () => void;
};

export const NativeWebtoonReader = forwardRef<NativeWebtoonReaderRef, NativeWebtoonReaderProps>(({
    data,
    onEndReached,
    onChapterChanged,
    onSingleTap,
    onPageChanged,
    onScrollBegin,
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
