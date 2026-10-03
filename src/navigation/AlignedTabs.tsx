import React, { useEffect, useRef } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, AppState, DeviceEventEmitter } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlignedTabParamList } from '../types';
import { Colors } from '../constants/colors';
import { Fonts } from '../constants/fonts';
import api from '../services/api';
import { getMe } from '../services/authApi';

import { HomeScreen } from '../screens/aligned/HomeScreen';
import { ConnectScreen } from '../screens/aligned/ConnectScreen';
import { DatesScreen } from '../screens/aligned/DatesScreen';
import { ThreadScreen } from '../screens/aligned/ThreadScreen';
import { FutureScreen } from '../screens/aligned/FutureScreen';
import { MapScreen } from '../screens/aligned/MapScreen';

const Tab = createBottomTabNavigator<AlignedTabParamList>();

const NAV_ITEMS = [
  { name: 'Home' as const, mark: '◐', label: 'Today' },
  { name: 'Connect' as const, mark: '◈', label: 'Connect' },
  { name: 'Dates' as const, mark: '✦', label: 'Dates' },
  { name: 'Thread' as const, mark: '❦', label: 'Thread' },
  { name: 'Future' as const, mark: '◉', label: 'Future' },
  { name: 'Map' as const, mark: '◇', label: 'Map' },
];

function useGlobalWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let active = true;
    let reconnectTimer: any = null;
    let reconnectDelay = 3000; // Fix #5: exponential backoff starting at 3s
    const MAX_RECONNECT_DELAY = 30000;

    const connectWS = async () => {
      if (!active) return;
      try {
        const meData = await getMe();
        const userId = meData?.id || meData?._id || meData?.data?.id || meData?.data?._id;
        if (!userId) {
          if (active) reconnectTimer = setTimeout(connectWS, reconnectDelay);
          return;
        }

        let baseUrl = api.defaults.baseURL || "";
        if (baseUrl.endsWith("/")) {
          baseUrl = baseUrl.slice(0, -1);
        }
        if (!baseUrl) {
          if (active) reconnectTimer = setTimeout(connectWS, reconnectDelay);
          return;
        }

        let wsUrl = baseUrl.replace("http://", "ws://").replace("https://", "wss://");
        wsUrl = `${wsUrl}/ws/notifications/${userId}`;

        if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
          return;
        }

        console.log("Global WebSocket: Connecting to", wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("Global WebSocket: Connected successfully for user", userId);
          reconnectDelay = 3000; // Reset backoff on successful connection
        };

        ws.onmessage = (event) => {
          try {
            if (typeof event.data !== 'string' || !event.data.trim()) return;
            const data = JSON.parse(event.data);
            console.log("Global WebSocket Message:", data);
            if (data.type === "THREAD_UPDATED" || data.type === "new_thread_message") {
              DeviceEventEmitter.emit('NEW_THREAD_MESSAGE', data);
            } else if (data.type === "MAP_UPDATED") {
              DeviceEventEmitter.emit('REFRESH_MAP_DATA');
            } else if (data.type === "IDEA_UPDATED") {
              DeviceEventEmitter.emit('REFRESH_IDEAS_DATA');
            } else if (data.type === "DATE_UPDATED" || data.type === "MILESTONE_UPDATED") {
              DeviceEventEmitter.emit('REFRESH_DATES_DATA');
            } else if (typeof data.type === 'string' && data.type.startsWith("SECRET_")) {
              DeviceEventEmitter.emit('REFRESH_SECRET_DATA');
            } else if (
              data.type === "ALIGNMENT_REQUEST_RECEIVED" ||
              data.type === "ALIGNMENT_REQUEST_SENT" ||
              data.type === "ALIGNMENT_REQUEST_CANCELLED" ||
              data.type === "ALIGNMENT_REJECTED" ||
              data.type === "ALIGNMENT_BONDED" || 
              data.type === "ALIGNMENT_BROKEN" || 
              data.type === "STATE_UPDATE" || 
              data.type === "PULSE_UPDATED" ||
              data.type === "NEW_NOTIFICATION"
            ) {
              DeviceEventEmitter.emit('REFRESH_ALIGNED_DATA');
              DeviceEventEmitter.emit('ALIGNMENT_REQUEST_UPDATED', data);
              if (data.type === "ALIGNMENT_BONDED") {
                DeviceEventEmitter.emit('ALIGNMENT_BONDED', data);
              }
              if (data.type === "ALIGNMENT_BROKEN") {
                DeviceEventEmitter.emit('ALIGNMENT_BROKEN', data);
              }
            }
          } catch (e) {
            console.log("Error parsing ws message", e);
          }
        };

        ws.onerror = (e) => {
          console.log("Global WebSocket Error:", e);
        };

        ws.onclose = () => {
          console.log(`Global WebSocket Disconnected. Reconnecting in ${reconnectDelay / 1000}s...`);
          if (active) {
            reconnectTimer = setTimeout(connectWS, reconnectDelay);
            // Exponential backoff: 3s → 6s → 12s → 24s → 30s (max)
            reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
          }
        };
      } catch (e) {
        console.log("Error in Global WebSocket setup:", e);
        if (active) {
          reconnectTimer = setTimeout(connectWS, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
        }
      }
    };

    connectWS();

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED || wsRef.current.readyState === WebSocket.CLOSING) {
          connectWS();
        }
      }
    });

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      appStateSub.remove();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);
}

export function AlignedTabs() {
  useGlobalWebSocket();
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: [styles.tabBar, { height: 60 + insets.bottom, paddingBottom: 8 + insets.bottom }],
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.muted,
        tabBarLabel: ({ focused, color }) => {
          const item = NAV_ITEMS.find(n => n.name === route.name);
          return (
            <Text style={[styles.tabLabel, { color }]}>
              {item?.label.toUpperCase()}
            </Text>
          );
        },
        tabBarIcon: ({ focused, color }) => {
          const item = NAV_ITEMS.find(n => n.name === route.name);
          return (
            <View style={styles.tabIconWrap}>
              {focused && <View style={styles.tabIndicator} />}
              <Text style={[styles.tabMark, { color }]}>{item?.mark}</Text>
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Connect" component={ConnectScreen} />
      <Tab.Screen name="Dates" component={DatesScreen} />
      <Tab.Screen name="Thread" component={ThreadScreen} />
      <Tab.Screen name="Future" component={FutureScreen} />
      <Tab.Screen name="Map" component={MapScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.bone,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
    height: 60,
    paddingBottom: 8,
    paddingTop: 0,
  },
  tabIconWrap: { alignItems: 'center', position: 'relative' },
  tabIndicator: {
    position: 'absolute',
    top: -10,
    width: 24,
    height: 2,
    backgroundColor: Colors.accent,
    borderRadius: 1,
  },
  tabMark: { fontSize: 15, lineHeight: 20 },
  tabLabel: {
    fontFamily: Fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 2,
  },
});