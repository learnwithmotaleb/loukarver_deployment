import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Colors } from "../../constants/colors";
import { AppText } from "./AppText";

interface AppDateTimePickerModalProps {
  visible: boolean;
  mode: "date" | "time";
  value: Date;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
  title?: string;
}

export const AppDateTimePickerModal: React.FC<AppDateTimePickerModalProps> = ({
  visible,
  mode,
  value,
  onConfirm,
  onCancel,
  title,
}) => {
  const [tempDate, setTempDate] = useState<Date>(value);

  useEffect(() => {
    if (visible) {
      setTempDate(value instanceof Date && !isNaN(value.getTime()) ? new Date(value) : new Date());
    }
  }, [visible, value]);

  // Android: Native system dialogs
  if (Platform.OS === "android") {
    if (!visible) return null;
    return (
      <DateTimePicker
        value={value instanceof Date && !isNaN(value.getTime()) ? value : new Date()}
        mode={mode}
        display="default"
        is24Hour={false}
        onChange={(event, selectedDate) => {
          if (event.type === "set" && selectedDate) {
            onConfirm(selectedDate);
          }
          onCancel();
        }}
      />
    );
  }

  // Web fallback modal
  if (Platform.OS === "web") {
    if (!visible) return null;

    const handleWebConfirm = () => {
      onConfirm(tempDate);
      onCancel();
    };

    const handleDateInput = (val: string) => {
      if (!val) return;
      const [year, month, day] = val.split("-").map(Number);
      const next = new Date(tempDate);
      next.setFullYear(year, month - 1, day);
      setTempDate(next);
    };

    const handleTimeInput = (val: string) => {
      if (!val) return;
      const [hour, min] = val.split(":").map(Number);
      const next = new Date(tempDate);
      next.setHours(hour, min, 0, 0);
      setTempDate(next);
    };

    const dateVal = `${tempDate.getFullYear()}-${String(tempDate.getMonth() + 1).padStart(2, "0")}-${String(tempDate.getDate()).padStart(2, "0")}`;
    const timeVal = `${String(tempDate.getHours()).padStart(2, "0")}:${String(tempDate.getMinutes()).padStart(2, "0")}`;

    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
          <View style={styles.webContainer}>
            <View style={styles.header}>
              <Pressable onPress={onCancel} hitSlop={10}>
                <AppText style={styles.cancelText}>Cancel</AppText>
              </Pressable>
              <AppText variant="smallCaps" style={styles.titleText}>
                {title || (mode === "time" ? "Select Time" : "Select Date")}
              </AppText>
              <Pressable onPress={handleWebConfirm} hitSlop={10}>
                <AppText style={styles.doneText}>Done</AppText>
              </Pressable>
            </View>

            <View style={styles.pickerBody}>
              {mode === "date" ? (
                <input
                  type="date"
                  value={dateVal}
                  onChange={(e) => handleDateInput(e.target.value)}
                  style={styles.webInput}
                />
              ) : (
                <input
                  type="time"
                  value={timeVal}
                  onChange={(e) => handleTimeInput(e.target.value)}
                  style={styles.webInput}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // iOS modal with wheel spinner & explicit Done/Cancel controls
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.iosContainer}>
          <View style={styles.header}>
            <Pressable onPress={onCancel} hitSlop={12}>
              <AppText style={styles.cancelText}>Cancel</AppText>
            </Pressable>
            <AppText variant="smallCaps" style={styles.titleText}>
              {title || (mode === "time" ? "Select Time" : "Select Date")}
            </AppText>
            <Pressable
              onPress={() => {
                onConfirm(tempDate);
                onCancel();
              }}
              hitSlop={12}
            >
              <AppText style={styles.doneText}>Done</AppText>
            </Pressable>
          </View>

          <View style={styles.pickerBody}>
            <DateTimePicker
              value={tempDate}
              mode={mode}
              display="spinner"
              themeVariant="light"
              is24Hour={false}
              onChange={(_, date) => {
                if (date) setTempDate(date);
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(26, 22, 20, 0.55)",
  },
  iosContainer: {
    backgroundColor: Colors.bone,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
    overflow: "hidden",
  },
  webContainer: {
    backgroundColor: Colors.bone,
    borderRadius: 20,
    marginHorizontal: 20,
    marginBottom: "auto",
    marginTop: "auto",
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: Colors.rule,
    overflow: "hidden",
    minWidth: 300,
    maxWidth: 400,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
    backgroundColor: Colors.cream,
  },
  cancelText: {
    fontSize: 15,
    color: Colors.muted,
  },
  titleText: {
    fontSize: 12,
    color: Colors.ink,
    letterSpacing: 1,
  },
  doneText: {
    fontSize: 15,
    color: Colors.accent,
    fontWeight: "700",
  },
  pickerBody: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  webInput: {
    fontSize: 20,
    padding: "10px 14px",
    borderRadius: 8,
    border: `1px solid ${Colors.rule}`,
    backgroundColor: "#fff",
    color: Colors.ink,
    outline: "none",
    width: "85%",
    marginTop: 10,
    marginBottom: 10,
  } as any,
});
