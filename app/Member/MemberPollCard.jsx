import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { fetchActivePoll, voteForPoll } from "../../@poll.js";

function isErrorMessage(err) {
  return typeof err === "string" && err.trim().length > 0;
}

export default function MemberPollCard({ date = new Date() }) {
  const dateKey = useMemo(() => {
    try {
      const d = date instanceof Date ? date : new Date(date);
      return d.toISOString().slice(0, 10);
    } catch {
      return String(date ?? "");
    }
  }, [date]);

  const [visible, setVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [poll, setPoll] = useState(null);
  const [errorText, setErrorText] = useState("");

  const [selectedOptionKey, setSelectedOptionKey] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [successText, setSuccessText] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setErrorText("");
      setSuccessText("");
      try {
        // Use the stable YYYY-MM-DD key so we don't refetch just because
        // `date` object identity changed between renders.
        const dateForQuery = dateKey
          ? new Date(`${dateKey}T12:00:00Z`)
          : new Date();
        const active = await fetchActivePoll({ date: dateForQuery });
        if (!mounted) return;
        setPoll(active);
        setSelectedOptionKey(active?.myVote ?? null);
      } catch (err) {
        if (!mounted) return;
        setPoll(null);
        setSelectedOptionKey(null);
        const message = isErrorMessage(err?.message) ? err.message : "";
        setErrorText(message || "Failed to load poll.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [dateKey]);

  const hasVoted = !!poll?.myVote;
  const canVote = !!poll && !hasVoted && !!selectedOptionKey && !submitting;

  const onSelectOption = (key) => {
    if (hasVoted) return; // backend only allows one vote per day
    setSelectedOptionKey(key);
    setErrorText("");
    setSuccessText("");
  };

  const onPressVote = async () => {
    if (!poll?.id || !selectedOptionKey) return;

    setSubmitting(true);
    setErrorText("");
    setSuccessText("");

    try {
      const updated = await voteForPoll(poll.id, selectedOptionKey);
      setPoll(updated);
      setSelectedOptionKey(updated?.myVote ?? selectedOptionKey);
      setSuccessText("Thanks for voting!");
    } catch (err) {
      const message = err?.response?.data?.message || err?.message;
      setErrorText(isErrorMessage(message) ? message : "Failed to submit vote.");
    } finally {
      setSubmitting(false);
    }
  };

  const onPressCancel = () => {
    setErrorText("");
    setSuccessText("");
    if (hasVoted) {
      // No close X button in the design; use Cancel to hide the poll.
      setVisible(false);
      return;
    }
    setSelectedOptionKey(null);
  };

  if (!visible) return null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Poll</Text>
      </View>

      {loading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator color="#F97316" />
          <Text style={styles.mutedText}>Loading poll…</Text>
        </View>
      ) : poll ? (
        <>
          <Text style={styles.questionText}>{poll.question}</Text>

          <View style={styles.optionsWrap}>
            {poll.options.map((opt) => {
              const selected = opt.key === selectedOptionKey;

              return (
                <TouchableOpacity
                  key={opt.key}
                  activeOpacity={0.85}
                  onPress={() => onSelectOption(opt.key)}
                  disabled={hasVoted || submitting}
                  style={[
                    styles.optionBox,
                    selected && styles.optionBoxSelected,
                    hasVoted && !selected && styles.optionBoxDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      selected && styles.optionLabelSelected,
                      hasVoted && !selected && styles.optionLabelDisabled,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}
          {!!successText && <Text style={styles.successText}>{successText}</Text>}

          <View style={styles.actionsRow}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={onPressVote}
              disabled={!canVote}
              style={[
                styles.voteButton,
                !canVote && styles.voteButtonDisabled,
              ]}
            >
              <Text style={styles.voteButtonText}>Vote</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={onPressCancel}
              style={styles.cancelButton}
              disabled={submitting}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No active polls available</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
  },

  mutedText: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },

  questionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6B7280",
    marginTop: 10,
    marginBottom: 14,
  },

  optionsWrap: {
    gap: 10,
  },

  optionBox: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },

  optionBoxSelected: {
    backgroundColor: "#FFF7ED",
    borderColor: "#F97316",
  },

  optionBoxDisabled: {
    opacity: 0.85,
  },

  optionLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },

  optionLabelSelected: {
    color: "#9A3412",
  },

  optionLabelDisabled: {
    color: "#6B7280",
  },

  stateWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },

  errorText: {
    marginTop: 10,
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "800",
  },

  successText: {
    marginTop: 10,
    color: "#059669",
    fontSize: 13,
    fontWeight: "800",
  },

  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
  },

  voteButton: {
    flex: 1,
    height: 46,
    backgroundColor: "#F97316",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  voteButtonDisabled: {
    backgroundColor: "#FDBA74",
    opacity: 0.95,
  },

  voteButtonText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  cancelButton: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  cancelButtonText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#374151",
  },

  emptyWrap: {
    paddingVertical: 18,
    alignItems: "center",
  },

  emptyText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "800",
  },
});

