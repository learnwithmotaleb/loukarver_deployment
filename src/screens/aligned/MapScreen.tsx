import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef } from "react";
import { View, ScrollView, StyleSheet, Pressable, ActivityIndicator, RefreshControl, Image, Platform, TextInput, Keyboard } from 'react-native';
import axios from 'axios';
import { Colors } from "../../constants/colors";
import { AppText } from "../../components/ui/AppText";
import { AppButton } from "../../components/ui/AppButton";
import { Tag } from "../../components/ui/Tag";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { PinCard } from "../../components/map/PinCard";
import { InteractiveLeafletMap } from "../../components/map/InteractiveLeafletMap";
import { MapPin, PinType } from "../../types";
import { AppTextInput } from "@/components/ui/AppTextInput";
import AlignedNav from "@/components/ui/AlignedNav";
import { DeviceEventEmitter } from "react-native";
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from "@expo/vector-icons";
import { AppDateTimePickerModal } from "../../components/ui/AppDateTimePickerModal";
import { getMapOverview, createPlace, updatePlace, deletePlace, requestDeletePlace, approveDeletePlace, rejectDeletePlace, addMoment } from "../../services/mapApi";
import { triggerNotification } from "../../services/notificationApi";
import { getUserProfile } from "../../services/userApi";
import { CustomAlert } from "../../components/ui/CustomAlert";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { Modal, useWindowDimensions } from "react-native";
import * as Location from 'expo-location';
import Svg, { Polygon } from 'react-native-svg';

const FilterIcon = ({ color = Colors.ink, size = 15 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </Svg>
);

interface UIMapPin extends MapPin {
  creator_name?: string;
  moments?: any[];
  deletion_request?: {
    requested_by: string;
    requested_by_name: string;
    created_at: string;
  };
}

const TYPE_FILTERS = ["all", "home", "together", "upcoming", "bucket"] as const;
const PIN_META = {
  home: { label: "Home", color: Colors.muted },
  together: { label: "Together", color: Colors.accent },
  upcoming: { label: "Upcoming", color: Colors.sage },
  bucket: { label: "Bucket", color: Colors.light },
};

const PIN_COLORS: Record<string, string> = {
  home: '#8B7355',
  together: '#C05640',
  upcoming: '#6E8B74',
  bucket: '#A89E8D',
};

const categoryOptions = [
  { label: "Home", value: "home" as PinType },
  { label: "Together", value: "together" as PinType },
  { label: "Upcoming", value: "upcoming" as PinType },
  { label: "Bucket", value: "bucket" as PinType },
] as const;

function parseDateString(str: string): Date | null {
  if (!str) return null;
  if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length === 3) {
      const month = parseInt(parts[0], 10) - 1;
      const day = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
        return new Date(year, month, day);
      }
    }
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export const MapScreen: React.FC = () => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [places, setPlaces] = useState<UIMapPin[]>([]);
  const [stats, setStats] = useState({
    total_countries: 0,
    total_cities: 0,
    together_count: 0,
    bucket_count: 0,
    upcoming_count: 0,
    home_count: 0,
  });
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [filter, setFilter] = useState<string>("all");
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [selected, setSelected] = useState<UIMapPin | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [meetType, setMeetType] = useState<PinType>("together");

  // Super-Fast Map Search State
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [mapSearchResults, setMapSearchResults] = useState<Array<{
    id?: string;
    title: string;
    subtitle: string;
    city: string;
    country: string;
    lat: number;
    lng: number;
    isSaved: boolean;
    savedPin?: UIMapPin;
  }>>([]);
  const [isSearchingMap, setIsSearchingMap] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchedLocation, setSearchedLocation] = useState<{
    city: string;
    country: string;
    lat: number;
    lng: number;
  } | null>(null);
  const mapSearchTimerRef = useRef<any>(null);

  // Live Location & Compass State
  const [userLiveLocation, setUserLiveLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [compassTrigger, setCompassTrigger] = useState(0);

  // User Identification
  const [currentUserId, setCurrentUserId] = useState<string>("");

  // Loading states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [confirmDeletePlace, setConfirmDeletePlace] = useState(false);

  // New place inputs
  const [newCity, setNewCity] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newPlaceCoords, setNewPlaceCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [clearTempPinTrigger, setClearTempPinTrigger] = useState(0);
  const [visitDateObj, setVisitDateObj] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Autocomplete suggestions
  const [suggestions, setSuggestions] = useState<Array<{ place_name: string; city: string; country: string; lat: number; lng: number }>>([]);
  const [isSearchingCity, setIsSearchingCity] = useState(false);
  const searchTimerRef = useRef<any>(null);

  // Edit place inputs
  const [editCity, setEditCity] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editCategory, setEditCategory] = useState<PinType>("together");
  const [editDateObj, setEditDateObj] = useState<Date>(new Date());
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);

  // New moment inputs
  const [momentType, setMomentType] = useState<'Note' | 'Photo'>('Note');
  const [momentContent, setMomentContent] = useState("");
  const [momentCaption, setMomentCaption] = useState("");
  const [momentPhoto, setMomentPhoto] = useState<any>(null);

  const [isImageViewVisible, setIsImageViewVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8002';
  const maptilerApiKey = process.env.EXPO_PUBLIC_MAPTILER_API_KEY || '';

  const mapBackendPlaceToPin = (p: any): UIMapPin => ({
    id: p.id,
    city: p.city,
    country: p.country,
    lat: p.lat,
    lng: p.lng,
    type: p.category.toLowerCase() as PinType,
    owner: p.creator_id,
    note: p.description || '',
    dates: p.visit_date || '',
    moments: p.moments || [],
    creator_name: p.creator_name,
    deletion_request: p.deletion_request,
  });

  const loadMapData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const data = await getMapOverview();
      if (data) {
        const mappedPlaces = (data.places || []).map(mapBackendPlaceToPin);
        setPlaces(mappedPlaces);
        if (data.stats) {
          setStats(data.stats);
        }
        if (data.routes) {
          setRoutes(data.routes);
        }
      }
    } catch (err: any) {
      console.error("Error loading map data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMapData();
    getUserProfile().then((res) => {
      if (res && res.success && res.data) {
        setCurrentUserId(res.data.id || res.data._id || "");
      }
    }).catch(err => console.error("Error fetching user profile:", err));

    const sub1 = DeviceEventEmitter.addListener('REFRESH_MAP_DATA', () => {
      loadMapData(false);
    });
    let lastRefreshTime = 0;
    const sub2 = DeviceEventEmitter.addListener('REFRESH_ALIGNED_DATA', () => {
      const now = Date.now();
      if (now - lastRefreshTime > 10000) {
        lastRefreshTime = now;
        loadMapData(false);
      }
    });
    return () => {
      sub1.remove();
      sub2.remove();
    };
  }, []);

  const formatDateForPayload = (d: Date) => {
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${month}.${day}.${year}`;
  };

  // Super-Fast Live Map Search Handler
  const handleMapSearchChange = (text: string) => {
    setMapSearchQuery(text);
    if (mapSearchTimerRef.current) clearTimeout(mapSearchTimerRef.current);

    if (!text.trim()) {
      setMapSearchResults([]);
      setIsSearchingMap(false);
      return;
    }

    const q = text.trim().toLowerCase();

    // 1. Instant (<1ms) search in couple's saved places
    const localMatches = places.filter(p =>
      p.city.toLowerCase().includes(q) ||
      p.country.toLowerCase().includes(q) ||
      (p.note && p.note.toLowerCase().includes(q))
    ).slice(0, 3).map(p => ({
      id: String(p.id),
      title: p.city,
      subtitle: `${p.country} · Saved (${PIN_META[p.type]?.label || p.type})`,
      city: p.city,
      country: p.country,
      lat: p.lat,
      lng: p.lng,
      isSaved: true,
      savedPin: p,
    }));

    setMapSearchResults(localMatches);

    if (text.trim().length < 2) return;

    // 2. High-speed (180ms debounce) MapTiler worldwide geocoding
    mapSearchTimerRef.current = setTimeout(() => {
      (async () => {
      try {
        setIsSearchingMap(true);
        const res = await axios.get(
          `https://api.maptiler.com/geocoding/${encodeURIComponent(text.trim())}.json`,
          {
            params: {
              key: maptilerApiKey,
              limit: 5,
              types: 'municipality,place,region,country'
            },
            timeout: 3000
          }
        );

        if (res.data?.features) {
          const remoteResults = res.data.features.map((f: any) => {
            const coords = f.geometry?.coordinates || [0, 0];
            let ctry = '';
            if (f.context) {
              const cItem = f.context.find((c: any) => c.id?.startsWith('country'));
              if (cItem) ctry = cItem.text || '';
            }
            const mainText = f.text || f.place_name?.split(',')[0] || '';
            return {
              id: f.id,
              title: mainText,
              subtitle: f.place_name || ctry,
              city: mainText,
              country: ctry || mainText,
              lat: coords[1],
              lng: coords[0],
              isSaved: false,
            };
          });

          // Combine saved places + worldwide results without duplicates
          const combined = [...localMatches];
          remoteResults.forEach((r: any) => {
            if (!combined.some(c => c.city.toLowerCase() === r.city.toLowerCase())) {
              combined.push(r);
            }
          });
          setMapSearchResults(combined);
        }
      } catch (err) {
        // Silently catch geocode errors
      } finally {
        setIsSearchingMap(false);
      }
      })();
    }, 180);
  };

  const handleSelectSearchResult = (item: any) => {
    Keyboard.dismiss();
    setIsSearchFocused(false);
    setMapSearchQuery(item.title);
    setMapSearchResults([]);

    if (item.isSaved && item.savedPin) {
      setSelected(item.savedPin);
      setSheet(null);
      setSearchedLocation(null);
    } else {
      setSearchedLocation({
        city: item.city,
        country: item.country,
        lat: item.lat,
        lng: item.lng,
      });
    }
  };

  // Live GPS Location Handler
  const handleGetLiveLocation = async () => {
    if (isLocating) return;
    setIsLocating(true);
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      let status = perm.status;
      if (status !== 'granted') {
        if (perm.canAskAgain) {
          const req = await Location.requestForegroundPermissionsAsync();
          status = req.status;
        }
      }
      if (status !== 'granted') {
        CustomAlert.alert("Permission Required", "Please allow location access to view your live location on the map.");
        setIsLocating(false);
        return;
      }

      // 1. Instant check with last known location for super-fast feedback
      const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null);
      if (lastKnown?.coords) {
        setUserLiveLocation({
          lat: lastKnown.coords.latitude,
          lng: lastKnown.coords.longitude,
        });
      }

      // 2. Fetch fresh high-accuracy position with safe 6s timeout
      const fresh = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
      ]);

      if (fresh?.coords) {
        setUserLiveLocation({
          lat: fresh.coords.latitude,
          lng: fresh.coords.longitude,
        });
      }
    } catch (err) {
      console.log("Error getting live location:", err);
      CustomAlert.alert("Location Error", "Could not fetch current location. Please check your GPS settings.");
    } finally {
      setIsLocating(false);
    }
  };

  // Compass Reset Handler
  const handleResetCompass = () => {
    setCompassTrigger(prev => prev + 1);
  };

  // City Search / Autocomplete
  const handleCityQueryChange = (text: string) => {
    setNewCity(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!text.trim() || text.length < 2) {
      setSuggestions([]);
      return;
    }

    searchTimerRef.current = setTimeout(() => {
      (async () => {
      try {
        setIsSearchingCity(true);
        const res = await axios.get(
          `https://api.maptiler.com/geocoding/${encodeURIComponent(text.trim())}.json`,
          { params: { key: maptilerApiKey, limit: 4, types: 'municipality,place,country' }, timeout: 3000 }
        );
        if (res.data?.features) {
          const mapped = res.data.features.map((f: any) => {
            const coords = f.geometry?.coordinates || [0, 0];
            let ctry = '';
            if (f.context) {
              const cItem = f.context.find((c: any) => c.id?.startsWith('country'));
              if (cItem) ctry = cItem.text || '';
            }
            return {
              place_name: f.place_name || f.text,
              city: f.text || '',
              country: ctry,
              lat: coords[1],
              lng: coords[0]
            };
          });
          setSuggestions(mapped);
        }
      } catch (e) {
        // Silently ignore autocomplete errors
      } finally {
        setIsSearchingCity(false);
      }
      })();
    }, 250);
  };

  // Long-press on Map -> Auto-reverse geocode and open modal
  const handleMapLongPress = async ({ lat, lng }: { lat: number; lng: number }) => {
    setNewPlaceCoords({ lat, lng });
    setNewCity("Detecting location...");
    setNewCountry("Detecting...");
    setIsReverseGeocoding(true);
    setSuggestions([]);
    setSheet("new");

    try {
      let detectedCity = "";
      let detectedCountry = "";

      // 1. Primary: MapTiler Reverse Geocoding
      if (maptilerApiKey && lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
        try {
          const res = await axios.get(
            `https://api.maptiler.com/geocoding/${lng},${lat}.json`,
            { params: { key: maptilerApiKey }, timeout: 4000 }
          );
          const features = res.data?.features || [];
          if (features.length > 0) {
            const cityFeature = features.find((f: any) =>
              f.place_type?.some((t: string) => ['municipality', 'joint_municipality', 'place', 'locality', 'subregion', 'city', 'town'].includes(t))
            ) || features[0];

            detectedCity = cityFeature.text || cityFeature.place_name?.split(',')[0] || '';

            if (cityFeature.context) {
              const cItem = cityFeature.context.find((c: any) => c.id?.startsWith('country'));
              if (cItem) detectedCountry = cItem.text || '';
            }
            if (!detectedCountry) {
              const countryFeature = features.find((f: any) => f.place_type?.includes('country'));
              if (countryFeature) detectedCountry = countryFeature.text || '';
            }
          }
        } catch (e) {
          console.log("MapTiler reverse geocode error:", e);
        }
      }

      // 2. Fallback: OpenStreetMap Nominatim Reverse Geocoding
      if (!detectedCity || !detectedCountry) {
        try {
          const res = await axios.get(
            `https://nominatim.openstreetmap.org/reverse`,
            {
              params: { lat, lon: lng, format: 'json', zoom: 10 },
              headers: { 'User-Agent': 'AlignedTracker/1.0' },
              timeout: 3500
            }
          );
          if (res.data?.address) {
            const addr = res.data.address;
            if (!detectedCity) {
              detectedCity = addr.city || addr.town || addr.village || addr.municipality || addr.county || addr.state || '';
            }
            if (!detectedCountry) {
              detectedCountry = addr.country || '';
            }
          }
        } catch (e) {
          console.log("Nominatim reverse geocode error:", e);
        }
      }

      setNewCity(detectedCity || `Pin (${lat.toFixed(2)}°, ${lng.toFixed(2)}°)`);
      setNewCountry(detectedCountry || '');
    } catch (err) {
      console.log("Error in reverse geocoding:", err);
      setNewCity(`Pin (${lat.toFixed(2)}°, ${lng.toFixed(2)}°)`);
      setNewCountry("");
    } finally {
      setIsReverseGeocoding(false);
    }
  };

  const handleCreatePlace = async () => {
    if (!newCity.trim() || !newCountry.trim()) {
      CustomAlert.alert("Input required", "Please enter both City and Country.");
      return;
    }

    setIsSubmitting(true);
    try {
      const categoryPayload = (meetType.charAt(0).toUpperCase() + meetType.slice(1)) as any;
      const formattedDate = (meetType === 'together' || meetType === 'upcoming')
        ? formatDateForPayload(visitDateObj)
        : undefined;

      await createPlace({
        city: newCity.trim(),
        country: newCountry.trim(),
        category: categoryPayload,
        description: newNote.trim(),
        visit_date: formattedDate,
        timezone: 'Asia/Dhaka',
        lat: newPlaceCoords?.lat,
        lng: newPlaceCoords?.lng,
      });
      triggerNotification("Map Create", `Added ${newCity} to the map`).catch(() => {});

      // Clear inputs
      setNewCity("");
      setNewCountry("");
      setNewNote("");
      setNewPlaceCoords(null);
      setSuggestions([]);
      setVisitDateObj(new Date());
      setSheet(null);
      setClearTempPinTrigger(prev => prev + 1);
      loadMapData(false);
    } catch (err: any) {
      console.error("Error creating place:", err);
      const errMsg = err?.response?.data?.detail || err?.message || "Failed to add place to map.";
      CustomAlert.alert("Error", errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditPlace = (place: UIMapPin) => {
    setEditCity(place.city);
    setEditCountry(place.country);
    setEditNote(place.note || '');
    setEditCategory(place.type);
    if (place.dates) {
      const parsed = parseDateString(place.dates);
      if (parsed) setEditDateObj(parsed);
    }
    setSheet('edit');
  };

  const handleSaveEditPlace = async () => {
    if (!selected) return;
    if (!editCity.trim() || !editCountry.trim()) {
      CustomAlert.alert("Input required", "Please enter both City and Country.");
      return;
    }

    setIsSavingEdit(true);
    try {
      const categoryPayload = (editCategory.charAt(0).toUpperCase() + editCategory.slice(1)) as any;
      const formattedDate = (editCategory === 'together' || editCategory === 'upcoming')
        ? formatDateForPayload(editDateObj)
        : undefined;

      const updated = await updatePlace(selected.id.toString(), {
        city: editCity.trim(),
        country: editCountry.trim(),
        category: categoryPayload,
        description: editNote.trim(),
        visit_date: formattedDate,
        timezone: 'Asia/Dhaka'
      });

      if (updated) {
        const mapped = mapBackendPlaceToPin(updated);
        setSelected(mapped);
        setSheet('detail');
        loadMapData(false);
        CustomAlert.alert("Updated", "Place details updated successfully.");
      }
    } catch (err: any) {
      console.error("Error updating place:", err);
      const errMsg = err?.response?.data?.detail || err?.message || "Failed to update place.";
      CustomAlert.alert("Error", errMsg);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleTransitionBucket = async (place: UIMapPin) => {
    try {
      const updated = await updatePlace(place.id.toString(), {
        category: 'Upcoming',
        visit_date: 'TBD'
      });
      if (updated) {
        const mapped = mapBackendPlaceToPin(updated);
        setSelected(mapped);
        loadMapData(false);
      }
    } catch (err: any) {
      console.error("Error transitioning place:", err);
      CustomAlert.alert("Error", "Failed to transition place.");
    }
  };

  const handleExecuteDeletePlace = async (placeId: string) => {
    setIsDeleting(true);
    try {
      await deletePlace(placeId);
      triggerNotification("Map Delete", `Removed ${selected?.city || 'place'} from the map`).catch(() => {});
      setConfirmDeletePlace(false);
      setSheet(null);
      setSelected(null);
      loadMapData(false);
    } catch (err: any) {
      console.error("Error deleting place:", err);
      CustomAlert.alert("Error", err?.response?.data?.detail || "Failed to delete place.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExecuteRequestDelete = async (placeId: string) => {
    setIsDeleting(true);
    try {
      await requestDeletePlace(placeId);
      setConfirmDeletePlace(false);
      setSheet(null);
      loadMapData(false);
      CustomAlert.alert(
        "Request Sent",
        "An approval request has been sent to your partner. You will be notified once they confirm."
      );
    } catch (err: any) {
      console.error("Error requesting deletion:", err);
      CustomAlert.alert("Error", err?.response?.data?.detail || "Failed to send request.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDeleteRequest = async (placeId: string) => {
    setIsDeleting(true);
    try {
      await rejectDeletePlace(placeId);
      setSheet(null);
      loadMapData(false);
    } catch (err: any) {
      console.error("Error cancelling deletion request:", err);
      CustomAlert.alert("Error", "Failed to cancel deletion request.");
    } finally {
      setIsDeleting(false);
    }
  };

  const pickMomentPhoto = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setMomentPhoto(result.assets[0]);
    }
  };

  const handleAddMoment = async (placeId: string) => {
    if (momentType === 'Note' && !momentContent.trim()) {
      CustomAlert.alert("Input required", "Please enter a note memory.");
      return;
    }
    if (momentType === 'Photo' && !momentPhoto) {
      CustomAlert.alert("Input required", "Please pick a photo.");
      return;
    }

    try {
      let result;
      if (momentType === 'Note') {
        result = await addMoment(placeId, {
          type: 'Note',
          content: momentContent,
          timezone: 'Asia/Dhaka'
        });
      } else {
        result = await addMoment(
          placeId,
          {
            type: 'Photo',
            caption: momentCaption || undefined,
            timezone: 'Asia/Dhaka'
          },
          momentPhoto
        );
      }

      if (result) {
        const mapped = mapBackendPlaceToPin(result);
        setSelected(mapped);
        setMomentContent("");
        setMomentCaption("");
        setMomentPhoto(null);
        loadMapData(false);
      }
    } catch (err: any) {
      console.error("Error adding moment:", err);
      CustomAlert.alert("Error", "Failed to add memory to place.");
    }
  };

  const photoMoments = selected?.moments?.filter(m => m.type === 'Photo' && !!m.content) || [];
  const photoImages = photoMoments.map(m => ({
    uri: m.content.startsWith('http') ? m.content : `${backendUrl}${m.content}`
  }));

  const handleDownloadImage = async (uri: string) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        CustomAlert.alert('Permission Needed', 'Please grant permission to save photos.');
        return;
      }
      
      const fileUri = ((FileSystem as any).documentDirectory || '') + `memory_${Date.now()}.jpg`;
      const downloaded = await FileSystem.downloadAsync(uri, fileUri);
      
      await MediaLibrary.saveToLibraryAsync(downloaded.uri);
      CustomAlert.alert('Saved', 'Photo saved to your gallery successfully!', [{ text: 'OK' }]);
    } catch (error) {
      console.error('Download error:', error);
      CustomAlert.alert('Error', 'Failed to download the photo.');
    }
  };

  const renderImageModal = () => {
    const currentPhoto = photoImages[currentImageIndex];
    if (!currentPhoto || !isImageViewVisible) return null;
    const currentMoment = photoMoments[currentImageIndex];

    return (
      <Modal visible={isImageViewVisible} transparent={false} animationType="fade" onRequestClose={() => setIsImageViewVisible(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <SafeAreaView style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingTop: Platform.OS === 'android' ? 40 : 20, alignItems: 'center', zIndex: 10, position: 'absolute', top: 0, left: 0, right: 0 }}>
            <Pressable onPress={() => setIsImageViewVisible(false)} style={{ padding: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20 }}>
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
            <Pressable onPress={() => handleDownloadImage(currentPhoto.uri)} style={{ padding: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20 }}>
              <Ionicons name="download-outline" size={24} color="#fff" />
            </Pressable>
          </SafeAreaView>

          <ScrollView 
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }} 
            maximumZoomScale={3} 
            minimumZoomScale={1}
            centerContent={true}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <Image source={{ uri: currentPhoto.uri }} style={{ width: windowWidth, height: windowHeight * 0.8 }} resizeMode="contain" />
          </ScrollView>

          {currentMoment?.caption ? (
            <SafeAreaView style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: Platform.OS === 'android' ? 40 : 20, backgroundColor: 'rgba(0,0,0,0.6)' }}>
              <AppText color="#fff" size={15} style={{ textAlign: 'center', fontStyle: 'italic' }}>
                {currentMoment.caption}
              </AppText>
            </SafeAreaView>
          ) : null}
        </View>
      </Modal>
    );
  };

  const filtered = filter === "all" ? places : places.filter((p) => p.type === filter);

  const uiStats = {
    countries: stats.total_countries,
    cities: stats.total_cities,
    together: stats.together_count,
    bucket: stats.bucket_count,
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AlignedNav />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <View style={styles.mapViewport}>
          {/* Real Fullscreen Leaflet Map */}
          <InteractiveLeafletMap
            places={places}
            routes={routes}
            selectedPin={selected}
            onSelectPin={(pin) => {
              setSelected(pin);
            }}
            onMapClicked={() => {
              setSelected(null);
            }}
            onMapLongPress={handleMapLongPress}
            clearTempPinTrigger={clearTempPinTrigger}
            activeFilter={filter}
            focusLocation={searchedLocation}
            userLocation={userLiveLocation}
            resetCompassTrigger={compassTrigger}
            style={{ flex: 1 }}
          />

          {/* FLOATING TOP HEADER & STATS CARD */}
          <View style={styles.floatingHeaderCard}>
            {/* Row 1: Header Title, Subtitle & Refresh Icon */}
            <View style={styles.headerTopRow}>
              <View>
                <AppText variant="display" size={24} style={{ lineHeight: 26 }}>
                  Map
                  <AppText size={24} color={Colors.accent}>
                    .
                  </AppText>
                </AppText>
                <AppText variant="serifItalic" size={12} color={Colors.muted} style={{ lineHeight: 16 }}>
                  Every place, pin & memory.
                </AppText>
              </View>

              {/* Quick Refresh Icon */}
              <Pressable
                style={styles.iconBtn}
                onPress={() => loadMapData(false)}
                hitSlop={8}
              >
                <Ionicons name="refresh-outline" size={16} color={Colors.ink} />
              </Pressable>
            </View>

            {/* Row 2: Compact Inline Stats Strip */}
            <View style={styles.statsStrip}>
              <View style={styles.statMiniItem}>
                <AppText variant="heading" size={14} color={Colors.ink}>
                  {uiStats.countries}
                </AppText>
                <AppText variant="smallCaps" size={8} color={Colors.muted} style={{ marginLeft: 3 }}>
                  COUNTRIES
                </AppText>
              </View>
              <View style={styles.statMiniDivider} />

              <View style={styles.statMiniItem}>
                <AppText variant="heading" size={14} color={Colors.ink}>
                  {uiStats.cities}
                </AppText>
                <AppText variant="smallCaps" size={8} color={Colors.muted} style={{ marginLeft: 3 }}>
                  CITIES
                </AppText>
              </View>
              <View style={styles.statMiniDivider} />

              <View style={styles.statMiniItem}>
                <AppText variant="heading" size={14} color={Colors.accent}>
                  {uiStats.together}
                </AppText>
                <AppText variant="smallCaps" size={8} color={Colors.muted} style={{ marginLeft: 3 }}>
                  TOGETHER
                </AppText>
              </View>
              <View style={styles.statMiniDivider} />

              <View style={styles.statMiniItem}>
                <AppText variant="heading" size={14} color={Colors.ink}>
                  {uiStats.bucket}
                </AppText>
                <AppText variant="smallCaps" size={8} color={Colors.muted} style={{ marginLeft: 3 }}>
                  BUCKET
                </AppText>
              </View>
            </View>

            {/* Row 3: Compact Search Box & Circular Filter Button */}
            <View style={styles.searchFilterRow}>
              <View style={styles.compactSearchBox}>
                <Ionicons name="search" size={13} color={Colors.muted} style={{ marginRight: 4 }} />
                <TextInput
                  style={styles.compactSearchInput}
                  placeholder="Search city, place..."
                  placeholderTextColor={Colors.muted}
                  value={mapSearchQuery}
                  onChangeText={handleMapSearchChange}
                  onFocus={() => setIsSearchFocused(true)}
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {isSearchingMap ? (
                  <ActivityIndicator size="small" color={Colors.accent} style={{ marginLeft: 4 }} />
                ) : mapSearchQuery.length > 0 ? (
                  <Pressable
                    onPress={() => {
                      setMapSearchQuery("");
                      setMapSearchResults([]);
                      setSearchedLocation(null);
                    }}
                    hitSlop={6}
                  >
                    <Ionicons name="close-circle" size={14} color={Colors.muted} />
                  </Pressable>
                ) : null}
              </View>

              {/* Circular Filter Button */}
              <Pressable
                onPress={() => setShowFilterBar(prev => !prev)}
                style={[
                  styles.circleActionBtn,
                  (showFilterBar || filter !== "all") && styles.circleActionBtnActive
                ]}
                hitSlop={6}
              >
                <FilterIcon
                  color={(showFilterBar || filter !== "all") ? Colors.bone : Colors.ink}
                  size={15}
                />
                {filter !== "all" && <View style={styles.filterActiveDot} />}
              </Pressable>
            </View>

            {/* Live Search Suggestions Dropdown */}
            {mapSearchResults.length > 0 && (
              <View style={styles.searchDropdownCard}>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  style={{ maxHeight: 210 }}
                  nestedScrollEnabled
                >
                  {mapSearchResults.map((item, idx) => (
                    <Pressable
                      key={item.id || idx}
                      style={[
                        styles.searchResultItem,
                        idx < mapSearchResults.length - 1 && styles.searchResultBorder
                      ]}
                      onPress={() => handleSelectSearchResult(item)}
                    >
                      <View style={[styles.searchResultIconWrap, item.isSaved && { backgroundColor: `${Colors.accent}20` }]}>
                        <Ionicons
                          name={item.isSaved ? "heart" : "location-outline"}
                          size={15}
                          color={item.isSaved ? Colors.accent : Colors.ink}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppText variant="heading" size={13} color={Colors.ink} numberOfLines={1}>
                          {item.title}
                        </AppText>
                        <AppText variant="mono" size={8} color={Colors.muted} numberOfLines={1}>
                          {item.subtitle}
                        </AppText>
                      </View>
                      <Ionicons name="chevron-forward" size={13} color={Colors.muted} />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Row 4: Horizontal Category Filters with Pin Color Dots (Toggled via Filter Button) */}
            {showFilterBar && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScrollContent}
              >
                {TYPE_FILTERS.map((t) => {
                  const isActive = filter === t;
                  const dotColor = t === 'all' ? Colors.ink : PIN_COLORS[t];
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setFilter(t)}
                      style={[
                        styles.floatingFilterChip,
                        isActive && styles.floatingFilterChipActive,
                      ]}
                    >
                      {t !== 'all' && (
                        <View style={[styles.filterChipDot, { backgroundColor: dotColor }]} />
                      )}
                      <AppText
                        variant="smallCaps"
                        size={10}
                        style={{
                          color: isActive ? '#FFFFFF' : Colors.ink,
                          fontWeight: isActive ? '700' : '500',
                          letterSpacing: 0.5,
                        }}
                      >
                        {t.toUpperCase()}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Searched Location Preview Banner */}
          {searchedLocation && (
            <View style={styles.searchedLocationCard}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <AppText variant="heading" size={15} color={Colors.ink} numberOfLines={1}>
                  {searchedLocation.city}
                </AppText>
                <AppText variant="mono" size={9} color={Colors.muted} numberOfLines={1}>
                  {searchedLocation.country} · {searchedLocation.lat.toFixed(2)}°, {searchedLocation.lng.toFixed(2)}°
                </AppText>
              </View>

              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Pressable
                  style={styles.closeSearchBannerBtn}
                  onPress={() => {
                    setSearchedLocation(null);
                    setMapSearchQuery("");
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={16} color={Colors.muted} />
                </Pressable>

                <Pressable
                  style={styles.addFromSearchBtn}
                  onPress={() => {
                    setNewCity(searchedLocation.city);
                    setNewCountry(searchedLocation.country);
                    setSearchedLocation(null);
                    setSheet("new");
                  }}
                >
                  <Ionicons name="add" size={15} color="#FFFFFF" />
                  <AppText variant="smallCaps" size={10} style={{ color: '#FFFFFF', fontWeight: '700', marginLeft: 3 }}>
                    Add Place
                  </AppText>
                </Pressable>
              </View>
            </View>
          )}

          {/* Classy Floating Map Controls: Fit All Pins & Live Location */}
          <View
            style={[
              styles.floatingRightToolStack,
              selected && !sheet ? { bottom: 185 } : null,
            ]}
            pointerEvents="box-none"
          >
            {/* Fit All Pins Button */}
            <Pressable
              style={styles.floatingCircleBtn}
              onPress={handleResetCompass}
              hitSlop={6}
            >
              <Ionicons
                name="scan-outline"
                size={20}
                color={Colors.ink}
              />
            </Pressable>

            {/* Live Location Button */}
            <Pressable
              style={[styles.floatingCircleBtn, isLocating && styles.floatingCircleBtnActive]}
              onPress={handleGetLiveLocation}
              hitSlop={6}
            >
              {isLocating ? (
                <ActivityIndicator size="small" color={Colors.accent} />
              ) : (
                <Ionicons
                  name={userLiveLocation ? "locate" : "locate-outline"}
                  size={21}
                  color={userLiveLocation ? Colors.accent : Colors.ink}
                />
              )}
            </Pressable>
          </View>

          {/* SELECTED PIN PEEK CARD (Keeps marker unobstructed on the map) */}
          {selected && !sheet ? (
            <View style={styles.peekCardWrapper} pointerEvents="box-none">
              <Pressable
                style={styles.peekCard}
                onPress={() => setSheet("detail")}
              >
                {/* Header Row */}
                <View style={styles.peekHeaderRow}>
                  <View style={styles.peekTagGroup}>
                    <View style={[styles.peekDot, { backgroundColor: PIN_COLORS[selected.type] || Colors.accent }]} />
                    <AppText variant="mono" size={10} color={PIN_COLORS[selected.type] || Colors.accent} style={{ fontWeight: '700' }}>
                      {PIN_META[selected.type]?.label.toUpperCase() || selected.type.toUpperCase()}
                    </AppText>
                    <AppText variant="mono" size={10} color={Colors.muted} style={{ marginLeft: 6 }}>
                      · {selected.lat.toFixed(1)}°, {selected.lng.toFixed(1)}°
                    </AppText>
                  </View>

                  <Pressable
                    style={styles.peekCloseBtn}
                    onPress={() => setSelected(null)}
                    hitSlop={10}
                  >
                    <Ionicons name="close" size={16} color={Colors.muted} />
                  </Pressable>
                </View>

                {/* Body Row */}
                <View style={styles.peekBodyRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <AppText variant="serif" size={19} color={Colors.ink} numberOfLines={1}>
                      {selected.city}
                    </AppText>
                    <AppText variant="serifItalic" size={13} color={Colors.muted} numberOfLines={1}>
                      {selected.country}{selected.dates ? ` · ${selected.dates}` : ''}
                    </AppText>
                    {selected.note ? (
                      <AppText variant="body" size={12} color={Colors.ink2} numberOfLines={1} style={{ marginTop: 2 }}>
                        "{selected.note}"
                      </AppText>
                    ) : null}
                  </View>

                  {selected.moments && selected.moments.length > 0 && selected.moments[0].photo_url ? (
                    <Image
                      source={{ uri: selected.moments[0].photo_url }}
                      style={styles.peekThumbnail}
                      resizeMode="cover"
                    />
                  ) : null}
                </View>

                {/* Action Footer */}
                <View style={styles.peekFooterRow}>
                  <AppText variant="mono" size={10} color={Colors.muted}>
                    {selected.moments?.length || 0} {(selected.moments?.length === 1) ? 'memory' : 'memories'}
                  </AppText>

                  <View style={styles.peekActionBtn}>
                    <AppText variant="smallCaps" size={11} color={Colors.accent} style={{ fontWeight: '700' }}>
                      View Place Details
                    </AppText>
                    <Ionicons name="chevron-forward" size={13} color={Colors.accent} style={{ marginLeft: 2 }} />
                  </View>
                </View>
              </Pressable>
            </View>
          ) : (
            /* FLOATING BOTTOM CONTROLS */
            <View style={styles.floatingBottomControls} pointerEvents="box-none">
              {/* Places List Toggle Button */}
              <Pressable
                style={styles.floatingPlacesListBtn}
                onPress={() => setSheet("placesList")}
              >
                <Ionicons name="list" size={16} color={Colors.ink} />
                <AppText variant="smallCaps" size={11} color={Colors.ink} style={{ fontWeight: '600', marginLeft: 4 }}>
                  Places ({filtered.length})
                </AppText>
              </Pressable>

              {/* Add Place FAB */}
              <Pressable
                style={styles.floatingAddFab}
                onPress={() => setSheet("new")}
              >
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <AppText variant="smallCaps" size={11} style={{ color: '#FFFFFF', fontWeight: '700', marginLeft: 4 }}>
                  Add Place
                </AppText>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* All Places List BottomSheet */}
      <BottomSheet
        open={sheet === "placesList"}
        onClose={() => setSheet(null)}
        kicker="EXPLORE"
        title={`All Places (${filtered.length})`}
      >
        <View style={{ paddingBottom: 24 }}>
          {/* Quick Filter inside Sheet */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {TYPE_FILTERS.map((t) => (
                <Tag key={t} active={filter === t} onPress={() => setFilter(t)}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Tag>
              ))}
            </View>
          </ScrollView>

          {filtered.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <Ionicons name="map-outline" size={38} color={Colors.muted} style={{ marginBottom: 8 }} />
              <AppText variant="serifItalic" size={15} color={Colors.muted} style={{ textAlign: 'center' }}>
                No places saved for "{filter.toUpperCase()}".
              </AppText>
              <AppButton
                variant="outline"
                size="sm"
                style={{ marginTop: 14 }}
                onPress={() => {
                  setSheet("new");
                }}
              >
                + Add Place
              </AppButton>
            </View>
          ) : (
            filtered.map((p) => (
              <PinCard
                key={p.id}
                pin={p}
                onPress={() => {
                  setSelected(p);
                  setSheet(null);
                }}
              />
            ))
          )}
        </View>
      </BottomSheet>

      {/* Detail BottomSheet */}
      <BottomSheet
        open={sheet === "detail" && !!selected}
        onClose={() => {
          setSheet(null);
          setConfirmDeletePlace(false);
        }}
        kicker={selected ? PIN_META[selected.type].label.toUpperCase() : ""}
        title={selected?.city ?? ""}
      >
        {selected && (
          <View style={{ paddingBottom: 20 }}>
            <AppText
              variant="mono"
              color={Colors.muted}
              style={{ fontSize: 10, marginBottom: 12 }}
            >
              {selected.country.toUpperCase()} · {selected.lat.toFixed(2)}°, {selected.lng.toFixed(2)}°
            </AppText>

            {selected.note ? (
              <AppText
                variant="serifItalic"
                size={17}
                color={Colors.ink2}
                style={{ lineHeight: 26, marginBottom: 20 }}
              >
                {selected.note}
              </AppText>
            ) : null}

            {selected.dates ? (
              <View style={styles.dateBlock}>
                <AppText
                  variant="smallCaps"
                  color={Colors.accent}
                  style={{ marginBottom: 4 }}
                >
                  When
                </AppText>
                <AppText variant="heading" size={16}>
                  {selected.dates}
                </AppText>
              </View>
            ) : null}

            {/* ==================== MOMENT SECTION ==================== */}
            <AppText
              variant="smallCaps"
              color={Colors.ink2}
              style={{ marginTop: 12, marginBottom: 12 }}
            >
              SAVED MEMORIES
            </AppText>

            {selected.moments && selected.moments.length > 0 ? (
              <View style={{ gap: 10, marginBottom: 20 }}>
                {selected.moments.map((item, index) => {
                  if (item.type === 'Photo' && item.content) {
                    const imgUri = item.content.startsWith('http') ? item.content : `${backendUrl}${item.content}`;
                    const pIndex = photoMoments.findIndex(m => m.id === item.id);
                    return (
                      <Pressable key={index} style={styles.photoMomentCard} onPress={() => {
                        setCurrentImageIndex(pIndex >= 0 ? pIndex : 0);
                        setIsImageViewVisible(true);
                      }}>
                        <Image source={{ uri: imgUri }} style={styles.photoMomentImg} />
                        {item.caption ? (
                          <AppText size={14} style={{ marginTop: 6, fontStyle: 'italic' }}>
                            {item.caption}
                          </AppText>
                        ) : null}
                        <AppText variant="mono" size={9} color={Colors.muted} style={{ marginTop: 4 }}>
                          Saved by {item.creator_name} · {new Date(item.created_at).toLocaleDateString()}
                        </AppText>
                      </Pressable>
                    );
                  } else {
                    return (
                      <View key={index} style={styles.noteMomentCard}>
                        <AppText size={15} style={{ lineHeight: 22 }}>{item.content}</AppText>
                        <AppText variant="mono" size={9} color={Colors.muted} style={{ marginTop: 6 }}>
                          Saved by {item.creator_name} · {new Date(item.created_at).toLocaleDateString()}
                        </AppText>
                      </View>
                    );
                  }
                })}
              </View>
            ) : (
              <AppText variant="serifItalic" color={Colors.muted} style={{ marginBottom: 20 }}>
                No memories saved for this place yet.
              </AppText>
            )}

            {/* ==================== ADD MEMORY SECTION ==================== */}
            <View style={styles.addMomentSection}>
              <AppText variant="smallCaps" color={Colors.accent} style={{ marginBottom: 10 }}>
                ADD A MEMORY
              </AppText>

              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <Pressable
                  style={[styles.momentTypeBtn, momentType === 'Note' && styles.momentTypeBtnActive]}
                  onPress={() => setMomentType('Note')}
                >
                  <AppText variant="smallCaps" style={{ color: momentType === 'Note' ? '#fff' : Colors.ink }}>
                    Note
                  </AppText>
                </Pressable>
                <Pressable
                  style={[styles.momentTypeBtn, momentType === 'Photo' && styles.momentTypeBtnActive]}
                  onPress={() => setMomentType('Photo')}
                >
                  <AppText variant="smallCaps" style={{ color: momentType === 'Photo' ? '#fff' : Colors.ink }}>
                    Photo
                  </AppText>
                </Pressable>
              </View>

              {momentType === 'Note' ? (
                <View style={{ gap: 8 }}>
                  <AppTextInput
                    label="Write a note"
                    value={momentContent}
                    onChangeText={setMomentContent}
                    placeholder="Describe a special moment..."
                  />
                  <AppButton
                    variant="solid"
                    size="sm"
                    onPress={() => handleAddMoment(selected.id.toString())}
                  >
                    Save Memory Note
                  </AppButton>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {momentPhoto ? (
                    <View style={{ alignItems: 'center', marginVertical: 6 }}>
                      <Image source={{ uri: momentPhoto.uri }} style={{ width: 140, height: 140, borderRadius: 10, marginBottom: 6 }} />
                      <AppButton variant="ghost" size="sm" onPress={() => setMomentPhoto(null)}>
                        Change Photo
                      </AppButton>
                    </View>
                  ) : (
                    <AppButton variant="outline" size="sm" onPress={pickMomentPhoto}>
                      Choose Photo from Gallery
                    </AppButton>
                  )}
                  <AppTextInput
                    label="Caption (Optional)"
                    value={momentCaption}
                    onChangeText={setMomentCaption}
                    placeholder="A beautiful afternoon..."
                  />
                  <AppButton
                    variant="solid"
                    size="sm"
                    onPress={() => handleAddMoment(selected.id.toString())}
                  >
                    Upload Photo Memory
                  </AppButton>
                </View>
              )}
            </View>

            {selected.type === "bucket" && (
              <AppButton
                full
                variant="accent"
                size="lg"
                style={{ marginTop: 14, marginBottom: 10 }}
                onPress={() => handleTransitionBucket(selected)}
              >
                Plan a trip here →
              </AppButton>
            )}

            {selected.deletion_request ? (
              selected.deletion_request.requested_by !== currentUserId ? (
                <View style={{ marginTop: 24 }}>
                  <AppText variant="smallCaps" color={Colors.accent} style={{ marginBottom: 12, textAlign: 'center' }}>
                    PENDING REMOVAL APPROVAL
                  </AppText>
                  <AppText variant="serifItalic" color={Colors.ink2} style={{ marginBottom: 16, textAlign: 'center' }}>
                    {selected.deletion_request.requested_by_name} wants to remove this place from your map.
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <AppButton
                      variant="outline"
                      size="lg"
                      style={{ flex: 1 }}
                      onPress={async () => {
                        try {
                          await rejectDeletePlace(selected.id.toString());
                          setSheet(null);
                          loadMapData(false);
                        } catch (err) {
                          CustomAlert.alert("Error", "Failed to reject deletion request.");
                        }
                      }}
                    >
                      Reject
                    </AppButton>
                    <AppButton
                      variant="accent"
                      size="lg"
                      style={{ flex: 1 }}
                      onPress={async () => {
                        try {
                          await approveDeletePlace(selected.id.toString());
                          setSheet(null);
                          loadMapData(false);
                        } catch (err) {
                          CustomAlert.alert("Error", "Failed to approve deletion request.");
                        }
                      }}
                    >
                      Approve
                    </AppButton>
                  </View>
                </View>
              ) : (
                <View style={{ marginTop: 24, alignItems: 'center', width: '100%' }}>
                  <AppText variant="smallCaps" color={Colors.muted} style={{ marginBottom: 8 }}>
                    REMOVAL PENDING
                  </AppText>
                  <AppText variant="serifItalic" color={Colors.muted} style={{ textAlign: 'center', marginBottom: 14 }}>
                    Waiting for your partner to approve the removal of this place.
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                    <AppButton
                      full
                      variant="outline"
                      size="md"
                      disabled={isDeleting}
                      onPress={() => handleCancelDeleteRequest(selected.id.toString())}
                    >
                      {isDeleting ? "Cancelling..." : "Cancel Removal Request"}
                    </AppButton>
                  </View>
                </View>
              )
            ) : confirmDeletePlace ? (
              <View style={{
                marginTop: 20,
                padding: 16,
                borderRadius: 14,
                backgroundColor: 'rgba(217, 83, 79, 0.08)',
                borderWidth: 1,
                borderColor: 'rgba(217, 83, 79, 0.3)',
                gap: 12
              }}>
                <AppText variant="heading" size={16} color={Colors.ink}>
                  {selected.moments && selected.moments.some((m: any) => m.creator_id && currentUserId && m.creator_id !== currentUserId)
                    ? "Partner Approval Required"
                    : "Remove This Place?"}
                </AppText>
                <AppText variant="serifItalic" size={13} color={Colors.ink2}>
                  {selected.moments && selected.moments.some((m: any) => m.creator_id && currentUserId && m.creator_id !== currentUserId)
                    ? "Your partner has contributed memories to this place. Removing it requires sending an approval request to them."
                    : `Are you sure you want to remove ${selected.city} from your map? This action cannot be undone.`}
                </AppText>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <AppButton
                    variant="outline"
                    size="md"
                    style={{ flex: 1 }}
                    onPress={() => setConfirmDeletePlace(false)}
                    disabled={isDeleting}
                  >
                    Cancel
                  </AppButton>
                  <AppButton
                    variant="solid"
                    size="md"
                    style={{ flex: 1, backgroundColor: '#D9534F' }}
                    textStyle={{ color: '#FFF' }}
                    disabled={isDeleting}
                    onPress={() => {
                      const hasPartnerMoments = selected.moments && selected.moments.some(
                        (m: any) => m.creator_id && currentUserId && m.creator_id !== currentUserId
                      );
                      if (hasPartnerMoments) {
                        handleExecuteRequestDelete(selected.id.toString());
                      } else {
                        handleExecuteDeletePlace(selected.id.toString());
                      }
                    }}
                  >
                    {isDeleting ? "Processing..." : (selected.moments && selected.moments.some((m: any) => m.creator_id && currentUserId && m.creator_id !== currentUserId)) ? "Send Request" : "Confirm Delete"}
                  </AppButton>
                </View>
              </View>
            ) : (
              <View style={{ gap: 8, marginTop: 14 }}>
                <AppButton
                  full
                  variant="outline"
                  size="lg"
                  onPress={() => handleOpenEditPlace(selected)}
                >
                  Edit Place Details
                </AppButton>
                <AppButton
                  full
                  variant="outline"
                  size="lg"
                  style={{ borderColor: '#D9534F' }}
                  textStyle={{ color: '#D9534F' }}
                  disabled={isDeleting}
                  onPress={() => setConfirmDeletePlace(true)}
                >
                  Remove Place
                </AppButton>
              </View>
            )}

            <AppButton
              full
              variant="ghost"
              size="lg"
              style={{ marginTop: 8 }}
              onPress={() => setSheet(null)}
            >
              Close
            </AppButton>
          </View>
        )}
      </BottomSheet>

      {/* Edit Place BottomSheet */}
      <BottomSheet
        open={sheet === "edit" && !!selected}
        onClose={() => setSheet("detail")}
        kicker="EDIT"
        title="Edit Place Details"
      >
        <View style={{ paddingBottom: 20 }}>
          <AppText
            variant="serifItalic"
            size={14}
            color={Colors.muted}
            style={{ marginBottom: 18 }}
          >
            Update details or fix mistakes for this marked place.
          </AppText>

          <AppTextInput
            label="City"
            n="01"
            value={editCity}
            onChangeText={setEditCity}
          />
          <AppTextInput
            label="Country"
            n="02"
            value={editCountry}
            onChangeText={setEditCountry}
          />

          <View style={styles.meetOptions}>
            {categoryOptions.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.meetOption,
                  editCategory === option.value && styles.meetSelected,
                ]}
                onPress={() => setEditCategory(option.value)}
              >
                <AppText
                  variant="smallCaps"
                  style={{
                    color: editCategory === option.value ? "#fff" : Colors.ink,
                  }}
                >
                  {option.label}
                </AppText>
                <View
                  style={[
                    styles.radio,
                    editCategory === option.value && styles.radioSelected,
                  ]}
                />
              </Pressable>
            ))}
          </View>

          <AppTextInput
            label="A Note"
            n="04"
            placeholder="What draws you there..."
            value={editNote}
            onChangeText={setEditNote}
          />

          {(editCategory === 'together' || editCategory === 'upcoming') && (
            <View style={{ marginBottom: 20 }}>
              <AppText variant="smallCaps" color={Colors.ink2} style={{ fontSize: 12, marginBottom: 8 }}>
                Visit Date (Optional)
              </AppText>
              <Pressable
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 15,
                  backgroundColor: '#EAE2D4',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: Colors.rule,
                }}
                onPress={() => setShowEditDatePicker(true)}
              >
                <AppText variant="display" size={20}>
                  {editDateObj.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })}
                </AppText>
                <Ionicons name="calendar-outline" size={24} color="#000" />
              </Pressable>

              <AppDateTimePickerModal
                visible={showEditDatePicker}
                mode="date"
                value={editDateObj}
                title="Select Visit Date"
                onConfirm={(date) => {
                  setEditDateObj(date);
                  setShowEditDatePicker(false);
                }}
                onCancel={() => setShowEditDatePicker(false)}
              />
            </View>
          )}

          <AppButton
            full
            variant="solid"
            size="lg"
            style={{ marginTop: 12 }}
            disabled={isSavingEdit}
            onPress={handleSaveEditPlace}
          >
            {isSavingEdit ? "Saving Changes..." : "Save Changes"}
          </AppButton>
        </View>
      </BottomSheet>

      {/* Add pin sheet */}
      <BottomSheet
        open={sheet === "new"}
        onClose={() => {
          setSheet(null);
          setSuggestions([]);
          setNewPlaceCoords(null);
          setClearTempPinTrigger(prev => prev + 1);
        }}
        kicker="NEW"
        title="Mark a place"
      >
        <View style={{ paddingBottom: 20 }}>
          {newPlaceCoords && (
            <View style={styles.pinnedLocationBadge}>
              <Ionicons name="location" size={13} color={Colors.accent} />
              <AppText variant="mono" size={10} color={Colors.ink} style={{ marginLeft: 5, fontWeight: '600' }}>
                PINNED SPOT · {newPlaceCoords.lat.toFixed(4)}°, {newPlaceCoords.lng.toFixed(4)}°
              </AppText>
              {isReverseGeocoding && (
                <ActivityIndicator size="small" color={Colors.accent} style={{ marginLeft: 8 }} />
              )}
            </View>
          )}

          <AppText
            variant="serifItalic"
            size={15}
            color={Colors.muted}
            style={{ marginBottom: 22 }}
          >
            {newPlaceCoords ? "Save this pinned spot to your shared map." : "Add a city to your shared map."}
          </AppText>

          <AppTextInput
            label="City"
            n="01"
            placeholder="Search city (e.g. Lisbon, Paris, Tokyo)"
            value={newCity}
            onChangeText={handleCityQueryChange}
          />

          {isSearchingCity && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -14, marginBottom: 12, paddingLeft: 4 }}>
              <ActivityIndicator size="small" color={Colors.accent} />
              <AppText variant="mono" size={10} color={Colors.muted}>Searching cities...</AppText>
            </View>
          )}

          {suggestions.length > 0 && (
            <View style={styles.suggestionsCard}>
              {suggestions.map((item, idx) => (
                <Pressable
                  key={idx}
                  style={[styles.suggestionItem, idx < suggestions.length - 1 && styles.suggestionBorder]}
                  onPress={() => {
                    setNewCity(item.city);
                    if (item.country) setNewCountry(item.country);
                    setSuggestions([]);
                  }}
                >
                  <Ionicons name="location-outline" size={14} color={Colors.accent} style={{ marginRight: 6 }} />
                  <AppText variant="mono" size={11} color={Colors.ink} style={{ flex: 1 }}>
                    {item.place_name}
                  </AppText>
                </Pressable>
              ))}
            </View>
          )}

          <AppTextInput
            label="Country"
            n="02"
            placeholder="Portugal"
            value={newCountry}
            onChangeText={setNewCountry}
          />

          <View style={styles.meetOptions}>
            {categoryOptions.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.meetOption,
                  meetType === option.value && styles.meetSelected,
                ]}
                onPress={() => setMeetType(option.value)}
              >
                <AppText
                  variant="smallCaps"
                  style={{
                    color: meetType === option.value ? "#fff" : Colors.ink,
                  }}
                >
                  {option.label}
                </AppText>
                <View
                  style={[
                    styles.radio,
                    meetType === option.value && styles.radioSelected,
                  ]}
                />
              </Pressable>
            ))}
          </View>

          <AppTextInput
            label="A Note"
            n="04"
            placeholder="What draws you there..."
            value={newNote}
            onChangeText={setNewNote}
          />

          {(meetType === 'together' || meetType === 'upcoming') && (
            <View style={{ marginBottom: 20 }}>
              <AppText variant="smallCaps" color={Colors.ink2} style={{ fontSize: 12, marginBottom: 8 }}>
                Visit Date (Optional)
              </AppText>
              <Pressable
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 15,
                  backgroundColor: '#EAE2D4',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: Colors.rule,
                }}
                onPress={() => setShowDatePicker(true)}
              >
                <AppText variant="display" size={20}>
                  {visitDateObj.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })}
                </AppText>
                <Ionicons name="calendar-outline" size={24} color="#000" />
              </Pressable>

              <AppDateTimePickerModal
                visible={showDatePicker}
                mode="date"
                value={visitDateObj}
                title="Select Visit Date"
                onConfirm={(date) => {
                  setVisitDateObj(date);
                  setShowDatePicker(false);
                }}
                onCancel={() => setShowDatePicker(false)}
              />
            </View>
          )}

          <AppButton
            full
            variant="solid"
            size="lg"
            style={{ marginTop: 12 }}
            disabled={isSubmitting}
            onPress={handleCreatePlace}
          >
            {isSubmitting ? "Adding to map..." : "Add to map →"}
          </AppButton>
        </View>
      </BottomSheet>
      
      {renderImageModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bone },
  inner: { padding: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bone },
  statsRow: {
    flexDirection: "row",
    backgroundColor: Colors.cream,
    borderRadius: 14,
    marginBottom: 16,
    padding: 14,
  },
  statBlock: { flex: 1, alignItems: "center" },
  statBorder: { borderRightWidth: 1, borderRightColor: Colors.rule },
  meetOptions: {
    marginBottom: 10,
    gap: 8,
  },
  meetOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "#EAE2D4",
    borderRadius: 12,
  },
  meetSelected: {
    backgroundColor: "#1C1C1E",
  },
  radio: {
    width: 6,
    height: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  radioSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  dateBlock: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: `${Colors.accent}10`,
    marginBottom: 18,
  },
  photoMomentCard: {
    backgroundColor: Colors.cream,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.rule,
    padding: 12,
  },
  photoMomentImg: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    resizeMode: 'cover',
  },
  noteMomentCard: {
    backgroundColor: Colors.cream,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.rule,
    padding: 14,
  },
  addMomentSection: {
    backgroundColor: Colors.cream,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.rule,
    padding: 16,
    marginVertical: 12,
  },
  momentTypeBtn: {
    flex: 1,
    padding: 10,
    backgroundColor: '#EAE2D4',
    alignItems: 'center',
    borderRadius: 8,
  },
  momentTypeBtnActive: {
    backgroundColor: '#1C1C1E',
  },
  suggestionsCard: {
    backgroundColor: Colors.cream,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.rule,
    marginBottom: 14,
    marginTop: -10,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  suggestionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
  },
  mapViewport: {
    flex: 1,
    position: 'relative',
    width: '100%',
    height: '100%',
    backgroundColor: '#F7F3EC',
  },
  floatingHeaderCard: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    zIndex: 10,
    backgroundColor: 'rgba(247, 243, 236, 0.94)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(216, 207, 196, 0.85)',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  placeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: '#EAE2D4',
    borderRadius: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EAE2D4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMiniPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 3,
  },
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFE9DE',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  statMiniItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  statMiniDivider: {
    width: 1,
    height: 12,
    backgroundColor: Colors.rule,
  },
  filterScrollContent: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  floatingFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#EAE2D4',
    gap: 5,
  },
  floatingFilterChipActive: {
    backgroundColor: '#1C1C1E',
  },
  filterChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  floatingBottomControls: {
    position: 'absolute',
    bottom: 20,
    left: 14,
    right: 14,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  floatingPlacesListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(247, 243, 236, 0.96)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(216, 207, 196, 0.9)',
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  floatingAddFab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 22,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  searchFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  circleActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EAE2D4',
    borderWidth: 1,
    borderColor: 'rgba(216, 207, 196, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  circleActionBtnActive: {
    backgroundColor: '#1C1C1E',
    borderColor: '#1C1C1E',
  },
  filterActiveDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  compactSearchBox: {
    flex: 1,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFE9DE',
    borderRadius: 18,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(216, 207, 196, 0.75)',
  },
  compactSearchInput: {
    flex: 1,
    height: '100%',
    fontSize: 13,
    color: Colors.ink,
    paddingVertical: 0,
    paddingHorizontal: 4,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  searchDropdownCard: {
    backgroundColor: '#FBF8F3',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.rule,
    marginBottom: 8,
    overflow: 'hidden',
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  searchResultBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#EFE9DE',
  },
  searchResultIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EAE2D4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchedLocationCard: {
    position: 'absolute',
    bottom: 75,
    left: 14,
    right: 68,
    zIndex: 10,
    backgroundColor: 'rgba(247, 243, 236, 0.96)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  closeSearchBannerBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EAE2D4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addFromSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  floatingRightToolStack: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    zIndex: 10,
    gap: 10,
    alignItems: 'center',
  },
  floatingCircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(247, 243, 236, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(216, 207, 196, 0.85)',
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  floatingCircleBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: '#FFFFFF',
  },
  compassRoseWrap: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  compassNorthDot: {
    position: 'absolute',
    top: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.accent,
  },
  pinnedLocationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(192, 86, 64, 0.12)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 14,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(192, 86, 64, 0.25)',
  },
  peekCardWrapper: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    zIndex: 25,
  },
  peekCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E1D5',
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 8,
  },
  peekHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  peekTagGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  peekDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  peekCloseBtn: {
    padding: 4,
  },
  peekBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  peekThumbnail: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: Colors.bone,
    borderWidth: 1,
    borderColor: '#E8E1D5',
  },
  peekFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0EBE1',
  },
  peekActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});


