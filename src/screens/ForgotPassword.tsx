import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useNavigation, NavigationProp, useRoute, RouteProp } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { AppText } from '../components/ui/AppText';
import { AppButton } from '../components/ui/AppButton';
import { AppTextInput } from '../components/ui/AppTextInput';
import { RootStackParamList } from '../types';
import { forgotPassword } from '../services/authApi';

type ForgotPasswordRouteProp = RouteProp<RootStackParamList, 'ForgotPassword'>;

const ForgotPassword = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<ForgotPasswordRouteProp>();
  const [email, setEmail] = useState(route.params?.email || route.params?.initialEmail || '');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');


  useEffect(() => {
    if (route.params?.email || route.params?.initialEmail) {
      setEmail(route.params?.email || route.params?.initialEmail || '');
    }
  }, [route.params?.email, route.params?.initialEmail]);



  const handleForgot = async () => {
    setErrorText('');
    if (!email) {
      setErrorText('Please enter your email address.');
      return;
    }
    try {
      setLoading(true);
      await forgotPassword(email);
      navigation.navigate('ResetPassword', { email });
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || error.message || 'An error occurred.';
      if (error.response?.status === 404 || errorMessage.toLowerCase().includes('not found')) {
         setErrorText('No account exists with this email address.');
      } else {
         setErrorText(errorMessage);
      }
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
          <Pressable onPress={() => navigation.goBack()} style={{ alignSelf: 'flex-start', paddingBottom: 16 }}>
            <AppText color={Colors.muted} variant="smallCaps">
              ← Back
            </AppText>
          </Pressable>

          <View style={styles.content}>
            <AppText variant="smallCaps" color={Colors.accent} style={{ marginBottom: 14 }}>
              RECOVERY
            </AppText>
            <AppText variant="display" size={42} style={{ lineHeight: 42, marginBottom: 14 }}>
              Forgot Password
            </AppText>
            <AppText variant="serifItalic" size={18} color={Colors.muted} style={{ marginBottom: 36, lineHeight: 27 }}>
              Enter your email to receive a reset code.
            </AppText>

            <AppTextInput
              label="Email address"
              n="01"
              value={email}
              onChangeText={(t) => { setEmail(t); setErrorText(''); }}
              placeholder="lou@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="go"
              onSubmitEditing={handleForgot}
            />
            {!!errorText && (
              <AppText color={Colors.accent} style={{ marginTop: 8, fontSize: 13 }}>
                {errorText}
              </AppText>
            )}
          </View>

          <View style={styles.actions}>
            <AppButton variant="solid" size="lg" onPress={handleForgot} disabled={loading} style={{ width: '100%', marginBottom: 16 }}>
              {loading ? 'Sending...' : 'Send Reset Code →'}
            </AppButton>
            
            <Pressable onPress={() => navigation.navigate('Login', { email, initialEmail: email })} style={{ paddingVertical: 12 }}>
              <AppText variant="smallCaps" color={Colors.ink} style={{ textAlign: 'center' }}>
                Remembered it? <AppText variant="smallCaps" color={Colors.accent}>Sign In</AppText>
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

export default ForgotPassword;
