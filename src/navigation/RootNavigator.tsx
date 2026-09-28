import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, StackCardInterpolationProps } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { Colors } from '../constants/colors';

import { ModeSelector } from '../screens/ModeSelector';
import { Welcome } from '../screens/Welcome';
import { Onboarding } from '../screens/Onboarding';
import { AlignedTabs } from './AlignedTabs';
import { VCWelcome } from '../screens/vibecheck/VCWelcome';
import { VCOnboarding } from '../screens/vibecheck/VCOnboarding';
import { VibeTabs } from './VibeTabs';
import { VCProfileScreen } from '../screens/vibecheck/VCProfileScreen';
import { SecretHistory } from '../screens/aligned/SecretHistory';
import { QRScannerScreen } from '../screens/aligned/QRScannerScreen';
import { AlignmentRequestsScreen } from '../screens/aligned/AlignmentRequestsScreen';
import { AlignedProfileScreen } from '../screens/aligned/AlignedProfileScreen';
import Login from '@/screens/Login';
import Signup from '@/screens/Signup';
import VerifyEmail from '@/screens/VerifyEmail';
import ForgotPassword from '@/screens/ForgotPassword';
import ResetPassword from '@/screens/ResetPassword';
import LegalScreen from '@/screens/LegalScreen';
import ReportScreen from '../screens/ReportScreen';
import ReportChatScreen from '../screens/ReportChatScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMe } from '../services/authApi';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

const Stack = createStackNavigator<RootStackParamList>();

const forSlideDown = ({ current, layouts: { screen } }: StackCardInterpolationProps) => {
  return {
    cardStyle: {
      transform: [
        {
          translateY: current.progress.interpolate({
            inputRange: [0, 1],
            outputRange: [-screen.height, 0],
          }),
        },
      ],
    },
  };
};

const forSlideUp = ({ current, layouts: { screen } }: StackCardInterpolationProps) => {
  return {
    cardStyle: {
      transform: [
        {
          translateY: current.progress.interpolate({
            inputRange: [0, 1],
            outputRange: [screen.height, 0],
          }),
        },
      ],
    },
  };
};

const forFade = ({ current }: StackCardInterpolationProps) => {
  return {
    cardStyle: {
      opacity: current.progress,
    },
  };
};

import { createNavigationContainerRef } from '@react-navigation/native';
import { useEffect } from 'react';

export const navigationRef = createNavigationContainerRef<any>();

const linking = {
  prefixes: ['loukarver://'],
  config: {
    screens: {
      AlignedApp: {
        screens: {
          Thread: 'thread/:activeCategory?',
          Connect: 'connect',
          Dates: 'dates',
          Home: 'home',
          Map: 'map',
          Us: 'us'
        }
      },
      SecretHistory: 'secrethistory'
    }
  }
};

export default function RootNavigator() {
  useEffect(() => {
    try {
      const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient || Constants.appOwnership === 'expo';
      const appId = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;
      if (appId && Platform.OS !== 'web' && !isExpoGo) {
        const { OneSignal } = require('react-native-onesignal');
        OneSignal.initialize(appId);
        OneSignal.Notifications.requestPermission(true);

        const handleNotificationClick = (event: any) => {
          const data = event?.notification?.additionalData;
          if (data) {
            const screen = data.screen;
            const category = data.category || data.activeCategory || 'all';

            if (navigationRef.isReady()) {
              if (screen === 'Thread' || category) {
                navigationRef.navigate('AlignedApp', {
                  screen: 'Thread',
                  params: { activeCategory: category }
                });
              }
            }
          }
        };

        OneSignal.Notifications.addEventListener('click', handleNotificationClick);

        AsyncStorage.getItem('access_token').then((token) => {
          if (token) {
            getMe()
              .then((user: any) => {
                const uid = user?.id || user?._id;
                if (uid) {
                  OneSignal.login(String(uid));
                }
              })
              .catch(() => {});
          }
        }).catch(() => {});

        return () => {
          try {
            OneSignal.Notifications.removeEventListener('click', handleNotificationClick);
          } catch (_) {}
        };
      }
    } catch (e) {
      console.log('OneSignal notification click listener error:', e);
    }
  }, []);

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <Stack.Navigator
        screenOptions={{ 
          headerShown: false, 
          animationEnabled: true,
          cardStyle: { backgroundColor: Colors.bone }
        }}
        initialRouteName="Login"
      >
        <Stack.Screen name="Login" component={Login} />
        <Stack.Screen name="Signup" component={Signup} />
        <Stack.Screen name="VerifyEmail" component={VerifyEmail} />
        <Stack.Screen name="ForgotPassword" component={ForgotPassword} />
        <Stack.Screen name="ResetPassword" component={ResetPassword} />
        <Stack.Screen name="ModeSelector" component={ModeSelector} />
        <Stack.Screen name="AlignedWelcome" component={Welcome} />
        <Stack.Screen name="AlignedOnboarding" component={Onboarding} />
        <Stack.Screen 
          name="AlignedApp" 
          component={AlignedTabs} 
          options={({ route }: any) => {
            const dir = route.params?.direction;
            const interpolator = dir === 'up' ? forSlideUp : dir === 'down' ? forSlideDown : forFade;
            return { cardStyleInterpolator: interpolator, gestureEnabled: false };
          }} 
        />
        <Stack.Screen name="AlignedQRScanner" component={QRScannerScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="AlignmentRequests" component={AlignmentRequestsScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="AlignedProfile" component={AlignedProfileScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="VibeWelcome" component={VCWelcome} />
        <Stack.Screen name="VibeOnboarding" component={VCOnboarding} />
        <Stack.Screen 
          name="VibeApp" 
          component={VibeTabs} 
          options={({ route }: any) => {
            const dir = route.params?.direction;
            const interpolator = dir === 'up' ? forSlideUp : dir === 'down' ? forSlideDown : forFade;
            return { cardStyleInterpolator: interpolator, gestureEnabled: false };
          }} 
        />
        <Stack.Screen name="VibeProfile" component={VCProfileScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="SecretHistory" component={SecretHistory} options={{ presentation: 'modal' }} />
        <Stack.Screen name="Legal" component={LegalScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="Report" component={ReportScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="ReportChat" component={ReportChatScreen} options={{ presentation: 'modal' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}