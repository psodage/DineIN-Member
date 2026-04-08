import { useEffect } from "react";
import {
  View,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/AuthContext";
import LanguageToggle from "../components/LanguageToggle";

export default function Index() {
  const router = useRouter();
  const {
    isAuthenticated,
    loading,
  } = useAuth() as {
    isAuthenticated: boolean;
    loading: boolean;
  };

  useEffect(() => {
    if (loading) {
      return;
    }

    if (isAuthenticated) {
      router.replace("/Member/MemberDashboard" as any);
      return;
    }

    router.replace("/WelcomeScreen" as any);
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#111827" />
      </View>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <View style={styles.loading}>
      <LanguageToggle />
      <ActivityIndicator size="large" color="#111827" />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
  },
});
