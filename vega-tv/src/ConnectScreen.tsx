import * as React from 'react';
import {useState} from 'react';
import {View, Text, TextInput, StyleSheet, Pressable} from 'react-native';

/**
 * Where somebody tells the television which server it belongs to.
 *
 * Reached when the saved address does not answer, and from the looking screen
 * while it is still trying, so a television is never stuck with an address
 * that has stopped working.
 */
export const ConnectScreen: React.FC<{
  serverUrl: string;
  message?: string;
  onSubmit: (value: string) => void;
}> = ({serverUrl, message, onSubmit}) => {
  const [value, setValue] = useState(serverUrl);

  return (
    <View style={styles.screen}>
      <Text style={styles.wordmark}>LessonCue</Text>
      <Text style={styles.heading}>Connect this television</Text>
      <Text style={styles.detail}>
        Enter the address of the LessonCue server on your network.
      </Text>

      {message ? <Text style={styles.problem}>{message}</Text> : null}

      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="http://lessoncue.local"
        placeholderTextColor="#6d817e"
        hasTVPreferredFocus
      />

      <Pressable style={styles.button} onPress={() => onSubmit(value)}>
        <Text style={styles.buttonLabel}>Connect</Text>
      </Pressable>

      <Text style={styles.footnote}>
        A plain http:// address is accepted only for a private network, a .local
        name, or an address on this machine. Anything else needs https://.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#091c1d', padding: 48},
  wordmark: {color: '#e8b455', fontSize: 40, fontWeight: '800'},
  heading: {color: '#f6f1e4', fontSize: 30, fontWeight: '700', marginTop: 22},
  detail: {color: '#9eb1ae', fontSize: 18, marginTop: 8},
  problem: {color: '#f0a58a', fontSize: 17, marginTop: 18, textAlign: 'center'},
  input: {
    marginTop: 26, minWidth: 620, paddingVertical: 14, paddingHorizontal: 18,
    borderRadius: 12, borderWidth: 2, borderColor: '#2a6e4a',
    color: '#f6f1e4', backgroundColor: '#0d2522', fontSize: 22,
  },
  button: {marginTop: 22, paddingVertical: 16, paddingHorizontal: 44, borderRadius: 12, backgroundColor: '#2a6e4a'},
  buttonLabel: {color: '#ffffff', fontSize: 20, fontWeight: '700'},
  footnote: {color: '#6d817e', fontSize: 14, marginTop: 26, textAlign: 'center', maxWidth: 700},
});
