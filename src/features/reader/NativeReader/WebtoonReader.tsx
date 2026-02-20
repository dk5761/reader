import React from 'react';
import { StyleSheet, View } from 'react-native';

import {
    OnChapterChangedEventPayload,
    OnEndReachedEventPayload,
    WebtoonPage,
    WebtoonReaderView
} from '../../../../modules/webtoon-reader';

type NativeWebtoonReaderProps = {
    data: WebtoonPage[];
    onEndReached?: (chapterId: string) => void;
    onChapterChanged?: (chapterId: string) => void;
};

export const NativeWebtoonReader: React.FC<NativeWebtoonReaderProps> = ({
    data,
    onEndReached,
    onChapterChanged,
}) => {
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

    return (
        <View style={styles.container}>
            <WebtoonReaderView
                style={styles.reader}
                data={data}
                onEndReached={handleEndReached}
                onChapterChanged={handleChapterChanged}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black', // Typically webtoons have dark backgrounds
    },
    reader: {
        flex: 1,
    },
});
