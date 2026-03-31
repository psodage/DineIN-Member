import React, { useState } from "react";
import {
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Alert,
} from "react-native";
import axios from "axios";
import { useRouter } from "expo-router";
import { API_BASE_URL } from "../../config";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../LanguageContext";
import LanguageToggle from "../../components/LanguageToggle";
import { Ionicons } from "@expo/vector-icons";

export default function MemberLoginScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const cleanEmail = String(email ?? "").trim();
    const cleanPassword = String(password ?? "").trim();

    if (!cleanEmail) {
      Alert.alert(
        t("alert_error"),
        t("member_login_missing_fields") || "Please enter email and password"
      );
      return;
    }

    // Validate the password field (not the phone/email field) before calling the API.
    if (!cleanPassword) {
      Alert.alert(
        t("alert_error"),
        t("member_login_missing_password") || "Please enter password"
      );
      return;
    }

    try {
      setLoading(true);

      const res = await axios.post(`${API_BASE_URL}/api/auth/member-login`, {
        email: cleanEmail,
        password: cleanPassword,
      });

      await login(res.data.token, res.data.user);
      Alert.alert(t("alert_success"), t("login_success"));
      // Defer navigation so AuthProvider commits token before guarded screens mount
      // (otherwise dashboard can see stale isAuthenticated and redirect home).
      setTimeout(() => router.replace("/Member/MemberDashboard"), 0);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        t("member_login_failed_generic") ||
        t("login_failed_generic");
      Alert.alert(t("alert_error"), msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
    
      <Image
        source={require("../../assets/images/logo2.png")}
        style={styles.logoImage}
        resizeMode="contain"
      />

      <Text style={styles.title}>{t("login_title")}</Text>

      <Text style={styles.subtitle}>{t("email_label")}</Text>
      <TextInput
        style={styles.input}
        placeholder={t("email_placeholder")}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
      />

      <Text style={styles.subtitle}>{t("password_label")}</Text>
      <View style={styles.passwordRow}>
        <TextInput
          style={[styles.input, styles.passwordTextInput]}
          placeholder={t("password_placeholder")}
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity
          style={styles.passwordToggle}
          onPress={() => setShowPassword((v) => !v)}
          activeOpacity={0.85}
        >
          <Ionicons
            name={showPassword ? "eye-off" : "eye"}
            size={20}
            color="#6B7280"
          />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>{t("login_title")}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.push("/Member/MemberForgotPasswordScreen")}
      >
        <Text style={styles.footerText}>
          {t("footer_forgot_prefix")}{" "}
          <Text style={styles.link}>{t("footer_forgot_link")}</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  logoImage: {
    marginTop: 100,
    width: 120,
    height: 80,
    marginBottom: 24,
    marginLeft: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 24,
    color: "#111827",
    marginLeft: 10,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4B5563",
    marginBottom: 6,
    marginLeft: 10,
  },
  input: {
    width: "95%",
    marginLeft: 10,
    height: 48,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
    backgroundColor: "#F9FAFB",
  },
  passwordRow: {
    width: "95%",
    marginLeft: 10,
    marginBottom: 16,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    backgroundColor: "#F9FAFB",
  },
  passwordTextInput: {
    width: "100%",
    marginLeft: 0,
    marginBottom: 0,
    height: 48,
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    flex: 1,
  },
  passwordToggle: {
    paddingLeft: 8,
    paddingVertical: 8,
  },
  button: {
    marginLeft: 10,
    marginTop: 8,
    height: 48,
    width: "95%",
    borderRadius: 12,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  footerText: {
    marginTop: 16,
    marginLeft: 10,
    fontSize: 13,
    color: "#6B7280",
  },
  link: {
    color: "red",
    fontWeight: "600",
  },
});

