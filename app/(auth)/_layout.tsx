import React from 'react';
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
    >
      <Stack.Screen
        name="login"
        options={{
          title: 'Masuk Akun',
        }}
      />
      <Stack.Screen
        name="register"
        options={{
          title: 'Daftar Akun',
        }}
      />
      <Stack.Screen
        name="inactive"
        options={{
          title: 'Akun Nonaktif',
        }}
      />
      <Stack.Screen
        name="unauthorized"
        options={{
          title: 'Akses Dibatasi',
        }}
      />
    </Stack>
  );
}

