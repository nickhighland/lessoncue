import * as React from 'react';
import {useState} from 'react';
import {View, Text, TextInput, StyleSheet, Pressable} from 'react-native';

export const DemoPasswordScreen: React.FC<{
  message?: string;
  onBack: () => void;
  onSubmit: (value: string) => void;
}> = ({message, onBack, onSubmit}) => {
  const [value, setValue] = useState('');

  return (
    <View style={styles.screen}>
      <Text style={styles.wordmark}>LessonCue</Text>
      <Text style={styles.heading}>LessonCue demo</Text>
      <Text style={styles.detail}>
        Enter the review password to play the sample video on this television.
      </Text>

      {message ? <Text style={styles.problem}>{message}</Text> : null}

      <TextInput
        style={styles.input}
        value={value}
        onChangeText={text => setValue(text.replace(/[^0-9]/g, '').slice(0, 6))}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="numeric"
        maxLength={6}
        placeholder="Six-digit password"
        placeholderTextColor="#6d817e"
        secureTextEntry
        hasTVPreferredFocus
        onSubmitEditing={() => {
          if (value.length === 6) onSubmit(value);
        }}
      />

      <View style={styles.actions}>
        <Pressable style={styles.secondaryButton} onPress={onBack}>
          <Text style={styles.secondaryLabel}>Back</Text>
        </Pressable>
        <Pressable
          style={[styles.button, value.length !== 6 && styles.buttonDisabled]}
          disabled={value.length !== 6}
          onPress={() => onSubmit(value)}
        >
          <Text style={styles.buttonLabel}>Play demo</Text>
        </Pressable>
      </View>

      <Text style={styles.footnote}>This review mode does not connect to a server.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#091c1d', padding: 48},
  wordmark: {color: '#e8b455', fontSize: 40, fontWeight: '800'},
  heading: {color: '#f6f1e4', fontSize: 30, fontWeight: '700', marginTop: 22},
  detail: {color: '#9eb1ae', fontSize: 18, marginTop: 8, textAlign: 'center'},
  problem: {color: '#f0a58a', fontSize: 17, marginTop: 18, textAlign: 'center'},
  input: {
    marginTop: 26, minWidth: 440, paddingVertical: 14, paddingHorizontal: 18,
    borderRadius: 12, borderWidth: 2, borderColor: '#2a6e4a',
    color: '#f6f1e4', backgroundColor: '#0d2522', fontSize: 22, textAlign: 'center',
  },
  actions: {flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 22},
  button: {paddingVertical: 16, paddingHorizontal: 34, borderRadius: 12, backgroundColor: '#2a6e4a'},
  buttonDisabled: {opacity: 0.45},
  buttonLabel: {color: '#ffffff', fontSize: 20, fontWeight: '700'},
  secondaryButton: {paddingVertical: 16, paddingHorizontal: 28, borderRadius: 12, borderWidth: 1, borderColor: '#50746b'},
  secondaryLabel: {color: '#d6e2de', fontSize: 20, fontWeight: '700'},
  footnote: {color: '#6d817e', fontSize: 14, marginTop: 26, textAlign: 'center'},
});
