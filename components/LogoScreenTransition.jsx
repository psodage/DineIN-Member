import React, { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { usePathname } from "expo-router";

const LOGO = require("../assets/images/logo2.png");

/**
 * Plays a brief branded transition whenever the route pathname changes.
 * Mounted once in the root layout so it applies to all screens.
 */
export default function LogoScreenTransition() {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const logoTranslateX = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.92)).current;
  const skipNext = useRef(true);
  const animRef = useRef(null);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }

    animRef.current?.stop?.();
    overlayOpacity.setValue(0);
    logoOpacity.setValue(0);
    logoScale.setValue(0.92);
    logoTranslateX.setValue(-width * 0.55);

    const sweep = Animated.sequence([
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0.38,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(logoTranslateX, {
          toValue: 0,
          duration: 320,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(logoTranslateX, {
          toValue: width * 0.5,
          duration: 260,
          useNativeDriver: true,
        }),
      ]),
    ]);

    animRef.current = sweep;
    sweep.start();

    return () => {
      sweep.stop();
    };
  }, [pathname, width, overlayOpacity, logoOpacity, logoScale, logoTranslateX]);

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
      <Animated.View
        style={[
          styles.logoWrap,
          {
            opacity: logoOpacity,
            transform: [{ translateX: logoTranslateX }, { scale: logoScale }],
          },
        ]}
      >
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100000,
    elevation: 100000,
    justifyContent: "center",
    alignItems: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FAFAFA",
  },
  logoWrap: {
    width: 168,
    height: 168,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 152,
    height: 152,
  },
});
