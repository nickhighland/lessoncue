import * as React from 'react';
import {useEffect, useState} from 'react';
import {View, Text, StyleSheet, Pressable} from 'react-native';

/**
 * What a room sees while the television looks for its server.
 *
 * It says how long it has been looking, and after a few seconds offers the way
 * out. A still screen with no way forward is what people report as the app
 * being frozen, whatever it is actually doing.
 */
export const LoadingScreen: React.FC<{
  serverUrl: string;
  onEnterAddress: () => void;
}> = ({serverUrl, onEnterAddress}) => {
  const [waited, setWaited] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setWaited(seconds => seconds + 1), 1_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.screen}>
      <Text style={styles.wordmark}>LessonCue</Text>
      <Text style={styles.heading}>Looking for your server</Text>
      <Text style={styles.detail}>
        {waited >= 4 ? `${serverUrl} — still looking (${waited}s)` : serverUrl}
      </Text>
      {waited >= 4 && (
        <Pressable style={styles.button} onPress={onEnterAddress} hasTVPreferredFocus>
          <Text style={styles.buttonLabel}>Enter the server address</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#091c1d'},
  wordmark: {color: '#e8b455', fontSize: 44, fontWeight: '800'},
  heading: {color: '#f6f1e4', fontSize: 30, fontWeight: '700', marginTop: 28},
  detail: {color: '#9eb1ae', fontSize: 18, marginTop: 10},
  button: {marginTop: 34, paddingVertical: 16, paddingHorizontal: 34, borderRadius: 12, backgroundColor: '#2a6e4a'},
  buttonLabel: {color: '#ffffff', fontSize: 20, fontWeight: '700'},
});
