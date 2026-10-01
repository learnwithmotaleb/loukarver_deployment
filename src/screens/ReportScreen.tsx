import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { AppText } from '../components/ui/AppText';
import { AppButton } from '../components/ui/AppButton';
import { AppTextInput } from '../components/ui/AppTextInput';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import * as ImagePicker from 'expo-image-picker';

export default function ReportScreen() {
  const navigation = useNavigation<any>();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [attachedFile, setAttachedFile] = useState<any>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const res = await api.get('/reports');
      if (res.data) {
        setReports(res.data);
      }
    } catch (e) {
      console.log('Failed to fetch reports', e);
    } finally {
      setLoading(false);
    }
  };

  const handlePickFile = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to upload an image.');
      return;
    }
    
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      // Note: for a full production app, you might check asset.fileSize here (limit 5MB)
      setAttachedFile(asset);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert('Error', 'Please provide a title and description.');
      return;
    }
    
    setSubmitting(true);
    let fileUrl = null;
    
    try {
      if (attachedFile) {
        const formData = new FormData();
        const filename = attachedFile.uri.split('/').pop() || 'upload.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        
        formData.append('file', {
          uri: attachedFile.uri,
          name: filename,
          type
        } as any);
        
        const token = await AsyncStorage.getItem('access_token');
        const uploadRes = await fetch(`${api.defaults.baseURL}/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData,
        });
        
        const uploadData = await uploadRes.json();
        
        if (uploadData && uploadData.url) {
          fileUrl = uploadData.url;
        }
      }
      
      const payload = {
        title: title.trim(),
        description: description.trim(),
        file_url: fileUrl
      };
      
      await api.post('/reports', payload);
      Alert.alert('Success', 'Your report has been submitted.');
      setIsCreating(false);
      setTitle('');
      setDescription('');
      setAttachedFile(null);
      fetchReports();
    } catch (e) {
      console.log('Submit error', e);
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatus = (status: string) => {
    let color: string = Colors.muted;
    if (status === 'Resolved') color = '#34C759'; // green
    if (status === 'In Progress') color = '#007AFF'; // blue
    if (status === 'Rejected') color = '#FF3B30'; // red
    
    return (
      <View style={[styles.statusBadge, { borderColor: color }]}>
        <AppText style={{ fontSize: 10, color }}>{status.toUpperCase()}</AppText>
      </View>
    );
  };

  if (isCreating) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => setIsCreating(false)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.ink} />
          </Pressable>
          <AppText variant="heading">New Report</AppText>
          <View style={{ width: 24 }} />
        </View>
        <KeyboardAwareScrollView
            style={styles.content}
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bottomOffset={20}
          >
            <AppText style={{ color: Colors.ink2, marginBottom: 20 }}>
              Describe the issue you're facing or any feedback you have. Our support team will get back to you.
            </AppText>
            
            <AppTextInput
              label="Title"
              placeholder="E.g. Cannot upload profile photo"
              value={title}
              onChangeText={setTitle}
            />
            <View style={{ height: 16 }} />
            
            <AppTextInput
              label="Description"
              placeholder="Please provide details..."
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={5}
              style={{ minHeight: 100, textAlignVertical: 'top' }}
            />
            <View style={{ height: 16 }} />
            
            <Pressable style={styles.uploadBtn} onPress={handlePickFile}>
              <Ionicons name="image-outline" size={20} color={Colors.accent} />
              <AppText style={{ marginLeft: 8, color: Colors.accent }}>
                {attachedFile ? 'Change Attached Image' : 'Attach Image (Optional)'}
              </AppText>
            </Pressable>
            
            {attachedFile && (
              <AppText style={{ fontSize: 12, color: Colors.muted, marginTop: 8 }}>
                Selected: {attachedFile.uri.split('/').pop()}
              </AppText>
            )}
            
            <View style={{ height: 40 }} />
            <AppButton 
              variant="solid" 
              onPress={handleSubmit} 
              disabled={submitting || !title || !description}
              full
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </AppButton>
          </KeyboardAwareScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.ink} />
        </Pressable>
        <AppText variant="heading">Support</AppText>
        <Pressable onPress={() => setIsCreating(true)}>
          <Ionicons name="add" size={24} color={Colors.ink} />
        </Pressable>
      </View>
      
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={Colors.accent} />
        </View>
      ) : (
        <KeyboardAwareScrollView style={styles.content}>
          {reports.length === 0 ? (
            <View style={styles.empty}>
              <AppText style={{ color: Colors.muted, textAlign: 'center' }}>You have no support tickets.</AppText>
              <AppButton variant="outline" onPress={() => setIsCreating(true)} style={{ marginTop: 20 }}>
                Create New Report
              </AppButton>
            </View>
          ) : (
            <View>
              {reports.map((report) => (
                <Pressable 
                  key={report.id} 
                  style={styles.card}
                  onPress={() => navigation.navigate('ReportChat', { reportId: report.id })}
                >
                  <View style={styles.cardHeader}>
                    <AppText style={{ fontWeight: '600', flex: 1, marginRight: 10 }} numberOfLines={1}>
                      {report.title}
                    </AppText>
                    {renderStatus(report.status)}
                  </View>
                  <AppText style={{ color: Colors.ink2, fontSize: 13, marginTop: 6 }} numberOfLines={2}>
                    {report.description}
                  </AppText>
                  <AppText style={{ color: Colors.muted, fontSize: 11, marginTop: 8 }}>
                    {new Date(report.updated_at).toLocaleDateString()}
                  </AppText>
                </Pressable>
              ))}
            </View>
          )}
        </KeyboardAwareScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bone },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule
  },
  backBtn: { padding: 4 },
  content: { padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { paddingVertical: 40, alignItems: 'center' },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  statusBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.rule,
    borderRadius: 8,
    justifyContent: 'center',
    borderStyle: 'dashed'
  }
});
