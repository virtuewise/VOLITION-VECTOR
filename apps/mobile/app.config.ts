import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Volition Vector',
  slug: 'volition-vector',
  scheme: 'volitionvector',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  plugins: ['expo-router'],
};

export default config;
