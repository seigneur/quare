# Quare

A cross-platform monorepo containing Android, iOS, and Web client apps built with native/modern frameworks.

## Structure

```
apps/
  android/   # Kotlin + Jetpack Compose
  ios/       # Swift + SwiftUI
  web/       # Next.js 15 + TypeScript + Tailwind CSS
```

## Prerequisites

| Platform | Requirements |
|----------|-------------|
| Android  | Android Studio Hedgehog+, JDK 17, Android SDK 35 |
| iOS      | Xcode 15+, macOS, iOS 16+ simulator or device |
| Web      | Node.js 18+, pnpm / npm / yarn |

## Getting Started

### Android

```bash
cd apps/android
./gradlew assembleDebug
# Or open in Android Studio and click Run
```

### iOS

```bash
cd apps/ios
open Quare.xcodeproj
# Select a simulator and press Cmd+R in Xcode
```

### Web

```bash
cd apps/web
npm install
npm run dev
# Visit http://localhost:3000
```

## Tech Stack

- **Android** — Kotlin, Jetpack Compose, Material 3, compileSdk 35
- **iOS** — Swift 5.9, SwiftUI, NavigationStack, iOS 16+ deployment target
- **Web** — Next.js 15, React 19, TypeScript, Tailwind CSS 3

## License

MIT
