# StrainEase iOS

Native SwiftUI companion for the StrainEase web app. Same Firebase project, same accounts.

**v1 slice:** email / Google / Apple sign-in, Find (recommend), strain detail.

## Open the project

```bash
cd ios
xcodegen generate
open StrainWise.xcodeproj
```

Xcode 16+ / iOS 17+. Select the **StrainWise** scheme (display name **StrainEase**) and an iPhone simulator.

## Firebase

The iOS app is registered in the same Firebase project as the web client (`strainfinder-84a9b`, bundle `com.strainwise.app`). `GoogleService-Info.plist` ships in the target. **Do not** point Firebase at the web `GOOGLE_APP_ID` (`:web:`) — the iOS SDK aborts on launch.

Email/password works against existing accounts. For Google and Apple on a device / TestFlight:

1. Authentication → Sign-in method → enable **Apple** (Google is already on).
2. Apple Developer → Identifiers → `com.strainwise.app` → enable Sign in with Apple.
3. If you re-download the plist, update `GIDClientID` and the reversed client URL scheme in `Info.plist` to match.

Firebase Auth stores the session in the iOS Keychain. The app entitlements include **Keychain Sharing** (`$(AppIdentifierPrefix)com.strainwise.app`). If sign-in fails with a keychain error, delete the app from the simulator/device and rebuild — leftover items from a previous bundle or a missing keychain group cause `AuthErrorCode.keychainError` (17995).

## Regenerating

`StrainWise.xcodeproj` is generated. Edit `project.yml`, then `xcodegen generate`. Don’t hand-edit the pbxproj.
