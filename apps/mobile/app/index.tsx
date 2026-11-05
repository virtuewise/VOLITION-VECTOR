import { StyleSheet, Text, View } from "react-native";
export default function Index() {
  return (
    <View style={s.container}>
      <Text style={s.brand}>VOLITION VECTOR</Text>
      <Text style={s.title}>Discover your direction.</Text>
      <Text style={s.copy}>
        A global opportunity ecosystem built around capability, trust and fair
        access.
      </Text>
      <Text style={s.status}>MOBILE FOUNDATION · UNDER DEVELOPMENT</Text>
    </View>
  );
}
const s = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 28,
    backgroundColor: "#080d1b",
  },
  brand: {
    color: "#9db6ff",
    fontSize: 12,
    letterSpacing: 4,
    fontWeight: "700",
  },
  title: {
    color: "#f4f7ff",
    fontSize: 40,
    lineHeight: 46,
    fontWeight: "700",
    marginTop: 28,
  },
  copy: { color: "#aab6ce", fontSize: 16, lineHeight: 26, marginTop: 20 },
  status: { color: "#8798bb", fontSize: 10, letterSpacing: 2, marginTop: 42 },
});
