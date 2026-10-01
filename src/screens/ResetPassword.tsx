import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { AppText } from '../components/ui/AppText';
import { AppButton } from '../components/ui/AppButton';
import { AppTextInput } from '../components/ui/AppTextInput';
import { RootStackParamList } from '../types';
import { resetPassword } from '../services/authApi';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ResetPasswordRouteProp = RouteProp<RootStackParamList, 'ResetPassword'>;

const ResetPassword = () => {
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<ResetPasswordRouteProp>();
  const email = route.params.email;



  const handleReset = async () => {
    setErrorText('');
    if (!otp || !newPassword) {
      setErrorText('Please enter the reset code and your new password.');
      return;
    }
    try {
      setLoading(true);
      const data = await resetPassword(email, otp, newPassword);
      await AsyncStorage.setItem('access_token', data.access_token);
      await AsyncStorage.setItem('refresh_token', data.refresh_token);
      navigation.navigate('ModeSelector');
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || error.message || 'Reset failed.';
      setErrorText(errorMessage);
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
              SECURE YOUR ACCOUNT
            </AppText>
            <AppText variant="display" size={42} style={{ lineHeight: 42, marginBottom: 14 }}>
              Reset Password
            </AppText>
            <AppText variant="serifItalic" size={18} color={Colors.muted} style={{ marginBottom: 36, lineHeight: 27 }}>
              Enter the 6-digit code sent to your email and a new password.
            </AppText>

            <AppTextInput
              label="Reset code"
              n="01"
              value={otp}
              onChangeText={setOtp}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              returnKeyType="next"
            />

            <View style={{ marginTop: 24 }}>
              <AppTextInput
                label="New password"
                n="02"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="••••••••"
                isPassword
                returnKeyType="go"
                onSubmitEditing={handleReset}
              />
            </View>
            
            {!!errorText && (
              <AppText color={Colors.accent} style={{ marginTop: 12, fontSize: 13 }}>
                {errorText}
              </AppText>
            )}
          </View>

          <View style={styles.actions}>
            <AppButton variant="solid" size="lg" onPress={handleReset} disabled={loading} style={{ width: '100%', marginBottom: 16 }}>
              {loading ? 'Resetting...' : 'Reset Password →'}
            </AppButton>
            
            <Pressable onPress={() => navigation.navigate('Login', { email, initialEmail: email })} style={{ paddingVertical: 12 }}>
              <AppText variant="smallCaps" color={Colors.ink} style={{ textAlign: 'center' }}>
                Cancel and <AppText variant="smallCaps" color={Colors.accent}>Return to Login</AppText>
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

export default ResetPassword;
