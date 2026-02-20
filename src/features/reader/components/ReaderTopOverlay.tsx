import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ReaderTopOverlayProps {
    chapterTitle: string;
}

export function ReaderTopOverlay({ chapterTitle }: ReaderTopOverlayProps) {
    const router = useRouter();

    return (
        <View style={styles.container}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                <MaterialCommunityIcons name="arrow-left" size={28} color="white" />
            </TouchableOpacity>

            <View style={styles.titleContainer}>
                <Text style={styles.titleText} numberOfLines={1} ellipsizeMode="tail">
                    {chapterTitle}
                </Text>
            </View>

            {/* Empty view for flex balancing with back button */}
            <View style={styles.rightSpacer} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(15, 15, 18, 0.9)', // #0F0F12 with opacity
        borderBottomWidth: 1,
        borderBottomColor: '#222',
        paddingTop: 48, // Safe area for iOS status bar
        paddingBottom: 16,
        paddingHorizontal: 8,
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
    },
    backButton: {
        padding: 8,
    },
    titleContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    titleText: {
        color: 'white',
        fontSize: 18,
        fontWeight: '600',
    },
    rightSpacer: {
        width: 44, // Match back button width for perfect centering
    },
});
