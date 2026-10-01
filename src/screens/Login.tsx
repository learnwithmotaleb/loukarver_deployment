import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useNavigation, NavigationProp, useRoute, RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/colors';
import { AppText } from '../components/ui/AppText';
import { AppButton } from '../components/ui/AppButton';
import { AppTextInput } from '../components/ui/AppTextInput';
import { RootStackParamList } from '../types';
import { loginUser } from '../services/authApi';

type LoginRouteProp = RouteProp<RootStackParamList, 'Login'>;

const Login = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<LoginRouteProp>();
  const [email, setEmail] = useState(route.params?.email || route.params?.initialEmail || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');


  useEffect(() => {
    if (route.params?.email || route.params?.initialEmail) {
      setEmail(route.params?.email || route.params?.initialEmail || '');
    }
  }, [route.params?.email, route.params?.initialEmail]);



  useEffect(() => {
    const checkAutoLogin = async () => {
      const token = await AsyncStorage.getItem('access_token');
      if (token) {
        try {
          const { getMe } = require('../services/authApi');
          await getMe();
          navigation.navigate('ModeSelector', { autoSelect: route.params?.returnTo });
        } catch (e) {
          console.log("Auto-login failed:", e);
        }
      }
    };
    checkAutoLogin();
  }, [navigation, route.params?.returnTo]);

  const handleLogin = async () => {
    setErrorMsg('');
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }
    try {
      setLoading(true);
      const data = await loginUser(email, password);
      await AsyncStorage.setItem('access_token', data.access_token);
      await AsyncStorage.setItem('refresh_token', data.refresh_token);

      try {
        const { getMe } = require('../services/authApi');
        const user = await getMe();
        
        const Constants = require('expo-constants').default;
        const ExecutionEnvironment = require('expo-constants').ExecutionEnvironment;
        const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment?.StoreClient || Constants.appOwnership === 'expo';
        
        if (user && user.id && Platform.OS !== 'web' && !isExpoGo) {
          const { OneSignal } = require('react-native-onesignal');
          OneSignal.login(user.id);
        }
      } catch (e) {
        console.log("Failed to login to OneSignal", e);
      }

      const returnTo = route.params?.returnTo;
      navigation.navigate('ModeSelector', { autoSelect: returnTo });
    } catch (error: any) {
      let errorMessage = error.response?.data?.detail || error.message || 'An error occurred during login.';
      if (errorMessage.toLowerCase() === 'network error') {
        errorMessage = 'No internet connection available. Please check your network and try again.';
      }
      setErrorMsg(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
        <KeyboardAwareScrollView
          contentContainerStyle={[
            styles.container,
            { paddingBottom: 40 }
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          bottomOffset={20}
        >
          <View style={styles.content}>
            <AppText variant="smallCaps" color={Colors.accent} style={{ marginBottom: 14 }}>
              WELCOME BACK
            </AppText>
            <AppText variant="display" size={42} style={{ lineHeight: 42, marginBottom: 14 }}>
              Sign In
            </AppText>
            <AppText variant="serifItalic" size={18} color={Colors.muted} style={{ marginBottom: 36, lineHeight: 27 }}>
              Enter your credentials to continue.
            </AppText>

            <AppTextInput
              label="Email address"
              n="01"
              value={email}
              onChangeText={(t) => { setEmail(t); setErrorMsg(''); }}
              placeholder="x1@yopmail.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
            />

            <View style={{ marginTop: 24 }}>
              <AppTextInput
                label="Password"
                n="02"
                value={password}
                onChangeText={(t) => { setPassword(t); setErrorMsg(''); }}
                placeholder="••••••••"
                isPassword
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={handleLogin}
              />
            </View>
          </View>

          <View style={styles.actions}>
            {errorMsg ? (
              <AppText variant="serifItalic" size={14} color={Colors.accent} style={{ textAlign: 'center', marginBottom: 16 }}>
                {errorMsg}
              </AppText>
            ) : null}
            <AppButton variant="solid" size="lg" onPress={handleLogin} disabled={loading} style={{ width: '100%', marginBottom: 16 }}>
              {loading ? 'Loading...' : 'Login →'}
            </AppButton>

            <Pressable onPress={() => navigation.navigate('ForgotPassword', { email, initialEmail: email })} style={{ marginBottom: 16, padding: 8 }}>
              <AppText variant="smallCaps" color={Colors.muted} style={{ textAlign: 'center' }}>
                Forgot Password?
              </AppText>
            </Pressable>

            <Pressable onPress={() => navigation.navigate('Signup', { email, initialEmail: email })} style={{ paddingVertical: 12 }}>
              <AppText variant="smallCaps" color={Colors.ink} style={{ textAlign: 'center' }}>
                Don't have an account? <AppText variant="smallCaps" color={Colors.accent}>Sign Up</AppText>
              </AppText>
            </Pressable>
          </View>
        </KeyboardAwareScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bone },
  container: { flexGrow: 1, paddingHorizontal: 32, paddingTop: 20, justifyContent: 'space-between' },
  content: { flex: 1, justifyContent: 'center', minHeight: 320 },
  actions: { paddingTop: 20, paddingBottom: 20 },
});

export default Login;