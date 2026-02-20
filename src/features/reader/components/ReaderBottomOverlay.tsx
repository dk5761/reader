import { MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ReaderBottomOverlayProps {
    currentChapterId: string;
    currentPageIndex: number;
    totalVisiblePages: number;
    onSeek: (pageIndex: number) => void;
    onNextChapter: () => void;
    onPrevChapter: () => void;
}

export function ReaderBottomOverlay({
    currentChapterId,
    currentPageIndex,
    totalVisiblePages,
    onSeek,
    onNextChapter,
    onPrevChapter,
}: ReaderBottomOverlayProps) {
    return (
        <View style={styles.container}>
            {/* Top Row: Page Indicator */}
            <View style={styles.pageIndicatorContainer}>
                <Text style={styles.pageIndicatorText}>
                    {totalVisiblePages > 0 ? `${currentPageIndex + 1} / ${totalVisiblePages}` : ''}
                </Text>
            </View>

            {/* Main Control Row */}
            <View style={styles.controlRow}>
                <TouchableOpacity onPress={onPrevChapter} style={styles.iconButton}>
                    <MaterialCommunityIcons name="skip-previous" size={32} color="white" />
                </TouchableOpacity>

                <View style={styles.sliderContainer}>
                    <Slider
                        style={{ width: '100%', height: 40 }}
                        minimumValue={0}
                        maximumValue={Math.max(0, totalVisiblePages - 1)}
                        value={currentPageIndex}
                        step={1}
                        onSlidingComplete={onSeek}
                        minimumTrackTintColor="#FFFFFF"
                        maximumTrackTintColor="#555555"
                        thumbTintColor="#FFFFFF"
                    />
                </View>

                <TouchableOpacity onPress={onNextChapter} style={styles.iconButton}>
                    <MaterialCommunityIcons name="skip-next" size={32} color="white" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(15, 15, 18, 0.9)', // #0F0F12 with opacity
        borderTopWidth: 1,
        borderTopColor: '#222',
        paddingBottom: 32, // Safe area for iPhone home bar
        paddingTop: 16,
        paddingHorizontal: 16,
        width: '100%',
    },
    pageIndicatorContainer: {
        alignItems: 'center',
        marginBottom: 8,
    },
    pageIndicatorText: {
        color: '#CCCCCC',
        fontSize: 14,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
    },
    controlRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    sliderContainer: {
        flex: 1,
        marginHorizontal: 16,
    },
    iconButton: {
        padding: 8,
    },
});
