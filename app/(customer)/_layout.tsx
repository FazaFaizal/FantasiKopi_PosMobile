import React from 'react';
import { Stack } from 'expo-router';

export default function CustomerLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="product"
        options={{
          title: 'Katalog Menu',
        }}
      />
    </Stack>
  );
}

