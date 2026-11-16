// Setup global variables for React Native in Jest
global.__DEV__ = true;

// Mock environment variables
process.env.EXPO_PUBLIC_SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || "https://mock-project.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "mock-anon-key-12345";

// Mock react-native-url-polyfill
jest.mock("react-native-url-polyfill/auto", () => {});

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

// Mock expo-router
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useSegments: () => ["(admin)"],
  Link: "Link",
}));

// Mock safe area insets
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }) => children,
}));

// Mock expo-status-bar (modul native, tidak tersedia di Jest)
jest.mock("expo-status-bar", () => ({
  StatusBar: () => null,
}));

// Mock vector icons
jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const IoniconsMock = ({ name, ...props }) =>
    React.createElement("span", { "data-icon": name, ...props }, name || "icon");
  return {
    Ionicons: IoniconsMock,
  };
});

// Mock NetInfo
jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
  useNetInfo: jest.fn(() => ({ isConnected: true, isInternetReachable: true })),
}));

// Mock react-native-svg (modul native, tidak tersedia di Jest)
jest.mock("react-native-svg", () => {
  const React = require("react");
  const SvgMock = ({ testID, ...props }) => React.createElement("svg", props, props.children);
  return {
    __esModule: true,
    default: SvgMock,
    Svg: SvgMock,
    Path: (props) => React.createElement("path", props),
    Circle: (props) => React.createElement("circle", props),
    Rect: (props) => React.createElement("rect", props),
    Line: (props) => React.createElement("line", props),
    Polyline: (props) => React.createElement("polyline", props),
    Polygon: (props) => React.createElement("polygon", props),
    G: (props) => React.createElement("g", props),
  };
});
