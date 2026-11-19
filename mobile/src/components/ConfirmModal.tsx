import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  description: string;
  scopeNote?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmModal({
  visible,
  title,
  description,
  scopeNote,
  confirmLabel = "Xác nhận xóa",
  cancelLabel = "Hủy",
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onCancel();
      }}
    >
      <Pressable
        style={styles.backdrop}
        onPress={() => {
          if (!busy) onCancel();
        }}
      >
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          {scopeNote ? (
            <View style={styles.scopeBox}>
              <Text style={styles.scopeText}>{scopeNote}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity
              disabled={busy}
              onPress={onCancel}
              style={[styles.btn, styles.cancelBtn, busy && { opacity: 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={busy}
              onPress={onConfirm}
              style={[styles.btn, styles.confirmBtn, busy && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#0f172a",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    padding: 20,
    gap: 12,
  },
  title: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
  },
  description: {
    color: "#cbd5e1",
    fontSize: 13,
    lineHeight: 20,
  },
  scopeBox: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
    borderRadius: 12,
    padding: 10,
  },
  scopeText: {
    color: "#fde68a",
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 6,
  },
  btn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  cancelText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  confirmBtn: {
    backgroundColor: "#e11d48",
  },
  confirmText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
});
