# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## OTA Updates

This app uses Expo Updates with a production-only rollout policy.

- Update checks run when the app returns to foreground.
- Users can manually trigger checks from Settings.
- Downloaded updates are applied only when the user taps **Restart Now**.

### Publish Production OTA

```bash
npm run update:production -- --message "Your release message"
```

Equivalent command:

```bash
eas update --channel production --message "Your release message"
```

### Compatibility Rules

- `runtimeVersion` uses `appVersion` policy.
- OTA updates apply only to builds with matching app version/runtime.
- Native changes still require a new binary build and version bump.

### Environment Policy

- OTA publishes are production only.
- `development` and `preview` channels should not receive OTA publishes.
- Dev/preview changes are shipped via new builds.

### When To Use OTA vs New Build

- Use OTA for JavaScript/UI/logic changes without native dependency/config changes.
- Use a new build for native module changes, `app.json` native config changes, SDK upgrades, or any iOS/Android project-level changes.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
