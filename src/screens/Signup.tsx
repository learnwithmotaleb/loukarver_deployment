import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useNavigation, NavigationProp, useRoute, RouteProp } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { AppText } from '../components/ui/AppText';
import { AppButton } from '../components/ui/AppButton';
import { AppTextInput } from '../components/ui/AppTextInput';
import { RootStackParamList } from '../types';
import { signupUser } from '../services/authApi';

type SignupRouteProp = RouteProp<RootStackParamList, 'Signup'>;

const Signup = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<SignupRouteProp>();
  const [email, setEmail] = useState(route.params?.email || route.params?.initialEmail || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');


  useEffect(() => {
    if (route.params?.email || route.params?.initialEmail) {
      setEmail(route.params?.email || route.params?.initialEmail || '');
    }
  }, [route.params?.email, route.params?.initialEmail]);



  const handleSignup = async () => {
    setErrorMsg('');
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }
    try {
      setLoading(true);
      await signupUser(email, password);
      navigation.navigate('VerifyEmail', { email });
    } catch (error: any) {
      let errorMessage = error.response?.data?.detail || error.message || 'An error occurred during signup.';
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
              NEW BEGINNINGS
            </AppText>
            <AppText variant="display" size={42} style={{ lineHeight: 42, marginBottom: 14 }}>
              Sign Up
            </AppText>
            <AppText variant="serifItalic" size={18} color={Colors.muted} style={{ marginBottom: 36, lineHeight: 27 }}>
              Create an account to start your journey.
            </AppText>

            <AppTextInput
              label="Email address"
              n="01"
              value={email}
              onChangeText={(t) => { setEmail(t); setErrorMsg(''); }}
              placeholder="lou@example.com"
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
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={handleSignup}
              />
            </View>
          </View>

          <View style={styles.actions}>
            {errorMsg ? (
              <AppText variant="serifItalic" size={14} color={Colors.accent} style={{ textAlign: 'center', marginBottom: 16 }}>
                {errorMsg}
              </AppText>
            ) : null}
            <AppButton variant="solid" size="lg" onPress={handleSignup} disabled={loading} style={{ width: '100%', marginBottom: 16 }}>
              {loading ? 'Creating...' : 'Create Account →'}
            </AppButton>
            
            <Pressable onPress={() => navigation.navigate('Login', { email, initialEmail: email })} style={{ paddingVertical: 12 }}>
              <AppText variant="smallCaps" color={Colors.ink} style={{ textAlign: 'center' }}>
                Already have an account? <AppText variant="smallCaps" color={Colors.accent}>Sign In</AppText>
              </AppText>
            </Pressable>
            
            <View style={{ marginTop: 16, alignItems: 'center' }}>
              <AppText variant="mono" size={10} color={Colors.muted} style={{ textAlign: 'center', lineHeight: 16 }}>
                By signing up, you agree to our{'\n'}
                <AppText variant="mono" size={10} color={Colors.accent} onPress={() => navigation.navigate('Legal', { type: 'terms' })}>Terms of Conditions</AppText>{' and '}<AppText variant="mono" size={10} color={Colors.accent} onPress={() => navigation.navigate('Legal', { type: 'privacy' })}>Privacy Policy</AppText>
              </AppText>
            </View>
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

export default Signup;
