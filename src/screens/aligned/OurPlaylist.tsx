import React, { useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { Colors } from "../../constants/colors";
import { AppText } from "../../components/ui/AppText";
import { AppButton } from "../../components/ui/AppButton";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { AppTextInput } from "../../components/ui/AppTextInput";

const playlistTracks = [
  {
    title: "Pink + White",
    artist: "Frank Ocean",
    album: "Blonde",
    addedBy: "Amanda",
    time: "2 MIN AGO",
  },
  {
    title: "Your Power",
    artist: "Billie Eilish",
    album: "Happier Than Ever",
    addedBy: "Lou",
    time: "YESTERDAY",
  },
  {
    title: "Flowers in Your Hair",
    artist: "The Lumineers",
    album: "The Lumineers",
    addedBy: "Amanda",
    time: "3 DAYS AGO",
  },
];

const OurPlaylist: React.FC = () => {
  const [playlistSheet, setPlaylistSheet] = useState(false);
  const [addTrackSheet, setAddTrackSheet] = useState(false);
  const [searchText, setSearchText] = useState("");

  // Service State
  const [louService, setLouService] = useState("Spotify");
  const [amandaService, setAmandaService] = useState("Apple Music");

  const serviceColor = (service: string) =>
    service === "Spotify" ? "#1DB954" : "#E06C6C";
  const serviceInitial = (service: string) =>
    service === "Spotify" ? "S" : "A";
  const cycleService = (current: string) =>
    current === "Spotify" ? "Apple Music" : "Spotify";

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <AppText variant="mono" style={styles.headerText}>
          OUR PLAYLIST
        </AppText>
        <AppText variant="mono" style={styles.tracksText}>
          7 TRACKS
        </AppText>
      </View>

      {/* Title */}
      <AppText variant="display" size={35} style={styles.title}>
        Songs for{" "}
        <AppText variant="serifItalic" size={32} style={{ color: "#E06C6C" }}>
          us.
        </AppText>
      </AppText>

      <AppText
        variant="serifItalic"
        size={13}
        color={Colors.cream}
        style={styles.subtitle}
      >
        Synced across Spotify, Apple Music & YouTube Music.
      </AppText>

      {/* Tracks */}
      <ScrollView
        style={styles.tracksContainer}
        showsVerticalScrollIndicator={false}
      >
        {playlistTracks.map((track, index) => (
          <View key={index} style={styles.trackCard}>
            <View style={styles.trackLeft}>
              <View style={styles.musicIcon}>
                <AppText style={{ color: "#fff", fontSize: 18 }}>♪</AppText>
              </View>
              <View>
                <AppText variant="heading" size={14} color="#fff">
                  {track.title}
                </AppText>
                <AppText
                  variant="serifItalic"
                  color={Colors.light}
                  style={{ fontSize: 12 }}
                >
                  {track.artist} • added by {track.addedBy}
                </AppText>
              </View>
            </View>

            <View style={styles.letters}>
              <View
                style={[styles.letterCircle, { backgroundColor: "#4CAF50" }]}
              >
                <AppText style={styles.letterText}>S</AppText>
              </View>
              <View
                style={[styles.letterCircle, { backgroundColor: "#9A232F" }]}
              >
                <AppText style={styles.letterText}>A</AppText>
              </View>
              <View
                style={[styles.letterCircle, { backgroundColor: "#9C0F0E" }]}
              >
                <AppText style={styles.letterText}>Y</AppText>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Bottom Buttons */}
      <View style={styles.bottomButtons}>
        <AppButton
          size="lg"
          style={styles.openButton}
          textStyle={{ color: "#000" }}
          onPress={() => setPlaylistSheet(true)}
        >
          OPEN PLAYLIST
        </AppButton>

        <AppButton
          variant="solid"
          size="lg"
          style={styles.addButton}
          onPress={() => setAddTrackSheet(true)}
        >
          + ADD
        </AppButton>
      </View>

      {/* ====================== SONGS FOR US BOTTOMSHEET ====================== */}
      <BottomSheet
        open={playlistSheet}
        onClose={() => setPlaylistSheet(false)}
        kicker="SHARED ACROSS SERVICES"
        title="Songs for us."
      >
        <View>
          {/* Linked Services */}
          <View style={bs.section}>
            <AppText variant="mono" style={bs.label}>
              LINKED SERVICES
            </AppText>
            <View style={bs.servicesCard}>
              {/* Lou */}
              <View style={bs.serviceRow}>
                <View
                  style={[
                    bs.serviceCircle,
                    { backgroundColor: serviceColor(louService) },
                  ]}
                >
                  <AppText style={bs.serviceInitial}>
                    {serviceInitial(louService)}
                  </AppText>
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="mono" style={bs.personLabel}>
                    LOU
                  </AppText>
                  <AppText
                    variant="heading"
                    size={15}
                    style={{ color: "#1D1815" }}
                  >
                    {louService}
                  </AppText>
                </View>
                <Pressable
                  style={bs.switchBtn}
                  onPress={() => setLouService(cycleService(louService))}
                >
                  <AppText variant="mono" style={bs.switchText}>
                    SWITCH
                  </AppText>
                </Pressable>
              </View>

              {/* Amanda */}
              <View style={bs.serviceRow}>
                <View
                  style={[
                    bs.serviceCircle,
                    { backgroundColor: serviceColor(amandaService) },
                  ]}
                >
                  <AppText style={bs.serviceInitial}>
                    {serviceInitial(amandaService)}
                  </AppText>
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="mono" style={bs.personLabel}>
                    AMANDA
                  </AppText>
                  <AppText
                    variant="heading"
                    size={15}
                    style={{ color: "#1D1815" }}
                  >
                    {amandaService}
                  </AppText>
                </View>
                <Pressable
                  style={bs.switchBtn}
                  onPress={() => setAmandaService(cycleService(amandaService))}
                >
                  <AppText variant="mono" style={bs.switchText}>
                    SWITCH
                  </AppText>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Add Track Button */}
          <Pressable
            style={bs.addTrackBtn}
            onPress={() => {
              setPlaylistSheet(false);
              setAddTrackSheet(true);
            }}
          >
            <AppText variant="mono" style={bs.addTrackBtnText}>
              + ADD A TRACK
            </AppText>
            <AppText style={bs.addTrackArrow}>→</AppText>
          </Pressable>

          {/* Track List */}
          <AppText
            variant="mono"
            style={[bs.label, { paddingHorizontal: 16, marginTop: 8 }]}
          >
            7 TRACKS
          </AppText>

          <View style={{ marginTop: 8 }}>
            {playlistTracks.map((track, i) => (
              <View key={i} style={bs.trackRow}>
                <AppText variant="mono" style={bs.trackNum}>
                  {String(i + 1).padStart(2, "0")}
                </AppText>
                <View style={bs.trackIcon}>
                  <AppText style={{ color: "#fff", fontSize: 15 }}>♪</AppText>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText
                    variant="heading"
                    size={13}
                    style={{ color: "#1D1815" }}
                    numberOfLines={1}
                  >
                    {track.title}
                  </AppText>
                  <AppText
                    variant="serifItalic"
                    size={11}
                    style={{ color: "#7A6E67" }}
                    numberOfLines={1}
                  >
                    {track.artist} · {track.album}
                  </AppText>
                  <AppText variant="mono" style={bs.trackMeta}>
                    {track.addedBy} · {track.time}
                  </AppText>
                </View>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <View
                    style={[
                      bs.serviceCircle,
                      { width: 18, height: 18, backgroundColor: "#4CAF50" },
                    ]}
                  >
                    <AppText style={{ color: "#fff", fontSize: 9 }}>S</AppText>
                  </View>
                  <View
                    style={[
                      bs.serviceCircle,
                      { width: 18, height: 18, backgroundColor: "#E06C6C" },
                    ]}
                  >
                    <AppText style={{ color: "#fff", fontSize: 9 }}>A</AppText>
                  </View>
                  <View
                    style={[
                      bs.serviceCircle,
                      { width: 18, height: 18, backgroundColor: "#FA243C" },
                    ]}
                  >
                    <AppText style={{ color: "#fff", fontSize: 9 }}>Y</AppText>
                  </View>
                  <Pressable>
                    <AppText style={{ color: "#B0A59C", fontSize: 18 }}>
                      ×
                    </AppText>
                  </Pressable>
                </View>

                
              </View>
            ))}
            <View style={styles.howItWorks}>
                  <AppText
                    variant="smallCaps"
                    color={Colors.accent}
                    style={{ fontSize: 12, marginBottom: 8 }}
                  >
                    HOW IT WORKS
                  </AppText>
                  <AppText
                    variant="serifItalic"
                    size={14}
                    color={Colors.muted}
                    style={{ lineHeight: 20 }}
                  >
                   Tracks are matched via ISRC codes across services. When one of you adds a song, it's added to both of your accounts — so you can listen on whichever service you prefer.
                  </AppText>
                </View>
          </View>
        </View>
      </BottomSheet>

      {/* ====================== ADD A TRACK BOTTOMSHEET ====================== */}
      <BottomSheet
        open={addTrackSheet}
        onClose={() => setAddTrackSheet(false)}
        kicker="SEARCH ACROSS SERVICES"
        title="Add a track"
      >
        <View style={{marginTop:15}}>
       
            <AppTextInput
            placeholder="Search by song, artist, or album"
            value={searchText}
            onChangeText={setSearchText}
          />
      

          <View style={bs.section1}>
            <AppText variant="mono" style={bs.label}>
              RECENTLY ADDED BY AMANDA
            </AppText>
            <View style={bs.recentCard}>
              {playlistTracks.map((track, i) => (
                <React.Fragment key={i}>
                  <Pressable style={bs.recentRow}>
                    <View style={bs.recentIcon}>
                      <AppText style={{ color: "#fff", fontSize: 15 }}>
                        ♪
                      </AppText>
                    </View>
                    <View>
                      <AppText
                        variant="heading"
                        size={14}
                        style={{ color: "#1D1815" }}
                      >
                        {track.title}
                      </AppText>
                      <AppText
                        variant="serifItalic"
                        size={12}
                        style={{ color: "#7A6E67" }}
                      >
                        {track.artist}
                      </AppText>
                    </View>
                  </Pressable>
                  {i < playlistTracks.length - 1 && (
                    <View style={bs.hairline} />
                  )}
                </React.Fragment>
              ))}
            </View>
          </View>

          <View
            style={{
              alignItems: "center",
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 32,
              backgroundColor:'#F2EADF',
              borderRadius:8,
            }}
          >
            <AppText
              variant="serifItalic"
              size={13}
              color={Colors.muted}
              style={{ textAlign: "center",  }}
            >
              Start typing to search for a track.{"\n"}Results shown from all 3
              services.
            </AppText>
          </View>
        </View>
      </BottomSheet>
    </View>
  );
};

export default OurPlaylist;

// BottomSheet Specific Styles
const bs = StyleSheet.create({
  section: {
    backgroundColor: "#E6DED1",
    padding: 15,
    borderRadius: 10,
    marginTop: 15,
    marginBottom: 14,
  },
   section1: {
   
   
    borderRadius: 10,
    marginTop: 15,
    marginBottom: 14,
  },
  label: {
    fontSize: 8,
    letterSpacing: 1.2,
    color: "#9A8F87",
    marginBottom: 8,
  },
  servicesCard: {
    flexDirection: "row",
    gap: 6,
    borderRadius: 14,
    overflow: "hidden",
  },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: "#F2EDE3",
    borderWidth: 1,
    borderColor: "#E8E1D6",
    borderRadius: 10,
  },
  serviceCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceInitial: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  personLabel: {
    fontSize: 8,
    letterSpacing: 1,
    color: "#9A8F87",
    marginBottom: 1,
  },
  switchBtn: {},
  switchText: {
    fontSize: 8,
    letterSpacing: 1,
    color: Colors.accent,
  },
  hairline: {
    height: 1,
    backgroundColor: "#E8E1D6",
    marginHorizontal: 14,
  },
  addTrackBtn: {
    marginTop: 10,
    marginBottom: 16,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  addTrackBtnText: {
    color: Colors.white,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  addTrackArrow: {
    color: "#fff",
    fontSize: 18,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderRadius: 10,
    backgroundColor: "#EAE2D4",
    marginVertical: 5,
    gap: 8,
  },
  trackNum: {
    fontSize: 9,
    color: "#B0A59C",
    letterSpacing: 0.5,
    width: 18,
  },
  trackIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#ad4e39",
    alignItems: "center",
    justifyContent: "center",
  },
  trackMeta: {
    fontSize: 8,
    letterSpacing: 0.8,
    color: "#B0A59C",
    marginTop: 2,
  },
  howItWorks: {
    backgroundColor: "#F1E4DA",
    padding: 16,
    borderRadius: 12,
  },
  recentCard: {
    borderRadius: 14,
    overflow: "hidden",
  

  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
      backgroundColor: "#E6DED1",
      borderRadius:8,
    marginVertical:8,
    padding: 14,
    
  },
  recentIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#ad4e39",
    alignItems: "center",
    justifyContent: "center",
  },
});

// Main Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginHorizontal: -20,
    backgroundColor: "#1D1815",
    padding: 20,
    marginVertical: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
   howItWorks: {
    backgroundColor: "#F1E4DA",
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
  },
  headerText: { fontSize: 10, letterSpacing: 1, color: Colors.muted },
  tracksText: { fontSize: 10, letterSpacing: 1, color: Colors.muted },
  title: { color: "#fff", marginBottom: 4 },
  subtitle: { marginTop: -7, marginBottom: 24 },
  tracksContainer: { flex: 1 },
  trackCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#332e29",
    padding: 10,
    borderRadius: 14,
    marginBottom: 10,
  },
  trackLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  musicIcon: {
    width: 35,
    height: 35,
    borderRadius: 8,
    backgroundColor: "#ad4e39",
    alignItems: "center",
    justifyContent: "center",
  },
  letters: { flexDirection: "row", gap: 4 },
  letterCircle: {
    width: 20,
    height: 20,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  letterText: { color: "#fff", fontSize: 8, fontWeight: "600" },
  bottomButtons: { flexDirection: "row", gap: 12, marginTop: 12 },
  openButton: { flex: 1, backgroundColor: "#F2EDE3" },
  addButton: { flex: 0.2, backgroundColor: "#B8553E" },
});
