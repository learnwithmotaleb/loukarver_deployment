import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useFonts } from 'expo-font';
import { ActivityIndicator, View, Platform, LogBox } from 'react-native';
import { enableScreens } from 'react-native-screens';
enableScreens(true);

// Ignore benign Expo Go media library warning on Android
LogBox.ignoreLogs([
  'Due to changes in Androids permission requirements',
]);

import RootNavigator from './src/navigation/RootNavigator';
import { Colors } from './src/constants/colors';
import { CustomAlert } from './src/components/ui/CustomAlert';
import { ErrorBoundary } from './src/components/ErrorBoundary';

import Constants, { ExecutionEnvironment } from 'expo-constants';

// OneSignal Initialization — ONE place only (Fix #3: removed duplicate in RootNavigator)
const ONE_SIGNAL_APP_ID = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient || Constants.appOwnership === 'expo';

if (ONE_SIGNAL_APP_ID && Platform.OS !== 'web' && !isExpoGo) {
  try {
    const { OneSignal } = require('react-native-onesignal');
    OneSignal.initialize(ONE_SIGNAL_APP_ID);
    OneSignal.Notifications.requestPermission(true);
  } catch (e) {
    console.log("OneSignal initialization skipped:", e);
  }
}

// Fix #7: Alert.alert override is NOT done here at module level anymore.
// It's now done inside the App component after <CustomAlert /> is guaranteed to be mounted.
// This prevents the timing issue where Alert.alert fires before the listener exists.

export default function App() {
  // Fix #4: Removed duplicate OneSignal click listener from App.tsx.
  // The only click handler lives in RootNavigator.tsx where it has access to navigationRef.

  const [fontsLoaded] = useFonts({
    'Fraunces-Light': require('./assets/fonts/Fraunces_72pt-Light.ttf'),
    'Fraunces-Regular': require('./assets/fonts/Fraunces_72pt-Regular.ttf'),
    'InstrumentSerif-Regular': require('./assets/fonts/InstrumentSerif-Regular.ttf'),
    'InstrumentSerif-Italic': require('./assets/fonts/InstrumentSerif-Italic.ttf'),
    'JetBrainsMono-Regular': require('./assets/fonts/ttf/JetBrainsMono-Regular.ttf'),
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bone }}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <SafeAreaProvider>
            <StatusBar style="dark" backgroundColor={Colors.bone} />
            <RootNavigator />
            <CustomAlert />
          </SafeAreaProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
