import { Redirect } from 'expo-router';

export default function Index() {
  // The root layout handles session redirection logic.
  // This file is just a placeholder entry point that forces a layout re-render.
  return <Redirect href="/(auth)/login" />;
}
