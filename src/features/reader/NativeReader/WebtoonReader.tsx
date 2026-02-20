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
    seekTo: (chapterId: string, index: number) => void;
};

type NativeWebtoonReaderProps = {
    data: WebtoonPage[];
    onEndReached?: (chapterId: string) => void;
    onChapterChanged?: (chapterId: string) => void;
    onSingleTap?: () => void;
    onPageChanged?: (chapterId: string, pageIndex: number) => void;
};

export const NativeWebtoonReader = forwardRef<NativeWebtoonReaderRef, NativeWebtoonReaderProps>(({ 
    data,
    onEndReached,
    onChapterChanged,
    onSingleTap,
    onPageChanged,
}, ref) => {
    const nativeViewRef = React.useRef<any>(null);

    useImperativeHandle(ref, () => ({
        seekTo: (chapterId: string, index: number) => {
            // Expo Modules automatically attach AsyncFunctions defined in the ViewBuilder
            // precisely to the native view component instance.
            nativeViewRef.current?.scrollToIndex(chapterId, index);
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
