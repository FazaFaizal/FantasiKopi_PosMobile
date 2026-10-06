const React = require('react');

const Platform = {
  OS: 'ios',
  select: (objs) => objs.ios || objs.default,
};

const StyleSheet = {
  create: (styles) => styles,
  flatten: (styles) => styles,
};

const Alert = {
  alert: jest.fn(),
};

const AppState = {
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  currentState: 'active',
};

const Appearance = {
  getColorScheme: () => 'light',
  setColorScheme: jest.fn(),
  addChangeListener: jest.fn(() => ({ remove: jest.fn() })),
};

const Dimensions = {
  get: () => ({ width: 375, height: 812, scale: 2, fontScale: 1 }),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
};

function createMockComponent(name) {
  const Component = (props) => {
    const { children, className, placeholder } = props || {};
    return React.createElement(
      'div',
      {
        'data-component': name,
        className: className || undefined,
        placeholder: placeholder || undefined,
      },
      children
    );
  };
  Component.displayName = name;
  return Component;
}

module.exports = {
  Platform,
  StyleSheet,
  Alert,
  AppState,
  Appearance,
  Dimensions,
  View: createMockComponent('View'),
  Text: createMockComponent('Text'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  TextInput: createMockComponent('TextInput'),
  ScrollView: createMockComponent('ScrollView'),
  FlatList: createMockComponent('FlatList'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  Image: createMockComponent('Image'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
};
