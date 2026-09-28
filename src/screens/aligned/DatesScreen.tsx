import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, FlatList, StyleSheet, Pressable, Alert, DeviceEventEmitter, RefreshControl, Image, Modal, useWindowDimensions, TextInput, Platform } from 'react-native';
import { ScrollView, TouchableOpacity } from 'react-native-gesture-handler';
import { Colors } from "../../constants/colors";
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { AppText } from "../../components/ui/AppText";
import { AppButton } from "../../components/ui/AppButton";
import { AppTextInput } from "../../components/ui/AppTextInput";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { DateCard } from "../../components/dates/DateCard";
import { DateEntry } from "../../types";
import { countdownParts } from "../../utils/dateUtils";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import AlignedNav from "@/components/ui/AlignedNav";

import { createDate, listDates, respondToDate, completeDate, addReview, updateReview, updateDate, pingDate, requestCancelDate, cancelDate, requestDeletePhoto, approveDeletePhoto, rejectDeletePhoto, deleteDate } from "../../services/datesApi";
import { getMe } from "../../services/authApi";
import api from "../../services/api";

export const DatesScreen: React.FC = () => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [user, setUser] = useState<any>(null);
  const [dates, setDates] = useState<any[]>([]);
  const [timerDates, setTimerDates] = useState<any[]>([]);
  const [selected, setSelected] = useState<DateEntry | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);

  const datesCache = useRef<Record<string, any[]>>({});

  const [city, setCity] = useState("Los Angeles");
  const [stars, setStars] = useState(0);
  const [memory, setMemory] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);

  // Date Generator States
  const [mood, setMood] = useState("Romantic");
  const [vibe, setVibe] = useState("Cozy");
  const [meetType, setMeetType] = useState<"location" | "pickup" | "pickedup">("location");
  const [exactDate, setExactDate] = useState(new Date(Date.now() + 7 * 86_400_000));
  const [exactTime, setExactTime] = useState(new Date(2026, 4, 8, 19, 0)); // 7:00 PM
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pingSheet, setPingSheet] = useState(false);
  const [cancelSheet, setCancelSheet] = useState(false);
  const [selectedDelay, setSelectedDelay] = useState("10 MIN");
  const [pingNote, setPingNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const [manualTitle, setManualTitle] = useState("");
  const [manualLocation, setManualLocation] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const [manualDate, setManualDate] = useState(new Date(Date.now() + 7 * 86_400_000));
  const [manualTime, setManualTime] = useState(new Date(2026, 4, 8, 19, 0)); // 7:00 PM
  const [showManualDatePicker, setShowManualDatePicker] = useState(false);
  const [showManualTimePicker, setShowManualTimePicker] = useState(false);
  const [manualMeetType, setManualMeetType] = useState<"location" | "pickup" | "pickedup">("location");
  const [isManualSubmitting, setIsManualSubmitting] = useState(false);

  const [rescheduleVenue, setRescheduleVenue] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState(new Date());
  const [showReschedulePicker, setShowReschedulePicker] = useState(false);
  const [reschedulePickerMode, setReschedulePickerMode] = useState<"date" | "time">("date");

  const moods = ["Romantic", "Playful", "Adventurous", "Relaxed", "Intimate", "Spontaneous", "Sophisticated", "Creative"];
  const vibes = ["Outdoorsy", "Foodie", "Cultural", "Nightlife", "Cozy", "Active", "Artistic", "Chill", "Glamorous"];

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortOrder, setSortOrder] = useState<"Upcoming First" | "Latest First">("Upcoming First");
  const [dismissedPrompts, setDismissedPrompts] = useState<string[]>([]);
  
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const [isSavingMemory, setIsSavingMemory] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);

  const [generatorSheet, setGeneratorSheet] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const loadDates = useCallback(async (pageToLoad = 1, append = false, forceRefresh = false) => {
    try {
      if (pageToLoad === 1) {
        const userRes = await getMe();
        if (userRes) setUser(userRes);
      } else {
        setLoadingMore(true);
      }

      const cacheKey = `${statusFilter}|${sortOrder}`;

      // Check cache first for instant load
      if (pageToLoad === 1 && !forceRefresh && !searchQuery && !append) {
        if (datesCache.current[cacheKey]) {
          setDates(datesCache.current[cacheKey]);
          return; // Skip API call
        }
      }

      const res = await listDates(pageToLoad, 10, statusFilter, searchQuery, sortOrder);
      if (res.success) {
        if (append) {
          setDates(prev => {
            const newDates = res.data.filter((d: any) => !prev.some(p => p.id === d.id));
            return [...prev, ...newDates];
          });
        } else {
          setDates(res.data);
          // Save to cache
          if (!searchQuery) {
            datesCache.current[cacheKey] = res.data;
          }
          setSelected(prev => {
            if (prev) {
              const updated = res.data.find((d: any) => d.id === prev.id);
              if (updated) return mapDateToEntry(updated);
            }
            return prev;
          });
        }
        
        setHasMore(res.data.length === 10);
        setPage(pageToLoad);
      }
    } catch (e) {
      console.log(e);
    } finally {
      setLoadingMore(false);
    }
  }, [statusFilter, searchQuery, sortOrder]);

  const loadTimerContext = useCallback(async () => {
    try {
      const res = await listDates(1, 50, "Accepted", "", "Upcoming First");
      if (res.success) {
        setTimerDates(res.data);
      }
    } catch (e) {
      console.log("Error loading timer context", e);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    datesCache.current = {};
    await loadDates(1, false, true);
    await loadTimerContext();
  }, [loadDates, loadTimerContext]);

  useEffect(() => {
    loadDates(1, false);
    loadTimerContext();
    
    // Background pre-warm for "All" filter
    if (statusFilter !== "All") {
      listDates(1, 10, "All", "", sortOrder).then(res => {
        if (res.success) datesCache.current[`All|${sortOrder}`] = res.data;
      }).catch(() => {});
    }

    const sub1 = DeviceEventEmitter.addListener('REFRESH_DATES_DATA', refreshAll);
    const sub2 = DeviceEventEmitter.addListener('REFRESH_ALIGNED_DATA', refreshAll);
    return () => {
      sub1.remove();
      sub2.remove();
    };
  }, [loadDates, loadTimerContext, statusFilter, sortOrder, refreshAll]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      loadDates(page + 1, true);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const handleDateChange = (_: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) setExactDate(selectedDate);
  };

  const handleTimeChange = (_: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) setExactTime(selectedTime);
  };

  const handleManualDateChange = (_: any, selectedDate?: Date) => {
    setShowManualDatePicker(false);
    if (selectedDate) setManualDate(selectedDate);
  };

  const handleManualTimeChange = (_: any, selectedTime?: Date) => {
    setShowManualTimePicker(false);
    if (selectedTime) setManualTime(selectedTime);
  };

  const generateDate = async () => {
    if (isGenerating) return;
    if (!user?.is_aligned && !user?.partner) {
      Alert.alert("Partner Required", "Please connect with your partner first to propose dates.");
      return;
    }
    setIsGenerating(true);
    try {
      const payload = {
        where: `Special ${mood.toLowerCase()} ${vibe.toLowerCase()} date in ${city}`,
        date: exactDate.toISOString().slice(0, 10).replace(/-/g, '.'),
        time: formatTime(exactTime).replace(" ", ""),
        how_we_meet: meetType,
        city_name: city,
        mood: mood,
        vibe: vibe,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      };
      const res = await createDate(payload);
      if (res && res.id) {
        setGeneratorSheet(false);
        refreshAll();
      }
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.response?.data?.detail || "Could not propose date.");
    } finally {
      setIsGenerating(false);
    }
  };

  const manualPropose = async () => {
    if (!user?.is_aligned && !user?.partner) {
      Alert.alert("Partner Required", "Please connect with your partner first to propose dates.");
      return;
    }
    if (!manualTitle.trim() && !manualLocation.trim()) {
      Alert.alert("Required", "Please provide a title or location for the date.");
      return;
    }
    setIsManualSubmitting(true);
    try {
      const payload = {
        title: manualTitle.trim() || undefined,
        where: manualLocation.trim() || manualTitle.trim(),
        date: manualDate.toISOString().slice(0, 10).replace(/-/g, '.'),
        time: formatTime(manualTime).replace(" ", ""),
        how_we_meet: manualMeetType,
        note: manualDesc.trim() || undefined,
        city_name: manualLocation.trim() || undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      };
      const res = await createDate(payload);
      if (res && res.id) {
        setSheet(null);
        setManualTitle("");
        setManualLocation("");
        setManualDesc("");
        setManualDate(new Date(Date.now() + 7 * 86_400_000));
        setManualTime(new Date(2026, 4, 8, 19, 0));
        setManualMeetType("location");
        refreshAll();
      }
    } catch (e: any) {
      console.log("Error proposing manual date:", e);
      Alert.alert("Error", e?.response?.data?.detail || "Could not propose date.");
    } finally {
      setIsManualSubmitting(false);
    }
  };

  const openReschedule = () => {
    if (selected) {
      setRescheduleVenue(selected.venue);
      setRescheduleDate(new Date()); // defaulting to today for simplicity
      setSheet("reschedule");
    }
  };

  const submitReschedule = async () => {
    try {
      if (selected) {
        const payload = {
          where: rescheduleVenue,
          date: rescheduleDate.toISOString().slice(0, 10).replace(/-/g, '.'),
          time: formatTime(rescheduleDate).replace(" ", ""),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
        };
        await updateDate(selected.id.toString(), payload);
        setSheet(null);
        refreshAll();
      }
    } catch (e) { console.log(e); }
  };

  const handleRespond = async (action: string) => {
    try {
      if (selected) {
        await respondToDate(selected.id.toString(), action);
        setSheet(null);
        refreshAll();
      }
    } catch (e) { console.log(e); }
  };

  const handleSaveMemory = async () => {
    if (stars === 0) {
      Alert.alert("Rating Required", "Please select a star rating for this date.");
      return;
    }
    if (!selected || isSavingMemory) return;
    setIsSavingMemory(true);
    try {
      if (isEditing) {
        await updateReview(selected.id.toString(), { rating: stars, text: memory || " ", photos, existing_photos: existingPhotos });
      } else {
        if (selected.status !== "completed") {
          await completeDate(selected.id.toString());
        }
        await addReview(selected.id.toString(), { rating: stars, text: memory || " ", photos });
      }
      setSheet(null);
      refreshAll();
    } catch(e) {
      console.log("Error saving memory:", e);
      Alert.alert("Error", isEditing ? "Failed to update memory." : "Failed to save memory.");
    } finally {
      setIsSavingMemory(false);
    }
  };

  const handleEditReview = (r: any) => {
    setStars(r.rating);
    setMemory(r.text === " " ? "" : r.text);
    setPhotos([]);
    setExistingPhotos(r.photos || []);
    setIsEditing(true);
    setSheet("rate");
  };

  const mapDateToEntry = (d: any): DateEntry => {
    const ratings = d.reviews?.map((r: any) => r.rating) || [];
    const avg = ratings.length > 0 ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : undefined;
    
    let myPhoto: string | undefined;
    let partnerPhoto: string | undefined;

    if (d.reviews) {
      d.reviews.forEach((r: any) => {
        if (r.photos && r.photos.length > 0) {
          if (r.user_id === user?.id) {
            myPhoto = r.photos[0];
          } else {
            partnerPhoto = r.photos[0];
          }
        }
      });
    }

    return {
      id: d.id,
      creator_id: d.creator_id,
      proposed_by: d.proposed_by,
      status: d.status.toLowerCase(),
      rating: d.reviews?.length > 0 ? d.reviews[0].rating : undefined,
      averageRating: avg,
      venue: d.where,
      date: d.date,
      exactTime: d.time,
      meetType: d.how_we_meet as any,
      memory: d.reviews?.length > 0 ? d.reviews[0].text : undefined,
      utc_timestamp: d.utc_timestamp,
      photos: d.reviews?.length > 0 ? d.reviews[0].photos : [],
      completed_by: d.completed_by || [],
      myPhoto,
      partnerPhoto,
      reviews: d.reviews || [],
      photo_delete_requests: d.photo_delete_requests || []
    };
  };

  const CompletionPrompt = ({ dateEntry }: { dateEntry: DateEntry }) => (
    <View style={{ 
      marginBottom: 32, 
      paddingVertical: 20,
      paddingHorizontal: 20,
      backgroundColor: Colors.bone, 
      borderWidth: 1,
      borderColor: Colors.rule,
      borderRadius: 16, 
      alignItems: 'center' 
    }}>
      <AppText variant="smallCaps" color={Colors.accent} style={{ marginBottom: 12, letterSpacing: 2 }}>DATE PASSED</AppText>
      <AppText variant="heading" size={20} color={Colors.ink} style={{ marginBottom: 8, textAlign: 'center' }}>
        Did you complete "{dateEntry.venue}"?
      </AppText>
      <AppText variant="serifItalic" color={Colors.muted} style={{ marginBottom: 20 }}>
        {dateEntry.date} at {dateEntry.exactTime}
      </AppText>
      <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
        <AppButton variant="solid" style={{ flex: 1 }} onPress={() => {
          setSelected(dateEntry);
          setStars(0);
          setMemory("");
          setPhotos([]);
          setSheet("rate");
        }}>
          Yes
        </AppButton>
        <AppButton variant="outline" style={{ flex: 1 }} onPress={async () => {
          // Optimistically hide the prompt
          setDismissedPrompts(prev => [...prev, dateEntry.id.toString()]);
          try {
            await cancelDate(dateEntry.id.toString());
            refreshAll();
          } catch (e) {
            console.log("Error cancelling date:", e);
          }
        }}>
          No
        </AppButton>
      </View>
    </View>
  );

const TimerDisplay = ({ targetDate }: { targetDate: string }) => {
    const [parts, setParts] = useState(countdownParts(new Date(targetDate)));
    useEffect(() => {
      const interval = setInterval(() => {
        setParts(countdownParts(new Date(targetDate)));
      }, 1000);
      return () => clearInterval(interval);
    }, [targetDate]);

    return (
      <View style={{ 
        marginBottom: 32, 
        paddingVertical: 20,
        paddingHorizontal: 16,
        backgroundColor: Colors.transparent, 
        borderWidth: 1,
        borderColor: Colors.rule,
        borderRadius: 16, 
        alignItems: 'center' 
      }}>
        <AppText variant="smallCaps" color={Colors.muted} style={{ marginBottom: 12, letterSpacing: 2 }}>Next Date In</AppText>
        <AppText variant="display" size={32} color={Colors.ink}>
          {parts.D > 0 && <><AppText variant="display" size={32} color={Colors.accent}>{parts.D}</AppText>D {' '}</>}
          {(parts.D > 0 || parts.H > 0) && <><AppText variant="display" size={32} color={Colors.accent}>{String(parts.H).padStart(2, '0')}</AppText>H {' '}</>}
          {(parts.D > 0 || parts.H > 0 || parts.M > 0) && <><AppText variant="display" size={32} color={Colors.accent}>{String(parts.M).padStart(2, '0')}</AppText>M {' '}</>}
          <AppText variant="display" size={32} color={Colors.accent}>{String(parts.S).padStart(2, '0')}</AppText>S
        </AppText>
      </View>
    );
  };

  const acceptedDates = timerDates
    .filter(d => d.status.toLowerCase() === "accepted")
    .sort((a, b) => {
      const aTime = a.utc_timestamp ? new Date(a.utc_timestamp).getTime() : 0;
      const bTime = b.utc_timestamp ? new Date(b.utc_timestamp).getTime() : 0;
      return aTime - bTime;
    });

  const now = Date.now();
  const pastUncompletedDates = acceptedDates.filter(d => {
    if (!d.utc_timestamp) return false;
    // Don't show if user already clicked YES and completed it (even if partner hasn't)
    if (d.completed_by?.includes(user?.id)) return false;
    return new Date(d.utc_timestamp).getTime() <= now && !dismissedPrompts.includes(d.id.toString());
  });
  
  const futureDates = acceptedDates.filter(d => {
    if (!d.utc_timestamp) return false;
    return new Date(d.utc_timestamp).getTime() > now;
  });

  const nearestFutureDate = futureDates.length > 0 ? futureDates[0] : null;
  const isNearestWithin1Day = nearestFutureDate && nearestFutureDate.utc_timestamp 
    ? (new Date(nearestFutureDate.utc_timestamp).getTime() - now) <= 24 * 60 * 60 * 1000 
    : false;

  const oldestPastDate = pastUncompletedDates.length > 0 ? pastUncompletedDates[0] : null;

  let displayMode: 'none' | 'timer' | 'prompt' = 'none';
  let targetDisplayDate: any = null;

  if (isNearestWithin1Day) {
    displayMode = 'timer';
    targetDisplayDate = nearestFutureDate;
  } else if (oldestPastDate) {
    displayMode = 'prompt';
    targetDisplayDate = oldestPastDate;
  } else if (nearestFutureDate) {
    displayMode = 'timer';
    targetDisplayDate = nearestFutureDate;
  }

  const listHeaderNode = (
    <View style={styles.inner}>
      <AppText variant="display" size={42} style={{ lineHeight: 42, marginBottom: 6 }}>
        Dates
        <AppText size={42} color={Colors.accent}>.</AppText>
      </AppText>
      <AppText variant="serifItalic" size={16} color={Colors.muted} style={{ lineHeight: 24, marginBottom: 24 }}>
        Intentional time, well-spent.
      </AppText>

      {displayMode === 'timer' && targetDisplayDate && targetDisplayDate.utc_timestamp && (
        <TimerDisplay targetDate={targetDisplayDate.utc_timestamp} />
      )}
      
      {displayMode === 'prompt' && targetDisplayDate && (
        <CompletionPrompt dateEntry={mapDateToEntry(targetDisplayDate)} />
      )}

      {/* ==================== DATE GENERATOR COMPACT ==================== */}
      <Pressable style={styles.generatorCard} onPress={() => {
        if (!user?.is_aligned && !user?.partner) {
          Alert.alert("Partner Required", "Please connect with your partner first to propose dates.");
          return;
        }
        setCity("");
        setMood("Romantic");
        setVibe("Outdoorsy");
        setExactDate(new Date());
        setExactTime(new Date());
        setMeetType("location");
        setGeneratorSheet(true);
      }}>
        <View style={[styles.genHeader, { borderBottomWidth: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          <AppText variant="smallCaps" color={Colors.ink}>
            ♦ GENERATE DATE
          </AppText>
          <AppText variant="smallCaps" color={Colors.muted}>
            TAP TO START
          </AppText>
        </View>
      </Pressable>



      <AppText variant="smallCaps" color={Colors.ink2} style={{ marginBottom: 8, marginTop: 28 }}>
        Dates
      </AppText>
      
      {/* Search and Filters */}
      <View style={{ marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <View style={{ 
            flex: 1, 
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: Colors.transparent, 
            borderWidth: 1, 
            borderColor: Colors.rule, 
            borderRadius: 50, 
            paddingHorizontal: 16, 
            height: 48
          }}>
            <Ionicons name="search-outline" size={20} color={Colors.muted} style={{ marginRight: 8 }} />
            <TextInput 
              value={searchInput} 
              onChangeText={setSearchInput} 
              placeholder="Search by name, city, vibe..." 
              placeholderTextColor="#b3b3b3"
              style={{ flex: 1, fontSize: 14, color: Colors.ink, paddingVertical: 0 }}
            />
          </View>
          <Pressable 
            onPress={() => {
              setSortOrder(prev => {
                const nextSort = prev === "Upcoming First" ? "Latest First" : "Upcoming First";
                if (nextSort === "Upcoming First" && (statusFilter === "Completed" || statusFilter === "Rejected")) {
                  setStatusFilter("All");
                }
                return nextSort;
              });
            }}
            style={{ 
              height: 48,
              paddingHorizontal: 16, 
              borderRadius: 50, 
              backgroundColor: Colors.ink, 
              alignItems: 'center', 
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6
            }}
          >
             <Ionicons name="swap-vertical" size={16} color={Colors.bone} />
             <AppText variant="smallCaps" color={Colors.bone} size={10}>{sortOrder === "Upcoming First" ? "Upcoming" : "Latest"}</AppText>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {["All", "Pending", "Invited", "Accepted", "Completed", "Reviewed", "Rejected"]
            .filter(status => sortOrder !== "Upcoming First" || (status !== "Completed" && status !== "Rejected" && status !== "Reviewed"))
            .map(status => (
              <Pressable
                key={status}
                onPress={() => setStatusFilter(status)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 20,
                  backgroundColor: statusFilter === status ? Colors.ink : Colors.transparent,
                  borderWidth: 1,
                  borderColor: statusFilter === status ? Colors.ink : Colors.rule
                }}
              >
                <AppText variant="smallCaps" style={{ color: statusFilter === status ? Colors.bone : Colors.muted, fontSize: 10 }}>
                  {status}
                </AppText>
              </Pressable>
            ))}
        </ScrollView>
      </View>
    </View>
  );

  const listFooterNode = (
    <View style={styles.inner}>
      <Pressable style={styles.addBtn} onPress={() => {
        if (!user?.is_aligned && !user?.partner) {
          Alert.alert("Partner Required", "Please connect with your partner first to propose dates.");
          return;
        }
        setSheet("manual");
      }}>
        <AppText variant="smallCaps" color={Colors.accent}>
          + Propose manually
        </AppText>
      </Pressable>
      <View style={{ height: 80 }} />
    </View>
  );

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Sorry, we need camera roll permissions to upload photos!');
      return;
    }

    const partnerCount = selected?.photos?.length || 0; 
    const maxSelections = Math.max(1, 20 - partnerCount - photos.length);
    
    if (maxSelections <= 0) {
        Alert.alert("Limit Reached", "You have reached the maximum number of photos for this date.");
        return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: maxSelections,
      quality: 0.8,
    });

    if (!result.canceled) {
      setPhotos([...photos, ...result.assets.map(a => a.uri)]);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <AlignedNav />
      <FlatList
        data={dates}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <View style={{ paddingHorizontal: 20 }}>
            <DateCard
              entry={mapDateToEntry(item)}
              index={index}
              onPress={() => {
                setSelected(mapDateToEntry(item));
                setSheet("view");
              }}
            />
          </View>
        )}
        ListHeaderComponent={listHeaderNode}
        ListFooterComponent={listFooterNode}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      />

      {/* Date detail sheet */}
      <BottomSheet
        open={sheet === "view" && !!selected}
        onClose={() => setSheet(null)}
        kicker={`DATE · ${selected?.status.toUpperCase() ?? ""}`}
        title={selected?.venue ?? ""}
      >
        {selected && (
          <>
            <View style={styles.proposalBlock}>
              <AppText variant="smallCaps" color={Colors.accent} style={{ marginBottom: 14 }}>
                THE PROPOSAL
              </AppText>

              <AppText variant="smallCaps" color={Colors.muted} style={{ marginBottom: 6, marginTop: 10 }}>
                Venue
              </AppText>
              <AppText variant="heading" size={18} style={{ marginBottom: 4 }}>
                {selected.venue}
              </AppText>

              <AppText variant="smallCaps" color={Colors.muted} style={{ marginBottom: 6, marginTop: 10 }}>
                Date
              </AppText>
              <AppText variant="heading" size={18} style={{ marginBottom: 4 }}>
                {selected.date}
              </AppText>

              <AppText variant="smallCaps" color={Colors.muted} style={{ marginBottom: 6, marginTop: 10 }}>
                Time
              </AppText>
              <AppText variant="heading" size={18} style={{ marginBottom: 4 }}>
                {selected.exactTime}
              </AppText>

              <AppText variant="smallCaps" color={Colors.muted} style={{ marginBottom: 6, marginTop: 10 }}>
                Meet
              </AppText>
              <AppText variant="heading" size={18} style={{ marginBottom: 4 }}>
                {selected.meetType}
              </AppText>
            </View>
            
            {selected.reviews && selected.reviews.length > 0 && (
              <View style={{ marginBottom: 32, marginTop: 16 }}>
                <AppText variant="smallCaps" color={Colors.accent} style={{ marginBottom: 20, letterSpacing: 2 }}>
                  MEMORIES
                </AppText>
                {selected.reviews.map((r: any, i: number) => {
                  const isMine = r.user_id === user?.id;
                  let avatarUrl = isMine ? user?.profile_photo_url : user?.partner?.profile_photo_url;
                  if (avatarUrl && avatarUrl.startsWith('/')) {
                    avatarUrl = `${api.defaults.baseURL?.replace('/api/v1', '')}${avatarUrl}`;
                  }
                  
                  const displayName = isMine ? 'You' : (r.user_name || user?.partner?.name || 'Partner');
                  const initials = isMine ? user?.name?.[0] : displayName[0] || "?";
                  
                  return (
                    <View key={i} style={{ marginBottom: 24, backgroundColor: Colors.transparent, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: Colors.rule }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                          {avatarUrl ? (
                            <Image source={{ uri: avatarUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                          ) : (
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.rule, alignItems: 'center', justifyContent: 'center' }}>
                              <AppText variant="smallCaps" size={14} color={Colors.ink}>{initials}</AppText>
                            </View>
                          )}
                          <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <AppText variant="smallCaps" color={Colors.ink} size={14} style={{ marginBottom: 4 }}>
                                {displayName}
                              </AppText>
                              {isMine && (
                                <Pressable onPress={() => handleEditReview(r)}>
                                  <Ionicons name="pencil" size={14} color={Colors.accent} style={{ marginBottom: 4 }} />
                                </Pressable>
                              )}
                            </View>
                            <AppText color={Colors.accent} size={12} style={{ letterSpacing: 2 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</AppText>
                          </View>
                        </View>
                        {r.created_at && (
                          <AppText variant="mono" size={10} color={Colors.muted}>
                            {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </AppText>
                        )}
                      </View>
                      
                      {r.text && r.text.trim() !== "" && (
                        <AppText variant="serifItalic" size={16} color={Colors.ink2} style={{ lineHeight: 24, marginBottom: r.photos && r.photos.length > 0 ? 16 : 0 }}>
                          {r.text}
                        </AppText>
                      )}
                      
                      {r.photos && r.photos.length > 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                          {r.photos.map((photoUrl: string, pIndex: number) => {
                             const hasPendingRequest = selected.photo_delete_requests?.includes(photoUrl);
                             const fullPhotoUrl = photoUrl.startsWith('/') ? `${api.defaults.baseURL?.replace('/api/v1', '')}${photoUrl}` : photoUrl;
                             return (
                               <View key={pIndex} style={{ position: 'relative' }}>
                                 <Pressable 
                                   style={{ width: 90, height: 90, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: Colors.rule }}
                                   onPress={() => {
                                     const globalPhotos = (selected?.reviews || []).flatMap((rev: any) => rev.photos || []);
                                     setViewerInitialIndex(globalPhotos.indexOf(photoUrl));
                                     setViewerVisible(true);
                                   }}
                                 >
                                   <Image source={{ uri: fullPhotoUrl }} style={{ width: '100%', height: '100%' }} />
                                   {hasPendingRequest && (
                                      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.7)', padding: 6, alignItems: 'center' }}>
                                        <AppText size={10} color={Colors.bone}>Delete Request</AppText>
                                      </View>
                                   )}
                                 </Pressable>
                                 <Pressable 
                                   style={{ position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
                                   onPress={() => {
                                      Alert.alert(
                                        isMine ? "Delete Photo" : "Request Deletion", 
                                        isMine ? "Are you sure you want to delete this photo?" : "Ask your partner to delete this photo?",
                                        [
                                          { text: "Cancel", style: "cancel" },
                                          { text: isMine ? "Delete" : "Request", style: "destructive", onPress: async () => {
                                              try {
                                                await requestDeletePhoto(selected.id, photoUrl);
                                                Alert.alert("Success", isMine ? "Photo deleted." : "Deletion request sent.");
                                                refreshAll();
                                              } catch (e) { Alert.alert("Error", "Could not process request."); }
                                          }}
                                        ]
                                      )
                                   }}
                                 >
                                   <AppText color={Colors.bone} size={16} style={{ marginTop: -2 }}>×</AppText>
                                 </Pressable>
                               </View>
                             );
                          })}
                        </View>
                      )}
                      
                      {isMine && selected.photo_delete_requests && r.photos?.some((p: string) => selected.photo_delete_requests?.includes(p)) && (
                         <View style={{ marginTop: 16, paddingLeft: 58, gap: 8 }}>
                           {r.photos.filter((p: string) => selected.photo_delete_requests?.includes(p)).map((reqPhoto: string, reqIdx: number) => (
                             <View key={reqIdx} style={{ backgroundColor: Colors.transparent, borderWidth: 1, borderColor: Colors.accent, borderRadius: 16, padding: 16 }}>
                               <AppText variant="smallCaps" color={Colors.accent} style={{ marginBottom: 14 }}>Partner requested to delete a photo</AppText>
                               <View style={{ flexDirection: 'row', gap: 12 }}>
                                 <AppButton variant="accent" size="sm" style={{ flex: 1 }} onPress={async () => {
                                    try {
                                      await approveDeletePhoto(selected.id, reqPhoto);
                                      refreshAll();
                                    } catch(e) { Alert.alert("Error"); }
                                 }}>Approve</AppButton>
                                 <AppButton variant="outline" size="sm" style={{ flex: 1 }} onPress={async () => {
                                    try {
                                      await rejectDeletePhoto(selected.id, reqPhoto);
                                      refreshAll();
                                    } catch(e) { Alert.alert("Error"); }
                                 }}>Reject</AppButton>
                               </View>
                             </View>
                           ))}
                         </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
            
            <View>
              <View style={styles.sheetActions}>
                {selected.status === "proposed" && selected.proposed_by === user?.id && (
                  <View style={{ alignItems: 'center', width: '100%' }}>
                    <AppText variant="serifItalic" color={Colors.muted} style={{ marginBottom: 15 }}>
                      Waiting for partner's response...
                    </AppText>
                    <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                      <AppButton variant="outline" size="lg" style={{ flex: 1 }} onPress={() => openReschedule()}>
                        Reschedule
                      </AppButton>
                      <AppButton variant="outline" size="lg" style={{ flex: 1 }} onPress={() => handleRespond("reject")}>
                        Cancel
                      </AppButton>
                    </View>
                  </View>
                )}
                {selected.status === "proposed" && selected.proposed_by !== user?.id && (
                  <>
                    <AppButton variant="accent" size="lg" style={{ flex: 1 }} onPress={() => handleRespond("accept")}>
                      Accept →
                    </AppButton>
                    <AppButton variant="outline" size="lg" style={{ flex: 1 }} onPress={() => handleRespond("reject")}>
                      Pass
                    </AppButton>
                    <AppButton variant="outline" size="lg" style={{ flex: 1 }} onPress={() => openReschedule()}>
                      Edit
                    </AppButton>
                  </>
                )}
                {selected.status === "cancelrequested" && (
                  <View style={{ width: '100%' }}>
                    <AppText variant="serifItalic" color={Colors.muted} style={{ marginBottom: 15, textAlign: 'center' }}>
                      Partner requested to cancel this date.
                    </AppText>
                    <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                      <AppButton variant="accent" size="lg" style={{ flex: 1 }} onPress={() => handleRespond("accept")}>
                        Accept Cancellation
                      </AppButton>
                      <AppButton variant="outline" size="lg" style={{ flex: 1 }} onPress={() => handleRespond("reject")}>
                        Keep Date
                      </AppButton>
                    </View>
                  </View>
                )}
              </View>
              
              {selected.status === "accepted" && !selected.completed_by?.includes(user?.id) && (
                <>
                  <View style={styles.proposalBlock}>
                    <AppText variant="smallCaps" color={Colors.accent} style={{ marginBottom: 14 }}>
                      PLANS CHANGE
                    </AppText>
                    <View style={styles.gridContainer}>
                      <Pressable style={styles.gridItem} onPress={() => setPingSheet(true)}>
                        <AppText variant="smallCaps">◐ Running late</AppText>
                      </Pressable>
                      <Pressable style={styles.gridItem} onPress={() => setCancelSheet(true)}>
                        <AppText variant="smallCaps">◇ Cancel</AppText>
                      </Pressable>
                    </View>
                  </View>
                  <AppButton full variant="solid" size="lg" onPress={() => { setStars(0); setMemory(""); setPhotos([]); setIsEditing(false); setExistingPhotos([]); setSheet("rate"); }}>
                    Rate this date ★
                  </AppButton>
                </>
              )}
              {selected.status === "accepted" && selected.completed_by?.includes(user?.id) && (
                 <AppText variant="smallCaps" color={Colors.muted} style={{ marginTop: 20, textAlign: "center" }}>
                   Waiting for partner to complete...
                 </AppText>
              )}
              
              {(selected.status === "completed" || selected.status === "cancelled" || selected.status === "rejected") && (
                <AppButton 
                  full 
                  variant="outline" 
                  size="lg" 
                  style={{ marginTop: 20 }} 
                  loading={isRemoving}
                  onPress={() => {
                    Alert.alert(
                      "Remove Date",
                      "Are you sure you want to remove this date from your list?",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Yes", style: "destructive", onPress: async () => {
                            if (isRemoving) return;
                            setIsRemoving(true);
                            try {
                              await deleteDate(selected.id);
                              setSheet(null);
                              refreshAll();
                            } catch(e) {
                              Alert.alert("Error", "Could not remove date.");
                            } finally {
                              setIsRemoving(false);
                            }
                        }}
                      ]
                    );
                  }}
                >
                  Remove from list
                </AppButton>
              )}
            </View>
          </>
        )}
      </BottomSheet>

      {/* Rate sheet */}
      <BottomSheet open={sheet === "rate"} onClose={() => setSheet(null)} kicker="RATE" title="How was it?">
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((s) => (
            <Pressable key={s} onPress={() => setStars(s)}>
              <AppText size={36} color={s <= stars ? Colors.accent : Colors.rule}>
                {s <= stars ? "★" : "☆"}
              </AppText>
            </Pressable>
          ))}
        </View>
        <AppTextInput label="Memory note" n="01" value={memory} onChangeText={setMemory} placeholder="One sentence that captures it..." multiline />
        
        <AppText variant="smallCaps" color={Colors.ink2} style={{ marginTop: 20, marginBottom: 10 }}>02 PHOTOS</AppText>
        <View style={{ marginBottom: 30 }}>
          <ScrollView 
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            {[...existingPhotos.map(p => ({ uri: p, isExisting: true })), ...photos.map(p => ({ uri: p, isExisting: false })), { uri: 'ADD_BUTTON', isExisting: false }].map((item, idx) => {
              if (item.uri === 'ADD_BUTTON') {
                return (
                  <TouchableOpacity 
                    key="add_btn"
                    style={{ width: 80, height: 80, backgroundColor: Colors.transparent, borderWidth: 1, borderColor: Colors.rule, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}
                    onPress={pickImages}
                  >
                    <Ionicons name="camera-outline" size={32} color={Colors.muted} />
                  </TouchableOpacity>
                );
              }
              const displayUri = item.isExisting && item.uri.startsWith('/') ? `${api.defaults.baseURL?.replace('/api/v1', '')}${item.uri}` : item.uri;
              return (
                <View key={item.uri + idx} style={{ width: 80, height: 80, borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
                  <Image source={{ uri: displayUri }} style={{ width: '100%', height: '100%' }} />
                  <Pressable 
                    style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => {
                      if (item.isExisting) {
                        setExistingPhotos(prev => prev.filter(p => p !== item.uri));
                      } else {
                        setPhotos(prev => prev.filter(p => p !== item.uri));
                      }
                    }}
                  >
                    <AppText color={Colors.bone} size={12} style={{ marginTop: -2 }}>×</AppText>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </View>

        <AppButton full variant="solid" size="lg" onPress={handleSaveMemory} disabled={isSavingMemory}>
          {isSavingMemory ? "Saving..." : "Save memory →"}
        </AppButton>
      </BottomSheet>

      {/* Generator sheet */}
      <BottomSheet open={generatorSheet} onClose={() => setGeneratorSheet(false)} kicker="DATE GENERATOR" title="Generate a Date">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
          {/* 01 CITY */}
          <AppTextInput
            label="CITY"
            n="01"
            value={city}
            onChangeText={setCity}
            placeholder="Los Angeles"
          />

          {/* 02 MOOD */}
          <AppText variant="smallCaps" color={Colors.ink2} style={{ marginTop: 20, marginBottom: 10 }}>
            02 MOOD
          </AppText>
          <View style={styles.chipRow}>
            {moods.map((m) => (
              <Pressable
                key={m}
                style={[styles.chip, mood === m && styles.chipSelected]}
                onPress={() => setMood(m)}
              >
                <AppText variant="smallCaps" style={{ color: mood === m ? "#fff" : Colors.muted, fontSize: 10 }}>{m}</AppText>
              </Pressable>
            ))}
          </View>

          {/* 03 VIBE */}
          <AppText variant="smallCaps" color={Colors.ink2} style={{ marginTop: 20, marginBottom: 10 }}>
            03 VIBE
          </AppText>
          <View style={styles.chipRow}>
            {vibes.map((v) => (
              <Pressable
                key={v}
                style={[styles.chip, vibe === v && styles.chipSelected]}
                onPress={() => setVibe(v)}
              >
                <AppText variant="smallCaps" style={{ color: vibe === v ? "#fff" : Colors.muted, fontSize: 10 }}>{v}</AppText>
              </Pressable>
            ))}
          </View>

          {/* 04 DATE & TIME */}
          <AppText variant="smallCaps" color={Colors.ink2} style={{ marginTop: 20, marginBottom: 10 }}>
            04 DATE & TIME
          </AppText>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable style={[styles.timeRow, { flex: 1 }]} onPress={() => setShowDatePicker(true)}>
              <AppText variant="display" size={20}>
                {exactDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </AppText>
              <Ionicons name="calendar-outline" size={26} color="#000" />
            </Pressable>

            <Pressable style={styles.timeRow} onPress={() => setShowTimePicker(true)}>
              <AppText variant="display" size={20}>
                {formatTime(exactTime)}
              </AppText>
              <Ionicons name="time-outline" size={26} color="#000" />
            </Pressable>
          </View>
          {showDatePicker && (
            <DateTimePicker value={exactDate} mode="date" display="default" onChange={handleDateChange} />
          )}
          {showTimePicker && (
            <DateTimePicker value={exactTime} mode="time" display="default" onChange={handleTimeChange} />
          )}

          {/* 05 HOW WE MEET */}
          <AppText variant="mono" color={Colors.ink2} style={{ marginTop: 20, marginBottom: 10 }}>
            05 HOW WE MEET
          </AppText>
          <View style={styles.meetOptions}>
            {[
              { label: "Meet at the location", value: "location" },
              { label: "I'll pick you up", value: "pickup" },
              { label: "Pick me up", value: "pickedup" },
            ].map((option) => (
              <Pressable
                key={option.value}
                style={[styles.meetOption, meetType === option.value && styles.meetSelected]}
                onPress={() => setMeetType(option.value as any)}
              >
                <AppText style={{ color: meetType === option.value ? "#fff" : Colors.ink }}>
                  {option.label}
                </AppText>
                <View style={[styles.radio, meetType === option.value && styles.radioSelected]} />
              </Pressable>
            ))}
          </View>

          {/* GENERATE BUTTON */}
          <AppButton variant="solid" full size="lg" style={styles.generateBtn} onPress={generateDate} disabled={isGenerating}>
            {isGenerating ? "Generating..." : "♦ GENERATE DATE"}
          </AppButton>
        </ScrollView>
      </BottomSheet>

      {/* Manual propose */}
      <BottomSheet open={sheet === "manual"} onClose={() => setSheet(null)} kicker="NEW" title="Propose a date">
        <AppTextInput label="Title" n="01" placeholder="Sunset Rooftop Night" value={manualTitle} onChangeText={setManualTitle} />
        <AppTextInput label="Location" n="02" placeholder="Venue or neighborhood" value={manualLocation} onChangeText={setManualLocation} />
        <AppTextInput label="Description" n="03" placeholder="What's the plan?" value={manualDesc} onChangeText={setManualDesc} multiline />
        
        {/* 04 DATE & TIME */}
        <AppText variant="smallCaps" color={Colors.ink2} style={{ marginTop: 10, marginBottom: 10 }}>
          04 DATE & TIME
        </AppText>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <Pressable style={[styles.timeRow, { flex: 1 }]} onPress={() => setShowManualDatePicker(true)}>
            <AppText variant="display" size={20}>
              {manualDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </AppText>
            <Ionicons name="calendar-outline" size={26} color="#000" />
          </Pressable>

          <Pressable style={styles.timeRow} onPress={() => setShowManualTimePicker(true)}>
            <AppText variant="display" size={20}>
              {formatTime(manualTime)}
            </AppText>
            <Ionicons name="time-outline" size={26} color="#000" />
          </Pressable>
        </View>
        {showManualDatePicker && (
          <DateTimePicker value={manualDate} mode="date" display="default" onChange={handleManualDateChange} />
        )}
        {showManualTimePicker && (
          <DateTimePicker value={manualTime} mode="time" display="default" onChange={handleManualTimeChange} />
        )}

        {/* 05 HOW WE MEET */}
        <AppText variant="mono" color={Colors.ink2} style={{ marginTop: 10, marginBottom: 10 }}>
          05 HOW WE MEET
        </AppText>
        <View style={[styles.meetOptions, { marginBottom: 24 }]}>
          {[
            { label: "Meet at the location", value: "location" },
            { label: "I'll pick you up", value: "pickup" },
            { label: "Pick me up", value: "pickedup" },
          ].map((option) => (
            <Pressable
              key={option.value}
              style={[styles.meetOption, manualMeetType === option.value && styles.meetSelected]}
              onPress={() => setManualMeetType(option.value as any)}
            >
              <AppText style={{ color: manualMeetType === option.value ? "#fff" : Colors.ink }}>
                {option.label}
              </AppText>
              <View style={[styles.radio, manualMeetType === option.value && styles.radioSelected]} />
            </Pressable>
          ))}
        </View>

        <AppButton full variant="solid" size="lg" onPress={manualPropose} disabled={isManualSubmitting}>
          {isManualSubmitting ? "Proposing..." : "Propose →"}
        </AppButton>
      </BottomSheet>
      
      {/* Reschedule sheet */}
      <BottomSheet open={sheet === "reschedule"} onClose={() => setSheet(null)} kicker="RESCHEDULE" title="Suggest a new plan">
        <AppTextInput label="Location" n="01" placeholder="Venue or neighborhood" value={rescheduleVenue} onChangeText={setRescheduleVenue} />
        <AppText variant="smallCaps" color={Colors.ink2} style={{ marginTop: 20, marginBottom: 10 }}>02 NEW DATE & TIME</AppText>
        <Pressable style={styles.timeRow} onPress={() => {
          setReschedulePickerMode("date");
          setShowReschedulePicker(true);
        }}>
          <AppText variant="display" size={20}>
            {rescheduleDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at {formatTime(rescheduleDate)}
          </AppText>
          <Ionicons name="calendar-outline" size={26} color="#000" />
        </Pressable>
        {showReschedulePicker && (
          <DateTimePicker 
            value={rescheduleDate} 
            mode={Platform.OS === "ios" ? "datetime" : reschedulePickerMode} 
            onChange={(event, date) => {
              if (Platform.OS === "android") {
                if (event.type === "set" && date) {
                  setRescheduleDate(date);
                  if (reschedulePickerMode === "date") {
                    setReschedulePickerMode("time");
                  } else {
                    setShowReschedulePicker(false);
                    setReschedulePickerMode("date");
                  }
                } else {
                  setShowReschedulePicker(false);
                  setReschedulePickerMode("date");
                }
              } else {
                setShowReschedulePicker(false);
                if (date) setRescheduleDate(date);
              }
            }} 
          />
        )}
        <AppButton full variant="solid" size="lg" style={{ marginTop: 30 }} onPress={submitReschedule}>
          Send Proposal →
        </AppButton>
      </BottomSheet>
      
      <BottomSheet open={pingSheet} onClose={() => setPingSheet(false)} kicker="RUNNING LATE" title="Ping Amanda">
        <View>
          <AppText variant="serifItalic" size={15} color={Colors.muted} style={{ marginBottom: 20 }}>
            A quick heads-up. They'll get it as a notification.
          </AppText>
          <AppText variant="smallCaps" color={Colors.ink2} style={{ marginBottom: 12 }}>01 HOW LATE</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 30 }}>
            {["5 MIN", "10 MIN", "15 MIN", "30 MIN", "45 MIN", "60 MIN"].map((time) => (
              <Pressable
                key={time}
                style={[styles.delayChip, selectedDelay === time && styles.delayChipActive]}
                onPress={() => setSelectedDelay(time)}
              >
                <AppText variant="smallCaps" style={{ color: selectedDelay === time ? "#fff" : "#000" }}>{time}</AppText>
              </Pressable>
            ))}
          </View>
          <AppTextInput label="A note (optional)" n="01" multiline placeholder="Stuck at work — leaving soon" value={pingNote} onChangeText={setPingNote} style={{ minHeight: 80 }} />
          <AppButton full variant="solid" size="lg" style={{ marginTop: 30, backgroundColor: "#1C1C1E" }} onPress={async () => {
            if (selected) {
              await pingDate(selected.id, { delay: selectedDelay, note: pingNote });
              setPingSheet(false);
              refreshAll();
            }
          }}>
            SEND PING →
          </AppButton>
        </View>
      </BottomSheet>
      
      <BottomSheet open={cancelSheet} onClose={() => setCancelSheet(false)} kicker="CANCELLING" title="Change of plans">
        <View>
          <AppText variant="serifItalic" size={15} color={Colors.muted} style={{ marginBottom: 20 }}>
            Short, honest, kind. A few words go a long way.
          </AppText>
          <AppTextInput label="A brief reason" n="01" multiline placeholder="Something came up at work — let's try again this weekend" value={cancelReason} onChangeText={setCancelReason} style={{ minHeight: 120 }} />
          <AppButton full variant="solid" size="lg" style={{ marginTop: 30, backgroundColor: "#1C1C1E" }} onPress={async () => {
            if (selected) {
              await requestCancelDate(selected.id, cancelReason);
              setCancelSheet(false);
              refreshAll();
            }
          }}>
            SEND AND CANCEL →
          </AppButton>
        </View>
      </BottomSheet>

      {/* Full screen Image Viewer */}
      <Modal visible={viewerVisible} transparent={true} animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 }}>
              <Pressable onPress={() => setViewerVisible(false)}>
                <Ionicons name="close" size={32} color="#fff" />
              </Pressable>
              
              <View style={{ flexDirection: 'row', gap: 20 }}>
                {selected?.reviews && (() => {
                  const globalPhotos = selected.reviews.flatMap((rev: any) => rev.photos || []);
                  const currentPhotoUrl = globalPhotos[viewerInitialIndex];
                  if (!currentPhotoUrl) return null;
                  
                  return (
                    <>
                      <Pressable onPress={async () => {
                        try {
                          const fullUrl = currentPhotoUrl.startsWith('/') ? `${api.defaults.baseURL?.replace('/api/v1', '')}${currentPhotoUrl}` : currentPhotoUrl;
                          const filename = currentPhotoUrl.split('/').pop() || 'download.jpg';
                          const file = new File(Paths.document, filename);
                          const downloadedFile = await File.downloadFileAsync(fullUrl, file);
                          if (await Sharing.isAvailableAsync()) {
                            await Sharing.shareAsync(downloadedFile.uri);
                          } else {
                            Alert.alert("Error", "Sharing is not available on this device");
                          }
                        } catch(e) {
                          Alert.alert("Error", "Could not download photo.");
                        }
                      }}>
                        <Ionicons name="download-outline" size={28} color="#fff" />
                      </Pressable>
                      
                      <Pressable onPress={async () => {
                        try {
                          await requestDeletePhoto(selected.id, currentPhotoUrl);
                          Alert.alert("Request Sent", "Deletion request sent to partner (or deleted if it was yours).");
                          setViewerVisible(false);
                          refreshAll();
                        } catch(e) {
                          Alert.alert("Error", "Could not delete photo.");
                        }
                      }}>
                        <Ionicons name="trash-outline" size={28} color="#ff4444" />
                      </Pressable>
                    </>
                  );
                })()}
              </View>
            </View>
            {selected?.reviews && (() => {
              const globalPhotos = selected.reviews.flatMap((rev: any) => rev.photos || []);
              return (
                <FlatList
                  data={globalPhotos}
                  keyExtractor={(item, index) => item + index}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  initialScrollIndex={viewerInitialIndex > -1 && viewerInitialIndex < globalPhotos.length ? viewerInitialIndex : 0}
                  getItemLayout={(_, index) => ({ length: windowWidth, offset: windowWidth * index, index })}
                  onMomentumScrollEnd={(e) => {
                    const index = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
                    setViewerInitialIndex(index);
                  }}
                  renderItem={({ item }) => {
                    const fullUrl = item.startsWith('/') ? `${api.defaults.baseURL?.replace('/api/v1', '')}${item}` : item;
                    return (
                      <View style={{ width: windowWidth, height: windowHeight - 150, justifyContent: 'center', alignItems: 'center' }}>
                        <Image source={{ uri: fullUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                      </View>
                    );
                  }}
                />
              );
            })()}
          </SafeAreaView>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bone },
  inner: { padding: 24 },
  generatorCard: { borderRadius: 14, borderWidth: 1, borderColor: Colors.rule, overflow: "hidden", backgroundColor: Colors.bone, marginBottom: 28 },
  genHeader: { padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.rule, backgroundColor: Colors.cream },
  gridContainer: { flexDirection: "row", gap: 12, marginVertical: 8 },
  gridItem: { flex: 1, borderWidth: 1, borderColor: "black", borderRadius: 8, paddingVertical: 9, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: Colors.rule },
  chipSelected: { backgroundColor: "#1C1C1E", borderColor: "#1C1C1E" },
  timeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderColor: Colors.rule },
  meetOptions: { gap: 8 },
  meetOption: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 10, backgroundColor: "#EAE2D4", borderRadius: 12 },
  meetSelected: { backgroundColor: "#1C1C1E" },
  radio: { width: 6, height: 6, borderRadius: 10, borderWidth: 1, borderColor: Colors.rule },
  radioSelected: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  generateBtn: { backgroundColor: Colors.accent, marginTop: 28 },
  addBtn: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.rule, marginTop: 4 },
  proposalBlock: { padding: 18, borderRadius: 14, backgroundColor: Colors.cream, marginBottom: 22, borderWidth: 1, borderColor: Colors.rule },
  sheetActions: { flexDirection: "row", gap: 10 },
  starsRow: { flexDirection: "row", justifyContent: "center", gap: 10, paddingVertical: 20, marginBottom: 20 },
  delayChip: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 8, backgroundColor: "#EAE2D4" },
  delayChipActive: { backgroundColor: "#1C1C1E", borderColor: "#1C1C1E" }
});
