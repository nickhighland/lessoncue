import * as React from 'react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {View, StyleSheet} from 'react-native';
import {WebView} from '@amazon-devices/webview';
import {
  useHideSplashScreenCallback,
  useKeplerBackHandler,
  usePreventHideSplashScreen,
} from '@amazon-devices/react-native-kepler';
import {AsyncStorage} from '@amazon-devices/react-native-kepler/Libraries/Storage/AsyncStorage';
import type {
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewNavigationEvent,
} from '@amazon-devices/webview/dist/types/WebViewTypes';

import {ConnectScreen} from './ConnectScreen.tsx';
import {LoadingScreen} from './LoadingScreen.tsx';
import {
  DEFAULT_SERVER_URL,
  loadServerUrl,
  playerUrlFor,
  probeServer,
  saveServerUrl,
} from './serverAddress.ts';
import {normalizeLessonCueServerUrl} from './protocol/serverUrl.ts';

/**
 * LessonCue on Vega.
 *
 * The player is a page the server already serves, and it does the real work:
 * pairing, the manifest, playback, the control channel and telemetry. It also
 * fetches relative to wherever it was loaded from, so the address this shell
 * points at is the whole of its configuration.
 *
 * What the shell owns is the part a web page cannot: remembering which server
 * this television belongs to, and giving somebody a way to change it when that
 * server moves. Everything else would be a second client to keep in step with
 * the first.
 */

type Screen =
  | {kind: 'looking'; serverUrl: string}
  | {kind: 'connect'; serverUrl: string; message?: string}
  | {kind: 'player'; serverUrl: string};

export const App = () => {
  const webRef = useRef(null);
  usePreventHideSplashScreen();
  const hideSplashScreen = useHideSplashScreenCallback();

  const [screen, setScreen] = useState<Screen>({
    kind: 'looking',
    serverUrl: DEFAULT_SERVER_URL,
  });

  // The splash screen is held until something is on screen behind it. Without
  // this a server that never answers leaves the splash up indefinitely, which
  // reads as a hung television rather than one that cannot find its server.
  const backHandler = useKeplerBackHandler();
  const splashHidden = useRef(false);
  const revealApp = useCallback(() => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    hideSplashScreen();
  }, [hideSplashScreen]);

  const findServer = useCallback(async (candidate?: string) => {
    const serverUrl = candidate ?? (await loadServerUrl(AsyncStorage));
    setScreen({kind: 'looking', serverUrl});

    const reachable = await probeServer(serverUrl);
    if (reachable.reachable) {
      setScreen({kind: 'player', serverUrl});
      return;
    }
    // Nothing is gained by loading a player from a server that is not there:
    // the WebView would show its own error page, which says nothing useful to
    // somebody standing in a room with a remote.
    revealApp();
    setScreen({
      kind: 'connect',
      serverUrl,
      message: `${serverUrl} did not answer. ${reachable.detail ?? ''}`.trim(),
    });
  }, [revealApp]);

  useEffect(() => {
    void findServer();
  }, [findServer]);

  // Back, while the player is up, goes to the address rather than out of the
  // app. Without it a television whose server has moved to a new address has
  // no way to be told: the player loads from somewhere that answers, so
  // nothing fails, and there is nothing on screen to press. Everywhere else
  // Back leaves, which is what a television remote is expected to do.
  useEffect(() => {
    const subscription = backHandler.addEventListener('hardwareBackPress', () => {
      if (screen.kind !== 'player') return false;
      setScreen({kind: 'connect', serverUrl: screen.serverUrl});
      return true;
    });
    return () => subscription?.remove?.();
  }, [backHandler, screen]);

  const useAddress = useCallback(async (entered: string) => {
    // An address that policy refuses is the operator's to correct, and they are
    // told. An address that is fine but cannot be written down is not: the
    // device still works this session, and refusing to use it would strand a
    // television over a storage fault it cannot do anything about.
    let normalized: string;
    try {
      normalized = normalizeLessonCueServerUrl(entered);
    } catch (error) {
      setScreen({kind: 'connect', serverUrl: entered, message: (error as Error).message});
      return;
    }
    try {
      await saveServerUrl(AsyncStorage, normalized);
    } catch {
      // Remembered for this run only. It will be asked for again next launch.
    }
    await findServer(normalized);
  }, [findServer]);

  if (screen.kind === 'connect') {
    return (
      <ConnectScreen
        serverUrl={screen.serverUrl}
        message={screen.message}
        onSubmit={useAddress}
      />
    );
  }

  if (screen.kind === 'looking') {
    return (
      <LoadingScreen
        serverUrl={screen.serverUrl}
        onEnterAddress={() => {
          revealApp();
          setScreen({kind: 'connect', serverUrl: screen.serverUrl});
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        style={styles.webview}
        allowSystemKeyEvents
        allowsDefaultMediaControl
        domStorageEnabled
        hasTVPreferredFocus
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="compatibility"
        source={{uri: playerUrlFor(screen.serverUrl)}}
        onLoad={(_event: WebViewNavigationEvent) => revealApp()}
        onError={({nativeEvent: {code, url, description}}: WebViewErrorEvent) => {
          console.error(`[webview] ${code} ${url}: ${description}`);
          revealApp();
          setScreen({
            kind: 'connect',
            serverUrl: screen.serverUrl,
            message: 'The player could not be loaded from this server.',
          });
        }}
        onHttpError={({nativeEvent: {url, statusCode, isMainFrame}}: WebViewHttpErrorEvent) => {
          console.error(`[webview] HTTP ${statusCode} for ${url}`);
          // A failed image inside the page is not a reason to throw the room
          // back to a setup screen; only the page itself failing is.
          if (!isMainFrame) return;
          revealApp();
          setScreen({
            kind: 'connect',
            serverUrl: screen.serverUrl,
            message: `The server answered with ${statusCode}.`,
          });
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1},
  webview: {backgroundColor: '#000000'},
});
